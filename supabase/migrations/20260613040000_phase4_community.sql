-- Phase 4 — Community feedback layer: comments, votes, flags, and admin signal views.
-- Every table here is additive. No community action can write to claims, entities,
-- relationships, or any canonical confidence column.

-- ---------------------------------------------------------------------------
-- Role helper: who may contribute community content.
-- `has_internal_access()` deliberately excludes the public `contributor` role,
-- so community writes use this broader check (contributor and every staff role).
-- ---------------------------------------------------------------------------
create or replace function public.has_community_access()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select role in ('contributor', 'viewer', 'editor', 'super_admin')
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 7.1 comments
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null
    check (target_type in ('entity', 'claim', 'source')),
  target_id uuid not null,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'needs_clarification')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comments_target_idx
  on public.comments (target_type, target_id, status);
create index if not exists comments_status_idx
  on public.comments (status, created_at);
create index if not exists comments_author_idx
  on public.comments (author_id);
create index if not exists comments_parent_idx
  on public.comments (parent_id);

alter table public.comments enable row level security;

-- Public can read approved comments.
drop policy if exists "comments public read approved" on public.comments;
create policy "comments public read approved"
  on public.comments for select
  using (status = 'approved');

-- Authors can read their own comments at any status.
drop policy if exists "comments own read" on public.comments;
create policy "comments own read"
  on public.comments for select
  to authenticated
  using (author_id = auth.uid());

-- Admins can read all comments.
drop policy if exists "comments admin read" on public.comments;
create policy "comments admin read"
  on public.comments for select
  to authenticated
  using (public.is_admin());

-- Contributors and above can insert their own comments.
drop policy if exists "comments contributor insert" on public.comments;
create policy "comments contributor insert"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid() and public.has_community_access());

-- Authors may edit their own comments while still pending.
drop policy if exists "comments own update pending" on public.comments;
create policy "comments own update pending"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid() and status = 'pending')
  with check (author_id = auth.uid() and status = 'pending');

-- Admins can update (approve / reject / request clarification).
drop policy if exists "comments admin update" on public.comments;
create policy "comments admin update"
  on public.comments for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.set_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at
before update on public.comments
for each row
execute function public.set_comments_updated_at();

create or replace function public.validate_comment_parent()
returns trigger
language plpgsql
as $$
declare
  parent_target_type text;
  parent_target_id uuid;
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select target_type, target_id, parent_id
  into parent_target_type, parent_target_id, parent_parent_id
  from public.comments
  where id = new.parent_id;

  if parent_target_type is null then
    raise exception 'Parent comment does not exist.';
  end if;

  if parent_parent_id is not null then
    raise exception 'Replies cannot be nested more than one level.';
  end if;

  if parent_target_type <> new.target_type or parent_target_id <> new.target_id then
    raise exception 'Reply target must match parent comment target.';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_validate_parent on public.comments;
create trigger comments_validate_parent
before insert or update of parent_id, target_type, target_id on public.comments
for each row
execute function public.validate_comment_parent();

-- ---------------------------------------------------------------------------
-- 7.2 content_votes
-- ---------------------------------------------------------------------------
create table if not exists public.content_votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null
    check (target_type in ('entity', 'claim', 'source')),
  target_id uuid not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_id)
);

create index if not exists content_votes_target_idx
  on public.content_votes (target_type, target_id);

alter table public.content_votes enable row level security;

-- Anyone can read raw votes (aggregates are also exposed via community_scores).
drop policy if exists "votes public read" on public.content_votes;
create policy "votes public read"
  on public.content_votes for select
  using (true);

-- Authenticated community users can cast their own vote.
drop policy if exists "votes authenticated insert" on public.content_votes;
create policy "votes authenticated insert"
  on public.content_votes for insert
  to authenticated
  with check (user_id = auth.uid() and public.has_community_access());

-- Users can change their own vote.
drop policy if exists "votes own update" on public.content_votes;
create policy "votes own update"
  on public.content_votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can remove their own vote.
drop policy if exists "votes own delete" on public.content_votes;
create policy "votes own delete"
  on public.content_votes for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7.3 content_flags
-- ---------------------------------------------------------------------------
create table if not exists public.content_flags (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null
    check (target_type in ('entity', 'claim', 'source', 'comment')),
  target_id uuid not null,
  reason text not null
    check (reason in (
      'factually_incorrect',
      'spam',
      'inappropriate',
      'duplicate',
      'needs_source',
      'other'
    )),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

create index if not exists content_flags_target_idx
  on public.content_flags (target_type, target_id, status);
create index if not exists content_flags_status_idx
  on public.content_flags (status, created_at);

alter table public.content_flags enable row level security;

-- Reporters can create their own flags.
drop policy if exists "flags authenticated insert" on public.content_flags;
create policy "flags authenticated insert"
  on public.content_flags for insert
  to authenticated
  with check (reporter_id = auth.uid() and public.has_community_access());

-- Reporters can read their own flags.
drop policy if exists "flags own read" on public.content_flags;
create policy "flags own read"
  on public.content_flags for select
  to authenticated
  using (reporter_id = auth.uid());

-- Admins manage all flags.
drop policy if exists "flags admin all" on public.content_flags;
create policy "flags admin all"
  on public.content_flags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7.4 community_scores view (computed on read; never stored)
-- ---------------------------------------------------------------------------
create or replace view public.community_scores as
select
  target_type,
  target_id,
  sum(value)::integer as community_score,
  count(*) filter (where value = 1)::integer as upvote_count,
  count(*) filter (where value = -1)::integer as downvote_count,
  count(*)::integer as total_votes
from public.content_votes
group by target_type, target_id;

grant select on public.community_scores to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7.5 open_flag_counts view (admin prioritization)
-- ---------------------------------------------------------------------------
create or replace view public.open_flag_counts as
select
  target_type,
  target_id,
  count(*)::integer as flag_count
from public.content_flags
where status = 'open'
group by target_type, target_id;

grant select on public.open_flag_counts to authenticated;

-- ---------------------------------------------------------------------------
-- Review queue signal aggregation (section 8.4).
-- For each source, sum the community signal of the published claims/entities
-- evidenced by that source, plus any flags/votes on the source itself.
-- Used purely to re-order the admin extraction review queue; never persisted.
-- ---------------------------------------------------------------------------
create or replace function public.get_review_queue_signals()
returns table (
  source_id uuid,
  flag_count integer,
  community_score integer
)
language sql
stable
security definer
set search_path = public
as $$
  with source_claims as (
    select distinct source_anchors.source_id, claim_evidence.claim_id
    from public.source_anchors
    join public.claim_evidence on claim_evidence.anchor_id = source_anchors.id
  ),
  source_entities as (
    select distinct source_claims.source_id, claim_entities.entity_id
    from source_claims
    join public.claim_entities on claim_entities.claim_id = source_claims.claim_id
  ),
  flag_rows as (
    select source_claims.source_id
    from source_claims
    join public.content_flags
      on content_flags.status = 'open'
      and content_flags.target_type = 'claim'
      and content_flags.target_id = source_claims.claim_id
    union all
    select source_entities.source_id
    from source_entities
    join public.content_flags
      on content_flags.status = 'open'
      and content_flags.target_type = 'entity'
      and content_flags.target_id = source_entities.entity_id
    union all
    select content_flags.target_id as source_id
    from public.content_flags
    where content_flags.status = 'open'
      and content_flags.target_type = 'source'
  ),
  vote_rows as (
    select source_claims.source_id, community_scores.community_score
    from source_claims
    join public.community_scores
      on community_scores.target_type = 'claim'
      and community_scores.target_id = source_claims.claim_id
    union all
    select source_entities.source_id, community_scores.community_score
    from source_entities
    join public.community_scores
      on community_scores.target_type = 'entity'
      and community_scores.target_id = source_entities.entity_id
    union all
    select community_scores.target_id as source_id, community_scores.community_score
    from public.community_scores
    where community_scores.target_type = 'source'
  ),
  flag_agg as (
    select source_id, count(*)::integer as flag_count
    from flag_rows
    group by source_id
  ),
  vote_agg as (
    select source_id, sum(community_score)::integer as community_score
    from vote_rows
    group by source_id
  )
  select
    coalesce(flag_agg.source_id, vote_agg.source_id) as source_id,
    coalesce(flag_agg.flag_count, 0) as flag_count,
    coalesce(vote_agg.community_score, 0) as community_score
  from flag_agg
  full outer join vote_agg on vote_agg.source_id = flag_agg.source_id;
$$;

revoke all on function public.get_review_queue_signals() from public;
grant execute on function public.get_review_queue_signals() to authenticated;

-- ---------------------------------------------------------------------------
-- Public read of approved comments with author display name.
-- `profiles` RLS hides other users' rows from the public, so a definer function
-- is used to expose only the non-sensitive author display name and role for
-- comments that are already publicly visible (status = 'approved').
-- ---------------------------------------------------------------------------
create or replace function public.get_approved_comments(
  p_target_type text,
  p_target_id uuid
)
returns table (
  id uuid,
  author_id uuid,
  target_type text,
  target_id uuid,
  parent_id uuid,
  body text,
  created_at timestamptz,
  updated_at timestamptz,
  author_display_name text,
  author_role public.admin_role
)
language sql
stable
security definer
set search_path = public
as $$
  select
    comments.id,
    comments.author_id,
    comments.target_type,
    comments.target_id,
    comments.parent_id,
    comments.body,
    comments.created_at,
    comments.updated_at,
    profiles.display_name as author_display_name,
    profiles.role as author_role
  from public.comments
  join public.profiles on profiles.id = comments.author_id
  where comments.status = 'approved'
    and comments.target_type = p_target_type
    and comments.target_id = p_target_id
  order by comments.created_at asc;
$$;

grant execute on function public.get_approved_comments(text, uuid) to anon, authenticated;

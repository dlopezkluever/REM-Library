-- Phase 4 — Community feedback layer: comments, votes, flags, and admin signal views.
-- Every table here is additive. No community action can write to claims, entities,
-- relationships, or any canonical confidence column.

-- ---------------------------------------------------------------------------
-- Role helper: who may contribute community content.
-- `has_internal_access()` deliberately excludes the public `contributor` role,
-- so community writes use this check for contributors plus write-capable staff.
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
      select role in ('contributor', 'editor', 'super_admin')
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
  body text not null check (char_length(btrim(body)) between 10 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'needs_clarification')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments
  drop constraint if exists comments_body_check;

alter table public.comments
  add constraint comments_body_check
  check (char_length(btrim(body)) between 10 and 2000);

alter table public.comments
  drop constraint if exists comments_reviewer_note_length_check;

alter table public.comments
  add constraint comments_reviewer_note_length_check
  check (reviewer_note is null or char_length(reviewer_note) <= 1000);

alter table public.comments
  drop constraint if exists comments_clarification_note_required_check;

alter table public.comments
  add constraint comments_clarification_note_required_check
  check (
    status <> 'needs_clarification'
    or char_length(btrim(coalesce(reviewer_note, ''))) > 0
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
  with check (
    author_id = auth.uid()
    and status = 'pending'
    and public.has_community_access()
  );

-- Authors may edit pending comments, or revise clarification requests back to pending.
drop policy if exists "comments own update pending" on public.comments;
create policy "comments own update pending"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid() and status in ('pending', 'needs_clarification'))
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

create or replace function public.enforce_comment_author_write_guards()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_count integer;
begin
  new.body = btrim(new.body);

  if char_length(new.body) < 10 or char_length(new.body) > 2000 then
    raise exception 'Comments must be between 10 and 2000 characters.';
  end if;

  if new.reviewer_note is not null then
    new.reviewer_note = btrim(new.reviewer_note);
  end if;

  if new.status = 'needs_clarification'
    and char_length(coalesce(new.reviewer_note, '')) = 0 then
    raise exception 'Clarification note is required.';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.author_id <> auth.uid() or new.status <> 'pending' then
      raise exception 'Community comments must be submitted for review.';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended('comments_pending_cap:' || new.author_id::text, 0)
    );

    select count(*)::integer
    into pending_count
    from public.comments
    where author_id = new.author_id
      and status in ('pending', 'needs_clarification');

    if pending_count >= 5 then
      raise exception 'You have 5 comments awaiting review or clarification. Please resolve clarification requests or wait for moderation before adding more.';
    end if;

    return new;
  end if;

  if new.author_id <> old.author_id
    or new.target_type <> old.target_type
    or new.target_id <> old.target_id
    or new.parent_id is distinct from old.parent_id
    or new.created_at is distinct from old.created_at then
    raise exception 'Only the comment body can be edited.';
  end if;

  if old.status not in ('pending', 'needs_clarification') then
    raise exception 'Only pending or clarification-requested comments can be edited.';
  end if;

  new.status = 'pending';
  new.reviewer_id = null;
  new.reviewer_note = null;
  new.reviewed_at = null;

  return new;
end;
$$;

drop trigger if exists comments_author_write_guards on public.comments;
create trigger comments_author_write_guards
before insert or update on public.comments
for each row
execute function public.enforce_comment_author_write_guards();

create or replace function public.update_own_comment_body(
  p_comment_id uuid,
  p_body text
)
returns public.comments
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_comment public.comments;
begin
  update public.comments
  set
    body = btrim(p_body),
    status = 'pending',
    reviewer_id = null,
    reviewer_note = null,
    reviewed_at = null
  where id = p_comment_id
    and author_id = auth.uid()
    and status in ('pending', 'needs_clarification')
  returning * into updated_comment;

  if updated_comment.id is null then
    raise exception 'Comment is not editable.';
  end if;

  return updated_comment;
end;
$$;

grant execute on function public.update_own_comment_body(uuid, text) to authenticated;

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

-- Vote aggregates are public through community_scores. Raw vote rows are private.
drop policy if exists "votes public read" on public.content_votes;
drop policy if exists "votes own read" on public.content_votes;
create policy "votes own read"
  on public.content_votes for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "votes admin read" on public.content_votes;
create policy "votes admin read"
  on public.content_votes for select
  to authenticated
  using (public.is_admin());

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
  created_at timestamptz not null default now()
);

create index if not exists content_flags_target_idx
  on public.content_flags (target_type, target_id, status);
create index if not exists content_flags_status_idx
  on public.content_flags (status, created_at);
alter table public.content_flags
  drop constraint if exists content_flags_reporter_id_target_type_target_id_key;
create unique index if not exists content_flags_open_reporter_target_unique_idx
  on public.content_flags (reporter_id, target_type, target_id)
  where status = 'open';

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
create or replace view public.open_flag_counts
with (security_invoker = true) as
select
  target_type,
  target_id,
  count(*)::integer as flag_count
from public.content_flags
where status = 'open'
group by target_type, target_id;

grant select on public.open_flag_counts to authenticated;

create or replace view public.pending_comment_counts
with (security_invoker = true) as
select
  target_type,
  target_id,
  count(*)::integer as pending_comment_count
from public.comments
where status in ('pending', 'needs_clarification')
group by target_type, target_id;

grant select on public.pending_comment_counts to authenticated;

drop function if exists public.get_admin_entities_page(integer, integer, text, public.content_status);

create or replace function public.get_admin_entities_page(
  page_limit integer default 50,
  page_offset integer default 0,
  search_query text default null,
  status_filter public.content_status default null
)
returns table (
  total_count integer,
  id uuid,
  type public.entity_type,
  name text,
  slug text,
  aliases text[],
  description text,
  confidence_score double precision,
  confidence_override double precision,
  image_url text,
  hero_image_url text,
  position_x double precision,
  position_y double precision,
  status public.content_status,
  created_at timestamptz,
  updated_at timestamptz,
  community_score integer,
  flag_count integer,
  pending_comment_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select entities.*
    from public.entities
    where entities.status <> 'archived'
      and (status_filter is null or entities.status = status_filter)
      and (
        nullif(public.normalize_review_text(search_query), '') is null
        or entities.name ilike '%' || replace(replace(public.normalize_review_text(search_query), '%', '\%'), '_', '\_') || '%' escape '\'
        or exists (
          select 1
          from unnest(entities.aliases) as alias(value)
          where alias.value ilike '%' || replace(replace(public.normalize_review_text(search_query), '%', '\%'), '_', '\_') || '%' escape '\'
        )
      )
  ),
  counted as (
    select count(*)::integer as total_count from filtered
  )
  select
    counted.total_count,
    filtered.id,
    filtered.type,
    filtered.name,
    filtered.slug,
    filtered.aliases,
    filtered.description,
    filtered.confidence_score,
    filtered.confidence_override,
    filtered.image_url,
    filtered.hero_image_url,
    filtered.position_x,
    filtered.position_y,
    filtered.status,
    filtered.created_at,
    filtered.updated_at,
    coalesce(community_scores.community_score, 0)::integer as community_score,
    coalesce(open_flag_counts.flag_count, 0)::integer as flag_count,
    coalesce(pending_comment_counts.pending_comment_count, 0)::integer as pending_comment_count
  from filtered
  cross join counted
  left join public.community_scores
    on community_scores.target_type = 'entity'
    and community_scores.target_id = filtered.id
  left join public.open_flag_counts
    on open_flag_counts.target_type = 'entity'
    and open_flag_counts.target_id = filtered.id
  left join public.pending_comment_counts
    on pending_comment_counts.target_type = 'entity'
    and pending_comment_counts.target_id = filtered.id
  order by filtered.updated_at desc, filtered.name
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(coalesce(page_offset, 0), 0);
$$;

grant execute on function public.get_admin_entities_page(integer, integer, text, public.content_status) to authenticated;

drop function if exists public.get_admin_claims_page(integer, integer, text, public.content_status);

create or replace function public.get_admin_claims_page(
  page_limit integer default 50,
  page_offset integer default 0,
  search_query text default null,
  status_filter public.content_status default null
)
returns table (
  total_count integer,
  id uuid,
  statement text,
  detailed_argument text,
  author_id uuid,
  confidence_score double precision,
  confidence_override double precision,
  interpretation_frame public.interpretation_frame,
  is_canonical boolean,
  status public.content_status,
  created_at timestamptz,
  updated_at timestamptz,
  entity_names text[],
  evidence_count integer,
  community_score integer,
  flag_count integer,
  pending_comment_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select claims.*
    from public.claims
    where claims.status <> 'archived'
      and (status_filter is null or claims.status = status_filter)
      and (
        nullif(public.normalize_review_text(search_query), '') is null
        or claims.statement ilike '%' || replace(replace(public.normalize_review_text(search_query), '%', '\%'), '_', '\_') || '%' escape '\'
      )
  ),
  counted as (
    select count(*)::integer as total_count from filtered
  )
  select
    counted.total_count,
    filtered.id,
    filtered.statement,
    filtered.detailed_argument,
    filtered.author_id,
    filtered.confidence_score,
    filtered.confidence_override,
    filtered.interpretation_frame,
    filtered.is_canonical,
    filtered.status,
    filtered.created_at,
    filtered.updated_at,
    coalesce(
      array_agg(entities.name order by entities.name) filter (where entities.id is not null),
      '{}'::text[]
    ) as entity_names,
    count(distinct claim_evidence.anchor_id)::integer as evidence_count,
    coalesce(community_scores.community_score, 0)::integer as community_score,
    coalesce(open_flag_counts.flag_count, 0)::integer as flag_count,
    coalesce(pending_comment_counts.pending_comment_count, 0)::integer as pending_comment_count
  from filtered
  cross join counted
  left join public.claim_entities on claim_entities.claim_id = filtered.id
  left join public.entities on entities.id = claim_entities.entity_id
  left join public.claim_evidence on claim_evidence.claim_id = filtered.id
  left join public.community_scores
    on community_scores.target_type = 'claim'
    and community_scores.target_id = filtered.id
  left join public.open_flag_counts
    on open_flag_counts.target_type = 'claim'
    and open_flag_counts.target_id = filtered.id
  left join public.pending_comment_counts
    on pending_comment_counts.target_type = 'claim'
    and pending_comment_counts.target_id = filtered.id
  group by
    counted.total_count,
    filtered.id,
    filtered.statement,
    filtered.detailed_argument,
    filtered.author_id,
    filtered.confidence_score,
    filtered.confidence_override,
    filtered.interpretation_frame,
    filtered.is_canonical,
    filtered.status,
    filtered.created_at,
    filtered.updated_at,
    community_scores.community_score,
    open_flag_counts.flag_count,
    pending_comment_counts.pending_comment_count
  order by filtered.updated_at desc, filtered.created_at desc
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(coalesce(page_offset, 0), 0);
$$;

grant execute on function public.get_admin_claims_page(integer, integer, text, public.content_status) to authenticated;

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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges are required to read review queue signals.'
      using errcode = '42501';
  end if;

  return query
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
end;
$$;

revoke all on function public.get_review_queue_signals() from public;
grant execute on function public.get_review_queue_signals() to authenticated;

create or replace function public.get_pending_review_source_summaries(
  page_limit integer default 50,
  page_offset integer default 0,
  sort_mode text default 'oldest'
)
returns table (
  source_id uuid,
  source_title text,
  source_status public.content_status,
  source_format public.source_format,
  source_tier public.source_tier,
  pending_item_count integer,
  pending_extraction_count integer,
  validation_failed_count integer,
  oldest_extraction_at timestamptz,
  flag_count integer,
  community_score integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin privileges are required to read the review queue.'
      using errcode = '42501';
  end if;

  if sort_mode not in ('oldest', 'newest', 'most_flagged', 'highest_community_score') then
    raise exception 'Unsupported review queue sort: %', sort_mode;
  end if;

  return query
  with pending as (
    select
      sources.id as source_id,
      sources.title as source_title,
      sources.status as source_status,
      sources.format as source_format,
      sources.tier as source_tier,
      extractions.id as extraction_id,
      extractions.created_at,
      (
        select count(*)::integer
        from (
          select item.value
          from jsonb_array_elements(coalesce(extractions.extraction_data->'entities', '[]'::jsonb)) as item(value)
          union all
          select item.value
          from jsonb_array_elements(coalesce(extractions.extraction_data->'claims', '[]'::jsonb)) as item(value)
        ) items
        where coalesce(items.value->>'review_status', 'pending') = 'pending'
      ) as item_count,
      (extractions.extraction_data->>'validation_failed') = 'true' as validation_failed
    from public.extractions
    join public.chunks on chunks.id = extractions.chunk_id
    join public.sources on sources.id = chunks.source_id
    where extractions.status = 'pending'
      and sources.status <> 'archived'
  ),
  grouped as (
    select
      pending.source_id,
      pending.source_title,
      pending.source_status,
      pending.source_format,
      pending.source_tier,
      sum(pending.item_count)::integer as pending_item_count,
      count(*)::integer as pending_extraction_count,
      count(*) filter (where pending.validation_failed)::integer as validation_failed_count,
      min(pending.created_at) as oldest_extraction_at
    from pending
    where pending.item_count > 0 or pending.validation_failed
    group by
      pending.source_id,
      pending.source_title,
      pending.source_status,
      pending.source_format,
      pending.source_tier
  ),
  signals as (
    select *
    from public.get_review_queue_signals()
  )
  select
    grouped.source_id,
    grouped.source_title,
    grouped.source_status,
    grouped.source_format,
    grouped.source_tier,
    grouped.pending_item_count,
    grouped.pending_extraction_count,
    grouped.validation_failed_count,
    grouped.oldest_extraction_at,
    coalesce(signals.flag_count, 0) as flag_count,
    coalesce(signals.community_score, 0) as community_score
  from grouped
  left join signals on signals.source_id = grouped.source_id
  order by
    case when sort_mode = 'most_flagged' then coalesce(signals.flag_count, 0) end desc nulls last,
    case when sort_mode = 'highest_community_score' then coalesce(signals.community_score, 0) end desc nulls last,
    case when sort_mode = 'newest' then grouped.oldest_extraction_at end desc nulls last,
    grouped.oldest_extraction_at asc,
    grouped.source_title asc
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(coalesce(page_offset, 0), 0);
end;
$$;

revoke all on function public.get_pending_review_source_summaries(integer, integer, text) from public;
grant execute on function public.get_pending_review_source_summaries(integer, integer, text) to authenticated;

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

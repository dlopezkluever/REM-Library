-- ─────────────────────────────────────────────────────────────────────────────
-- M6: Add source_type to claims
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  create type public.claim_source_type as enum (
    'ai_extraction',
    'admin_manual',
    'contributor_suggestion'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.claims
  add column if not exists source_type public.claim_source_type default 'admin_manual';

-- ─────────────────────────────────────────────────────────────────────────────
-- B7 (DB half): Strip query strings from URL dedup index and RPC
-- Drop old index first, then rebuild with query-string stripping.
-- If existing rows collide after stripping, duplicates must be resolved manually.
-- ─────────────────────────────────────────────────────────────────────────────

drop index if exists sources_url_normalized_unique;

create unique index sources_url_normalized_unique
  on public.sources (lower(regexp_replace(regexp_replace(url, '\?.*$', ''), '/$', '')))
  where url is not null;

create or replace function public.find_source_by_normalized_url(input_url text)
returns table (id uuid, title text, url text)
language sql
stable
security invoker
set search_path = public
as $$
  select sources.id, sources.title, sources.url
  from public.sources
  where sources.url is not null
    and lower(regexp_replace(regexp_replace(sources.url, '\?.*$', ''), '/$', '')) =
        lower(regexp_replace(regexp_replace(trim(input_url), '\?.*$', ''), '/$', ''))
  limit 1;
$$;

grant execute on function public.find_source_by_normalized_url(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- G1: Rate-limit suggestion inserts to 10 per user per 24 hours
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "suggestions contributor insert own" on public.suggestions;
create policy "suggestions contributor insert own"
  on public.suggestions for insert
  to authenticated
  with check (
    submitter_id = auth.uid()
    and exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role in ('contributor', 'viewer', 'editor', 'super_admin')
    )
    and (
      select count(*)
      from public.suggestions
      where submitter_id = auth.uid()
        and created_at > now() - interval '24 hours'
    ) < 10
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- B2 + B6 + M6: Rewrite approve_suggestion
--   B2: flag_claim uses update_claim_status (sets updated_at + audit event)
--       flag_entity now sets updated_at and writes an audit event
--   B6: claim_correction carries interpretation_frame from the original claim
--   M6: new_claim and claim_correction set source_type = 'contributor_suggestion'
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.approve_suggestion(suggestion_id uuid, admin_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion_row public.suggestions%rowtype;
  new_claim_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Editor access is required.';
  end if;

  select *
  into suggestion_row
  from public.suggestions
  where id = suggestion_id
  for update;

  if not found then
    raise exception 'Suggestion was not found.';
  end if;

  if suggestion_row.status <> 'pending' and suggestion_row.status <> 'clarification_requested' then
    raise exception 'Suggestion has already been reviewed.';
  end if;

  if suggestion_row.type = 'new_claim' then
    insert into public.claims (statement, detailed_argument, author_id, status, source_type)
    values (
      suggestion_row.suggestion_text,
      suggestion_row.reason,
      suggestion_row.submitter_id,
      'draft',
      'contributor_suggestion'
    )
    returning id into new_claim_id;

    insert into public.claim_entities (claim_id, entity_id)
    values (new_claim_id, suggestion_row.target_entity_id);

  elsif suggestion_row.type = 'claim_correction' then
    -- Carry interpretation_frame from the original; keep is_canonical = false so
    -- the corrected draft must be promoted to canonical deliberately.
    insert into public.claims (
      statement, detailed_argument, author_id, status,
      interpretation_frame, is_canonical, source_type
    )
    select
      suggestion_row.suggestion_text,
      suggestion_row.reason,
      suggestion_row.submitter_id,
      'draft',
      c.interpretation_frame,
      false,
      'contributor_suggestion'
    from public.claims c
    where c.id = suggestion_row.target_claim_id
    returning id into new_claim_id;

    insert into public.claim_entities (claim_id, entity_id)
    select new_claim_id, claim_entities.entity_id
    from public.claim_entities
    where claim_entities.claim_id = suggestion_row.target_claim_id;

  elsif suggestion_row.type = 'flag_claim' then
    -- update_claim_status sets updated_at and writes an admin_audit_events row.
    -- is_admin() is satisfied because approve_suggestion already checked it and
    -- auth.uid() is preserved in the security definer context.
    perform public.update_claim_status(suggestion_row.target_claim_id, 'disputed');

  elsif suggestion_row.type = 'flag_entity' then
    update public.entities
    set status = 'disputed',
        updated_at = now()
    where id = suggestion_row.target_entity_id;

    insert into public.admin_audit_events (actor_id, action, target_table, target_id, details)
    values (
      auth.uid(),
      'flag_entity_disputed',
      'entities',
      suggestion_row.target_entity_id,
      jsonb_build_object('suggestion_id', suggestion_id)
    );

  end if;

  update public.suggestions
  set status = 'approved',
      admin_notes = coalesce(admin_note, admin_notes),
      created_claim_id = new_claim_id,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = suggestion_id;

  return jsonb_build_object(
    'suggestion_id', suggestion_id,
    'created_claim_id', new_claim_id,
    'status', 'approved'
  );
end;
$$;

grant execute on function public.approve_suggestion(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- B5: Auth trigger respects raw_user_meta_data->>'role' for invited admins.
-- Defaults to 'contributor' for public sign-ups.
-- Never grants 'super_admin' through metadata to prevent privilege escalation.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_public_user_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_role text;
  assigned_role public.admin_role;
begin
  metadata_role := new.raw_user_meta_data->>'role';

  -- Honor the metadata role if it is a valid non-escalating enum value.
  if metadata_role is not null
     and metadata_role <> ''
     and metadata_role <> 'super_admin'
  then
    begin
      assigned_role := metadata_role::public.admin_role;
    exception
      when invalid_text_representation then
        assigned_role := 'contributor';
    end;
  else
    assigned_role := 'contributor';
  end if;

  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'display_name', ''),
    assigned_role
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

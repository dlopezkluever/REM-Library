create type public.interpretation_frame as enum (
  'canonical_rem',
  'supporting_context',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'disputed_alternative'
);

alter table public.claims
  add column interpretation_frame public.interpretation_frame,
  add column is_canonical boolean not null default false;

create index claims_interpretation_frame_idx on public.claims (interpretation_frame);
create index claims_is_canonical_idx on public.claims (is_canonical) where is_canonical = true;

create type public.source_category as enum (
  'primary_rem',
  'secondary_rem',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'community_submitted'
);

alter table public.sources
  add column category public.source_category,
  add column crawl_date timestamptz,
  add column license text,
  add column rights_notes text,
  add column attribution text;

update public.sources
set category = case tier
  when 'primary' then 'primary_rem'::public.source_category
  when 'secondary' then 'secondary_rem'::public.source_category
end
where category is null;

create index sources_category_idx on public.sources (category);

create table public.url_ingestion_config (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  enabled boolean not null default true,
  notes text,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.url_ingestion_config enable row level security;

create policy "url_ingestion_config admin read"
  on public.url_ingestion_config
  for select
  to authenticated
  using (public.is_admin());

create policy "url_ingestion_config super_admin insert"
  on public.url_ingestion_config
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
    )
  );

create policy "url_ingestion_config super_admin update"
  on public.url_ingestion_config
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
    )
  );

create or replace function public.set_claim_canonical(
  claim_id uuid,
  next_is_canonical boolean,
  force_replace boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_entity_ids uuid[];
  conflicting_claim_id uuid;
  previous_value boolean;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = actor_id
      and profiles.role = 'super_admin'
  ) then
    raise exception 'Only super admins can set canonical claims.';
  end if;

  select claims.is_canonical
  into previous_value
  from public.claims
  where claims.id = claim_id
  for update;

  if previous_value is null then
    raise exception 'Claim was not found.';
  end if;

  if not next_is_canonical then
    update public.claims
    set is_canonical = false,
        updated_at = now()
    where claims.id = claim_id;

    insert into public.admin_audit_events (action, actor_id, details, target_id, target_table)
    values (
      'set_claim_canonical',
      actor_id,
      jsonb_build_object('old_is_canonical', previous_value, 'new_is_canonical', false),
      claim_id,
      'claims'
    );

    return jsonb_build_object('conflict', false, 'claim_id', claim_id, 'is_canonical', false);
  end if;

  select coalesce(array_agg(entity_id), '{}'::uuid[])
  into target_entity_ids
  from public.claim_entities
  where claim_entities.claim_id = set_claim_canonical.claim_id;

  if cardinality(target_entity_ids) = 0 then
    raise exception 'Canonical claims must be attached to at least one entity.';
  end if;

  select claim_entities.claim_id
  into conflicting_claim_id
  from public.claim_entities
  join public.claims on claims.id = claim_entities.claim_id
  where claim_entities.entity_id = any(target_entity_ids)
    and claim_entities.claim_id <> set_claim_canonical.claim_id
    and claims.is_canonical = true
  order by claims.updated_at desc
  limit 1
  for update of claims;

  if conflicting_claim_id is not null and not force_replace then
    return jsonb_build_object(
      'conflict',
      true,
      'existingCanonicalClaimId',
      conflicting_claim_id
    );
  end if;

  if conflicting_claim_id is not null then
    update public.claims
    set is_canonical = false,
        updated_at = now()
    where claims.id in (
      select claim_entities.claim_id
      from public.claim_entities
      join public.claims on claims.id = claim_entities.claim_id
      where claim_entities.entity_id = any(target_entity_ids)
        and claim_entities.claim_id <> set_claim_canonical.claim_id
        and claims.is_canonical = true
    );
  end if;

  update public.claims
  set is_canonical = true,
      updated_at = now()
  where claims.id = claim_id;

  insert into public.admin_audit_events (action, actor_id, details, target_id, target_table)
  values (
    'set_claim_canonical',
    actor_id,
    jsonb_build_object(
      'old_is_canonical',
      previous_value,
      'new_is_canonical',
      true,
      'replaced_claim_id',
      conflicting_claim_id
    ),
    claim_id,
    'claims'
  );

  return jsonb_build_object(
    'conflict',
    false,
    'claim_id',
    claim_id,
    'is_canonical',
    true,
    'replaced_claim_id',
    conflicting_claim_id
  );
end;
$$;

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
  evidence_count integer
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
    count(distinct claim_evidence.anchor_id)::integer as evidence_count
  from filtered
  cross join counted
  left join public.claim_entities on claim_entities.claim_id = filtered.id
  left join public.entities on entities.id = claim_entities.entity_id
  left join public.claim_evidence on claim_evidence.claim_id = filtered.id
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
    filtered.updated_at
  order by filtered.updated_at desc, filtered.created_at desc
  limit greatest(1, least(coalesce(page_limit, 50), 100))
  offset greatest(coalesce(page_offset, 0), 0);
$$;

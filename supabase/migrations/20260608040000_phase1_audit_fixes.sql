alter table public.relationships
  add column if not exists weight_override double precision
    check (weight_override is null or (weight_override >= 0 and weight_override <= 1));

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
    and lower(regexp_replace(sources.url, '/$', '')) =
        lower(regexp_replace(trim(input_url), '/$', ''))
  limit 1;
$$;

create or replace function public.update_claim_status(
  claim_id uuid,
  next_status public.content_status
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_entity_ids uuid[];
  previous_status public.content_status;
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  select status
  into previous_status
  from public.claims
  where id = $1
  for update;

  if previous_status is null then
    raise exception 'Claim was not found.';
  end if;

  update public.claims
  set status = next_status, updated_at = now()
  where id = $1;

  select coalesce(array_agg(entity_id), '{}'::uuid[])
  into affected_entity_ids
  from public.claim_entities
  where claim_entities.claim_id = $1;

  insert into public.admin_audit_events (actor_id, action, target_table, target_id, details)
  values (
    auth.uid(),
    'update_claim_status',
    'claims',
    $1,
    jsonb_build_object('old_status', previous_status, 'new_status', next_status)
  );

  return affected_entity_ids;
end;
$$;

create or replace function public.bulk_update_claim_status(
  claim_ids uuid[],
  next_status public.content_status
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_entity_ids uuid[];
  updated_claim_ids uuid[];
  old_status_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  if next_status = 'archived' then
    raise exception 'Bulk archive is not supported by this action.';
  end if;

  with requested_claims as (
    select claims.id, claims.status as old_status
    from public.claims
    where claims.id = any(coalesce(claim_ids, '{}'::uuid[]))
      and claims.status <> 'archived'
      and claims.status <> next_status
    for update
  ),
  updated as (
    update public.claims
    set status = next_status, updated_at = now()
    from requested_claims
    where claims.id = requested_claims.id
    returning claims.id, requested_claims.old_status
  )
  select
    coalesce(array_agg(id), '{}'::uuid[]),
    coalesce(
      (
        select jsonb_object_agg(old_status, status_count)
        from (
          select old_status, count(*) as status_count
          from updated
          group by old_status
        ) grouped_status_counts
      ),
      '{}'::jsonb
    )
  into updated_claim_ids, old_status_counts
  from updated;

  select coalesce(array_agg(distinct claim_entities.entity_id), '{}'::uuid[])
  into affected_entity_ids
  from public.claim_entities
  where claim_entities.claim_id = any(coalesce(updated_claim_ids, '{}'::uuid[]));

  insert into public.admin_audit_events (actor_id, action, target_table, details)
  values (
    auth.uid(),
    'bulk_update_claim_status',
    'claims',
    jsonb_build_object(
      'claim_ids',
      to_jsonb(coalesce(updated_claim_ids, '{}'::uuid[])),
      'old_status_counts',
      old_status_counts,
      'new_status',
      next_status
    )
  );

  return affected_entity_ids;
end;
$$;

grant execute on function public.find_source_by_normalized_url(text) to authenticated;
grant execute on function public.bulk_update_claim_status(uuid[], public.content_status) to authenticated;

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

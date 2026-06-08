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
begin
  if not public.is_admin() then
    raise exception 'Admin access is required.';
  end if;

  update public.claims
  set status = next_status, updated_at = now()
  where id = $1;

  if not found then
    raise exception 'Claim was not found.';
  end if;

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
    jsonb_build_object('status', next_status)
  );

  return affected_entity_ids;
end;
$$;

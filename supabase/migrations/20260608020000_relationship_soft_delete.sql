alter table public.relationships
  add column status text not null default 'active'
    check (status in ('active', 'archived')),
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete set null;

drop policy if exists "relationships public read published endpoints" on public.relationships;

create policy "relationships public read published endpoints"
  on public.relationships for select
  using (
    relationships.status = 'active'
    and (
      public.has_internal_access()
      or (
        exists (
          select 1 from public.entities from_entity
          where from_entity.id = from_entity_id
            and from_entity.status = 'published'
        )
        and exists (
          select 1 from public.entities to_entity
          where to_entity.id = to_entity_id
            and to_entity.status = 'published'
        )
        and exists (
          select 1
          from public.claims
          where claims.id = any(relationships.claim_ids)
            and claims.status = 'published'
        )
      )
    )
  );

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select role in ('super_admin', 'editor')
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

create or replace function public.has_internal_access()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select role in ('super_admin', 'editor', 'viewer')
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

alter table public.profiles enable row level security;
alter table public.entities enable row level security;
alter table public.relationships enable row level security;
alter table public.claims enable row level security;
alter table public.claim_entities enable row level security;
alter table public.sources enable row level security;
alter table public.source_anchors enable row level security;
alter table public.claim_evidence enable row level security;
alter table public.chunks enable row level security;
alter table public.extractions enable row level security;

create policy "profiles self read"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles admin write"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "entities public read published"
  on public.entities for select
  using (status = 'published' or public.has_internal_access());

create policy "entities admin write"
  on public.entities for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "relationships public read published endpoints"
  on public.relationships for select
  using (
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
    )
  );

create policy "relationships admin write"
  on public.relationships for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "claims public read published"
  on public.claims for select
  using (status = 'published' or public.has_internal_access());

create policy "claims admin write"
  on public.claims for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "claim_entities public read published"
  on public.claim_entities for select
  using (
    public.has_internal_access()
    or exists (
      select 1
      from public.claims
      join public.entities on entities.id = claim_entities.entity_id
      where claims.id = claim_entities.claim_id
        and claims.status = 'published'
        and entities.status = 'published'
    )
  );

create policy "claim_entities admin write"
  on public.claim_entities for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "sources public read published"
  on public.sources for select
  using (status = 'published' or public.has_internal_access());

create policy "sources admin write"
  on public.sources for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "source_anchors public read published source evidence"
  on public.source_anchors for select
  using (
    public.has_internal_access()
    or exists (
      select 1
      from public.sources
      where sources.id = source_anchors.source_id
        and sources.status = 'published'
    )
  );

create policy "source_anchors admin write"
  on public.source_anchors for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "claim_evidence public read published"
  on public.claim_evidence for select
  using (
    public.has_internal_access()
    or exists (
      select 1
      from public.claims
      where claims.id = claim_evidence.claim_id
        and claims.status = 'published'
    )
  );

create policy "claim_evidence admin write"
  on public.claim_evidence for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "chunks internal read"
  on public.chunks for select
  using (public.has_internal_access());

create policy "chunks admin write"
  on public.chunks for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "extractions internal read"
  on public.extractions for select
  using (public.has_internal_access());

create policy "extractions admin write"
  on public.extractions for all
  using (public.is_admin())
  with check (public.is_admin());

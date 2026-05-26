drop policy if exists "source_anchors public read published source evidence"
  on public.source_anchors;

drop policy if exists "claim_evidence public read published"
  on public.claim_evidence;

create policy "source_anchors public read published source"
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

create policy "claim_evidence public read published claim"
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

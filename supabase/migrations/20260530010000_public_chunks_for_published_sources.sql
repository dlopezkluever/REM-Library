create policy "chunks public read published source"
  on public.chunks for select
  using (
    public.has_internal_access()
    or exists (
      select 1
      from public.sources
      where sources.id = chunks.source_id
        and sources.status = 'published'
    )
  );

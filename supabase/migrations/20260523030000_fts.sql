create extension if not exists pg_trgm;

alter table public.entities
  add column fts tsvector generated always as (
    to_tsvector(
      'english',
      coalesce(name, '') || ' ' ||
      coalesce(description, '')
    )
  ) stored;

create index entities_fts_idx on public.entities using gin (fts);
create index entities_name_trgm_idx on public.entities using gin (name gin_trgm_ops);

alter table public.chunks
  add column fts tsvector generated always as (
    to_tsvector('english', coalesce(raw_text, ''))
  ) stored;

create index chunks_fts_idx on public.chunks using gin (fts);

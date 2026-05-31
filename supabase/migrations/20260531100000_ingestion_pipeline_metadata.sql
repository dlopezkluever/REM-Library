alter table public.sources
add column if not exists transcript_id text;

create unique index if not exists sources_transcript_id_unique
on public.sources (transcript_id)
where transcript_id is not null;

drop function if exists public.get_admin_source_list_rows(integer, integer);

create function public.get_admin_source_list_rows(
  page_limit integer default 100,
  page_offset integer default 0
)
returns table (
  id uuid,
  title text,
  authors text[],
  publication_date date,
  format public.source_format,
  tier public.source_tier,
  url text,
  file_path text,
  transcript_id text,
  duration_seconds integer,
  page_count integer,
  pipeline_stage public.pipeline_stage,
  status public.content_status,
  created_at timestamptz,
  updated_at timestamptz,
  pipeline_stage_entered_at timestamptz,
  description text,
  extraction_count integer,
  pending_review_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with page_sources as (
    select sources.*
    from public.sources
    order by sources.created_at desc
    limit greatest(1, least(coalesce(page_limit, 100), 100))
    offset greatest(coalesce(page_offset, 0), 0)
  )
  select
    page_sources.id,
    page_sources.title,
    page_sources.authors,
    page_sources.publication_date,
    page_sources.format,
    page_sources.tier,
    page_sources.url,
    page_sources.file_path,
    page_sources.transcript_id,
    page_sources.duration_seconds,
    page_sources.page_count,
    page_sources.pipeline_stage,
    page_sources.status,
    page_sources.created_at,
    page_sources.updated_at,
    page_sources.pipeline_stage_entered_at,
    page_sources.description,
    coalesce(counts.extraction_count, 0) as extraction_count,
    coalesce(counts.pending_review_count, 0) as pending_review_count
  from page_sources
  left join lateral (
    select
      count(extractions.id)::integer as extraction_count,
      count(extractions.id) filter (where extractions.status = 'pending')::integer
        as pending_review_count
    from public.chunks
    left join public.extractions on extractions.chunk_id = chunks.id
    where chunks.source_id = page_sources.id
  ) counts on true
  order by page_sources.created_at desc;
$$;

grant execute on function public.get_admin_source_list_rows(integer, integer) to authenticated;

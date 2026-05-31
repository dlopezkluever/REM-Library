alter table public.sources
add column if not exists pipeline_error text;

alter table public.chunks
add column if not exists speaker_turns jsonb not null default '[]'::jsonb;

alter table public.chunks
alter column start_sec type double precision using start_sec::double precision,
alter column end_sec type double precision using end_sec::double precision;

alter table public.source_anchors
alter column start_timestamp_sec type double precision using start_timestamp_sec::double precision,
alter column end_timestamp_sec type double precision using end_timestamp_sec::double precision;

with ranked_extractions as (
  select
    id,
    row_number() over (partition by chunk_id order by created_at, id) as row_number
  from public.extractions
)
delete from public.extractions
using ranked_extractions
where extractions.id = ranked_extractions.id
  and ranked_extractions.row_number > 1;

create unique index if not exists extractions_chunk_id_unique
on public.extractions (chunk_id);

create table if not exists public.pipeline_provider_rate_limits (
  provider text primary key,
  next_request_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pipeline_provider_rate_limits (provider)
values ('anthropic')
on conflict (provider) do nothing;

create or replace function public.claim_provider_request_slot(
  provider_name text,
  spacing_ms integer default 250
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_next_request_at timestamptz;
  scheduled_next_request_at timestamptz;
  now_at timestamptz := clock_timestamp();
  wait_ms integer;
begin
  if provider_name is null or length(trim(provider_name)) = 0 then
    raise exception 'provider_name is required';
  end if;

  insert into public.pipeline_provider_rate_limits (provider)
  values (provider_name)
  on conflict (provider) do nothing;

  select pipeline_provider_rate_limits.next_request_at
  into current_next_request_at
  from public.pipeline_provider_rate_limits
  where provider = provider_name
  for update;

  wait_ms := greatest(
    0,
    ceiling(extract(epoch from (current_next_request_at - now_at)) * 1000)::integer
  );
  scheduled_next_request_at :=
    greatest(current_next_request_at, now_at)
    + make_interval(secs => greatest(spacing_ms, 0)::double precision / 1000.0);

  update public.pipeline_provider_rate_limits
  set
    next_request_at = scheduled_next_request_at,
    updated_at = now()
  where provider = provider_name;

  return wait_ms;
end;
$$;

grant execute on function public.claim_provider_request_slot(text, integer) to authenticated;

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
  pipeline_error text,
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
    page_sources.pipeline_error,
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

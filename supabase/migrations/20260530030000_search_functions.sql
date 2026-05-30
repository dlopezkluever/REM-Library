create or replace function public.search_entities(search_query text)
returns table (
  id uuid,
  type public.entity_type,
  name text,
  slug text,
  confidence_score double precision,
  matched_excerpt text,
  rank real,
  similarity real
)
language sql
stable
security invoker
set search_path = public
as $$
  with query_input as (
    select
      nullif(trim(search_query), '') as raw_query,
      websearch_to_tsquery('english', nullif(trim(search_query), '')) as ts_query
  )
  select
    entities.id,
    entities.type,
    entities.name,
    entities.slug,
    coalesce(entities.confidence_override, entities.confidence_score) as confidence_score,
    coalesce(
      nullif(
        ts_headline(
          'english',
          coalesce(entities.description, entities.name),
          query_input.ts_query,
          'MaxWords=18, MinWords=6, ShortWord=3, HighlightAll=false'
        ),
        ''
      ),
      entities.name
    ) as matched_excerpt,
    ts_rank(entities.fts, query_input.ts_query) as rank,
    word_similarity(query_input.raw_query, entities.name) as similarity
  from public.entities
  cross join query_input
  where query_input.raw_query is not null
    and entities.status = 'published'
    and (
      entities.fts @@ query_input.ts_query
      or word_similarity(query_input.raw_query, entities.name) > 0.25
      or entities.name ilike '%' || query_input.raw_query || '%'
    )
  order by greatest(ts_rank(entities.fts, query_input.ts_query), word_similarity(query_input.raw_query, entities.name)) desc,
    entities.name asc
  limit 50;
$$;

create or replace function public.search_global(search_query text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with query_input as (
    select
      nullif(trim(search_query), '') as raw_query,
      websearch_to_tsquery('english', nullif(trim(search_query), '')) as ts_query
  ),
  entity_results as (
    select jsonb_build_object(
      'kind', 'entity',
      'id', entities.id,
      'type', entities.type,
      'name', entities.name,
      'slug', entities.slug,
      'confidenceScore', entities.confidence_score,
      'matchedExcerpt', entities.matched_excerpt
    ) as result
    from public.search_entities(search_query) entities
    limit 30
  ),
  claim_matches as (
    select
      claims.id,
      claims.statement,
      coalesce(claims.confidence_override, claims.confidence_score) as confidence_score,
      coalesce(
        nullif(
          ts_headline(
            'english',
            claims.statement || ' ' || coalesce(claims.detailed_argument, ''),
            query_input.ts_query,
            'MaxWords=22, MinWords=8, ShortWord=3, HighlightAll=false'
          ),
          ''
        ),
        claims.statement
      ) as matched_excerpt,
      ts_rank(to_tsvector('english', claims.statement || ' ' || coalesce(claims.detailed_argument, '')), query_input.ts_query) as rank
    from public.claims
    cross join query_input
    where query_input.raw_query is not null
      and claims.status = 'published'
      and (
        to_tsvector('english', claims.statement || ' ' || coalesce(claims.detailed_argument, '')) @@ query_input.ts_query
        or claims.statement ilike '%' || query_input.raw_query || '%'
      )
    order by rank desc, claims.confidence_score desc
    limit 30
  ),
  claim_results as (
    select jsonb_build_object(
      'kind', 'claim',
      'id', claim_matches.id,
      'statement', claim_matches.statement,
      'confidenceScore', claim_matches.confidence_score,
      'matchedExcerpt', claim_matches.matched_excerpt
    ) as result
    from claim_matches
  ),
  source_matches as (
    select distinct on (source_id)
      source_id,
      title,
      format,
      tier,
      chunk_id,
      matched_excerpt,
      rank
    from (
      select
        sources.id as source_id,
        sources.title,
        sources.format,
        sources.tier,
        null::uuid as chunk_id,
        coalesce(
          nullif(
            ts_headline(
              'english',
              sources.title || ' ' || coalesce(sources.description, ''),
              query_input.ts_query,
              'MaxWords=18, MinWords=6, ShortWord=3, HighlightAll=false'
            ),
            ''
          ),
          sources.title
        ) as matched_excerpt,
        ts_rank(to_tsvector('english', sources.title || ' ' || coalesce(sources.description, '')), query_input.ts_query) as rank
      from public.sources
      cross join query_input
      where query_input.raw_query is not null
        and sources.status = 'published'
        and (
          to_tsvector('english', sources.title || ' ' || coalesce(sources.description, '')) @@ query_input.ts_query
          or sources.title ilike '%' || query_input.raw_query || '%'
        )

      union all

      select
        sources.id as source_id,
        sources.title,
        sources.format,
        sources.tier,
        chunks.id as chunk_id,
        ts_headline(
          'english',
          chunks.raw_text,
          query_input.ts_query,
          'MaxWords=22, MinWords=8, ShortWord=3, HighlightAll=false'
        ) as matched_excerpt,
        ts_rank(chunks.fts, query_input.ts_query) as rank
      from public.chunks
      inner join public.sources on sources.id = chunks.source_id
      cross join query_input
      where query_input.raw_query is not null
        and sources.status = 'published'
        and chunks.fts @@ query_input.ts_query
    ) matches
    order by source_id, rank desc
    limit 30
  ),
  source_results as (
    select jsonb_build_object(
      'kind', 'source',
      'id', source_matches.source_id,
      'title', source_matches.title,
      'format', source_matches.format,
      'tier', source_matches.tier,
      'matchedExcerpt', source_matches.matched_excerpt,
      'chunkId', source_matches.chunk_id
    ) as result
    from source_matches
    order by source_matches.rank desc, source_matches.title asc
  )
  select jsonb_build_object(
    'entities', coalesce((select jsonb_agg(result) from entity_results), '[]'::jsonb),
    'claims', coalesce((select jsonb_agg(result) from claim_results), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(result) from source_results), '[]'::jsonb)
  );
$$;

create or replace function public.refresh_search_indexes()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Generated tsvector columns recompute on row changes; Phase 5 publication jobs can call
  -- this RPC after batch publishes as a cheap contract check before moving to an external index.
  perform 1
  from public.entities
  where status = 'published'
    and fts is null
  limit 1;
end;
$$;

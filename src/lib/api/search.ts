import { supabase } from '@/lib/supabase/client'
import type {
  ClaimSearchResult,
  EntitySearchResult,
  SearchResults,
  SourceSearchResult,
} from '@/types/domain'
import type { Json } from '@/types/database'

interface SearchAllOptions {
  signal?: AbortSignal
}

const EMPTY_RESULTS: SearchResults = {
  claims: [],
  entities: [],
  sources: [],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isEntitySearchResult = (value: unknown): value is EntitySearchResult => {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.kind === 'entity' &&
    typeof value.id === 'string' &&
    typeof value.type === 'string' &&
    typeof value.name === 'string' &&
    typeof value.slug === 'string' &&
    typeof value.confidenceScore === 'number' &&
    typeof value.matchedExcerpt === 'string'
  )
}

const isClaimSearchResult = (value: unknown): value is ClaimSearchResult => {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.kind === 'claim' &&
    typeof value.id === 'string' &&
    typeof value.statement === 'string' &&
    typeof value.confidenceScore === 'number' &&
    typeof value.matchedExcerpt === 'string'
  )
}

const isSourceSearchResult = (value: unknown): value is SourceSearchResult => {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.kind === 'source' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.format === 'string' &&
    typeof value.tier === 'string' &&
    typeof value.matchedExcerpt === 'string' &&
    (value.chunkId === undefined || typeof value.chunkId === 'string' || value.chunkId === null)
  )
}

const normalizeSearchResults = (value: unknown): SearchResults => {
  if (!isRecord(value)) {
    return EMPTY_RESULTS
  }

  const entities = Array.isArray(value.entities)
    ? value.entities.filter(isEntitySearchResult)
    : EMPTY_RESULTS.entities
  const claims = Array.isArray(value.claims)
    ? value.claims.filter(isClaimSearchResult)
    : EMPTY_RESULTS.claims
  const sources = Array.isArray(value.sources)
    ? value.sources.filter(isSourceSearchResult).map((source) => ({
        ...source,
        chunkId: source.chunkId ?? undefined,
      }))
    : EMPTY_RESULTS.sources

  return { claims, entities, sources }
}

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'

const searchViaRpc = async (query: string) => {
  const { data, error } = await supabase.rpc('search_global', { search_query: query })

  if (error) {
    throw error
  }

  return normalizeSearchResults(data as Json)
}

export const searchAll = async (
  query: string,
  options: SearchAllOptions = {}
): Promise<SearchResults> => {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return EMPTY_RESULTS
  }

  try {
    const { data, error } = await supabase.functions.invoke('search', {
      body: { query: trimmedQuery },
      signal: options.signal,
    })

    if (error) {
      throw error
    }

    return normalizeSearchResults(data)
  } catch (error) {
    if (options.signal?.aborted || isAbortError(error)) {
      throw error
    }

    return searchViaRpc(trimmedQuery)
  }
}

export const searchEntities = async (query: string): Promise<EntitySearchResult[]> => {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return []
  }

  const { data, error } = await supabase.rpc('search_entities', { search_query: trimmedQuery })

  if (error) {
    throw error
  }

  return data.map((entity) => ({
    confidenceScore: entity.confidence_score,
    id: entity.id,
    kind: 'entity',
    matchedExcerpt: entity.matched_excerpt,
    name: entity.name,
    slug: entity.slug,
    type: entity.type,
  }))
}

export const refreshSearchIndexes = async () => {
  const { error } = await supabase.rpc('refresh_search_indexes')

  if (error) {
    throw error
  }
}

// The Edge Function wraps PostgreSQL FTS plus pg_trgm fuzzy entity matching, while the RPC
// fallback keeps local/simple reads working without the function server. If search latency
// becomes a bottleneck, keep this API stable and move only the function internals to Typesense.

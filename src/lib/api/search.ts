import { supabase } from '@/lib/supabase/client'
import { EMPTY_SEARCH_RESULTS } from '@/lib/searchResults'
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

interface RefreshSearchIndexesStatus {
  missingChunkFts: number
  missingEntityFts: number
  ok: boolean
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
    return EMPTY_SEARCH_RESULTS
  }

  const entities = Array.isArray(value.entities)
    ? value.entities.filter(isEntitySearchResult)
    : EMPTY_SEARCH_RESULTS.entities
  const claims = Array.isArray(value.claims)
    ? value.claims.filter(isClaimSearchResult)
    : EMPTY_SEARCH_RESULTS.claims
  const sources = Array.isArray(value.sources)
    ? value.sources.filter(isSourceSearchResult).map((source) => ({
        ...source,
        chunkId: source.chunkId ?? undefined,
      }))
    : EMPTY_SEARCH_RESULTS.sources

  return { claims, entities, sources }
}

const isAbortError = (error: unknown) =>
  error instanceof DOMException && error.name === 'AbortError'

const abortError = () => new DOMException('Aborted', 'AbortError')

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw abortError()
  }
}

const searchViaRpc = async (query: string, signal?: AbortSignal) => {
  throwIfAborted(signal)

  const rpcQuery = supabase.rpc('search_global', { search_query: query })
  const { data, error } = signal ? await rpcQuery.abortSignal(signal) : await rpcQuery

  throwIfAborted(signal)

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
    return EMPTY_SEARCH_RESULTS
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
    if (options.signal?.aborted) {
      throw abortError()
    }

    if (isAbortError(error)) {
      throw error
    }

    return searchViaRpc(trimmedQuery, options.signal)
  }
}

export const searchEntities = async (
  query: string,
  options: SearchAllOptions = {}
): Promise<EntitySearchResult[]> => {
  const trimmedQuery = query.trim()

  if (!trimmedQuery) {
    return []
  }

  throwIfAborted(options.signal)

  const rpcQuery = supabase.rpc('search_entities', { search_query: trimmedQuery })
  const { data, error } = options.signal
    ? await rpcQuery.abortSignal(options.signal)
    : await rpcQuery

  throwIfAborted(options.signal)

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

const isRefreshSearchIndexesStatus = (value: unknown): value is RefreshSearchIndexesStatus =>
  isRecord(value) &&
  typeof value.ok === 'boolean' &&
  typeof value.missingEntityFts === 'number' &&
  typeof value.missingChunkFts === 'number'

export const refreshSearchIndexes = async (): Promise<RefreshSearchIndexesStatus> => {
  const { data, error } = await supabase.rpc('refresh_search_indexes')

  if (error) {
    throw error
  }

  if (!isRefreshSearchIndexesStatus(data)) {
    throw new Error('Search index refresh returned an invalid status payload.')
  }

  if (!data.ok) {
    throw new Error(
      `Search index check failed: ${data.missingEntityFts} entities and ${data.missingChunkFts} chunks are missing FTS values.`
    )
  }

  return data
}

// The Edge Function wraps PostgreSQL FTS plus pg_trgm fuzzy entity matching, while the RPC
// fallback keeps local/simple reads working without the function server. If search latency
// becomes a bottleneck, keep this API stable and move only the function internals to Typesense.

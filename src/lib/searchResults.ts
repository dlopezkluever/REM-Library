import { ENTITY_LABELS } from '@/constants/entityTypes'
import type {
  ClaimSearchResult,
  EntitySearchResult,
  EntityType,
  SearchResults,
  SourceSearchResult,
} from '@/types/domain'

export const EMPTY_SEARCH_RESULTS: SearchResults = {
  claims: [],
  entities: [],
  sources: [],
}

export type SearchResultItem =
  | {
      groupLabel: string
      result: EntitySearchResult
      route: string
      title: string
      typeLabel: string
    }
  | {
      groupLabel: string
      result: ClaimSearchResult
      route: string
      title: string
      typeLabel: string
    }
  | {
      groupLabel: string
      result: SourceSearchResult
      route: string
      title: string
      typeLabel: string
    }

const ENTITY_GROUPS: Array<{ label: string; type: EntityType }> = [
  { label: 'Symbols', type: 'symbol' },
  { label: 'Figures', type: 'figure' },
  { label: 'Narratives', type: 'narrative' },
  { label: 'Tropes', type: 'trope' },
  { label: 'Cultures', type: 'culture' },
]

export const searchResultPath = (result: SearchResultItem['result']) => {
  if (result.kind === 'entity') {
    return `/entity/${result.slug}`
  }

  if (result.kind === 'claim') {
    return `/claim/${result.id}`
  }

  return `/source/${result.id}`
}

export const flattenSearchResults = (results: SearchResults, perGroup = 3): SearchResultItem[] => {
  const entityItems = ENTITY_GROUPS.flatMap(({ label, type }) =>
    results.entities
      .filter((entity) => entity.type === type)
      .slice(0, perGroup)
      .map((entity) => ({
        groupLabel: label,
        result: entity,
        route: searchResultPath(entity),
        title: entity.name,
        typeLabel: ENTITY_LABELS[entity.type],
      }))
  )

  const claimItems = results.claims.slice(0, perGroup).map((claim) => ({
    groupLabel: 'Claims',
    result: claim,
    route: searchResultPath(claim),
    title: claim.statement,
    typeLabel: 'Claim',
  }))

  const sourceItems = results.sources.slice(0, perGroup).map((source) => ({
    groupLabel: 'Sources',
    result: source,
    route: searchResultPath(source),
    title: source.title,
    typeLabel: source.format,
  }))

  return [...entityItems, ...claimItems, ...sourceItems]
}

export const hasSearchResults = (results: SearchResults) =>
  results.entities.length > 0 || results.claims.length > 0 || results.sources.length > 0

export const stripSearchHeadlineTags = (value: string) => value.replace(/<\/?b>/g, '')

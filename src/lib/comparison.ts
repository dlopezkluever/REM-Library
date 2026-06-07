import type { EntityType } from '@/types/domain'

export const COMPARE_KEYS = ['a', 'b', 'c', 'd'] as const
export const MAX_COMPARE = COMPARE_KEYS.length

export interface ComparableEntity {
  id: string
  name: string
  slug: string
  type: EntityType
}

export interface ComparableConnection {
  entity: ComparableEntity
}

export interface SharedConnection {
  entity: ComparableEntity
  columnIndices: number[]
}

export function parseCompareSlugs(params: URLSearchParams): string[] {
  const slugs: string[] = []
  for (const key of COMPARE_KEYS) {
    const value = params.get(key)?.trim()
    if (value && !slugs.includes(value)) {
      slugs.push(value)
    }
  }
  return slugs
}

export function buildCompareSearch(slugs: string[]): string {
  const params = new URLSearchParams()
  dedupeStrings(slugs)
    .slice(0, MAX_COMPARE)
    .forEach((slug, index) => {
      params.set(COMPARE_KEYS[index], slug)
    })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function appendCompareSlug(existing: string[], slug: string): string[] {
  // Comparison history is recency based: clicking an existing slug moves it to
  // the end, and the oldest column drops when more than four are selected.
  const merged = dedupeStrings([...existing.filter((value) => value !== slug), slug])
  return merged.slice(Math.max(0, merged.length - MAX_COMPARE))
}

export function computeSharedConnections(
  connectionsByColumn: ComparableConnection[][],
  comparedEntityIds: string[] = []
): SharedConnection[] {
  const compared = new Set(comparedEntityIds)
  const shared = new Map<string, SharedConnection>()

  connectionsByColumn.forEach((connections, columnIndex) => {
    const seenInColumn = new Set<string>()
    for (const connection of connections) {
      const { id } = connection.entity
      if (compared.has(id) || seenInColumn.has(id)) {
        continue
      }
      seenInColumn.add(id)
      const existing = shared.get(id)
      if (existing) {
        existing.columnIndices.push(columnIndex)
      } else {
        shared.set(id, { entity: connection.entity, columnIndices: [columnIndex] })
      }
    }
  })

  return Array.from(shared.values())
    .filter((entry) => entry.columnIndices.length >= 2)
    .sort(
      (a, b) =>
        b.columnIndices.length - a.columnIndices.length ||
        a.entity.name.localeCompare(b.entity.name)
    )
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    if (seen.has(value)) {
      return false
    }
    seen.add(value)
    return true
  })
}

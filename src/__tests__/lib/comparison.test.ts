import { describe, expect, it } from 'vitest'
import {
  appendCompareSlug,
  buildCompareSearch,
  computeSharedConnections,
  parseCompareSlugs,
  MAX_COMPARE,
  type ComparableConnection,
} from '@/lib/comparison'
import type { EntityType } from '@/types/domain'

const connection = (id: string, name = id): ComparableConnection => ({
  entity: { id, name, slug: name.toLowerCase(), type: 'symbol' as EntityType },
})

describe('parseCompareSlugs', () => {
  it('reads slugs from a, b, c, d in order', () => {
    const params = new URLSearchParams('a=fire&b=water&c=stone')
    expect(parseCompareSlugs(params)).toEqual(['fire', 'water', 'stone'])
  })

  it('skips blank and duplicate values', () => {
    const params = new URLSearchParams('a=fire&b=&c=fire&d=water')
    expect(parseCompareSlugs(params)).toEqual(['fire', 'water'])
  })
})

describe('buildCompareSearch', () => {
  it('encodes slugs back into ordered keys', () => {
    expect(buildCompareSearch(['fire', 'water'])).toBe('?a=fire&b=water')
  })

  it('caps at MAX_COMPARE entities', () => {
    const slugs = ['a', 'b', 'c', 'd', 'e']
    const search = buildCompareSearch(slugs)
    expect(search).toBe('?a=a&b=b&c=c&d=d')
    expect(new URLSearchParams(search).get(String.fromCharCode(101))).toBeNull()
  })

  it('returns an empty string for no slugs', () => {
    expect(buildCompareSearch([])).toBe('')
  })
})

describe('appendCompareSlug', () => {
  it('appends a new slug', () => {
    expect(appendCompareSlug(['fire'], 'water')).toEqual(['fire', 'water'])
  })

  it('moves an existing slug to the end without duplicating', () => {
    expect(appendCompareSlug(['fire', 'water'], 'fire')).toEqual(['water', 'fire'])
  })

  it('keeps only the most recent MAX_COMPARE slugs', () => {
    const result = appendCompareSlug(['a', 'b', 'c', 'd'], 'e')
    expect(result).toHaveLength(MAX_COMPARE)
    expect(result).toEqual(['b', 'c', 'd', 'e'])
  })
})

describe('computeSharedConnections', () => {
  it('returns connections present in at least two columns', () => {
    const shared = computeSharedConnections([
      [connection('1'), connection('2')],
      [connection('2'), connection('3')],
    ])
    expect(shared).toHaveLength(1)
    expect(shared[0].entity.id).toBe('2')
    expect(shared[0].columnIndices).toEqual([0, 1])
  })

  it('excludes the compared entities themselves', () => {
    const shared = computeSharedConnections(
      [
        [connection('compared'), connection('shared')],
        [connection('compared'), connection('shared')],
      ],
      ['compared']
    )
    expect(shared.map((entry) => entry.entity.id)).toEqual(['shared'])
  })

  it('ignores duplicate connections within a single column', () => {
    const shared = computeSharedConnections([[connection('1'), connection('1')], [connection('1')]])
    expect(shared).toHaveLength(1)
    expect(shared[0].columnIndices).toEqual([0, 1])
  })

  it('sorts by how many columns share the connection', () => {
    const shared = computeSharedConnections([
      [connection('a'), connection('b')],
      [connection('a'), connection('b')],
      [connection('a')],
    ])
    expect(shared.map((entry) => entry.entity.id)).toEqual(['a', 'b'])
    expect(shared[0].columnIndices).toEqual([0, 1, 2])
  })
})

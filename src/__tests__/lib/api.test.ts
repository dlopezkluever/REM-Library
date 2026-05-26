import { describe, expect, it } from 'vitest'
import { getClaimById, getClaimsForEntity } from '@/lib/api/claims'
import { getEntityBySlug, getEntityNeighborhood, getPublishedEntities } from '@/lib/api/entities'
import { getAllPublishedRelationships, getRelationshipsForEntity } from '@/lib/api/relationships'
import { getAllSources, getSourceAnchorsForClaim, getSourceById } from '@/lib/api/sources'
import { supabase } from '@/lib/supabase/client'

const localSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const describeLocalSupabase =
  import.meta.env.VITE_SUPABASE_INTEGRATION_TESTS === 'true' &&
  (localSupabaseUrl.includes('127.0.0.1') || localSupabaseUrl.includes('localhost'))
    ? describe
    : describe.skip

describeLocalSupabase('Supabase API layer', () => {
  it('returns seeded published graph data', async () => {
    const entities = await getPublishedEntities()
    expect(entities.length).toBeGreaterThan(0)
    expect(entities.every((entity) => entity.status === 'published')).toBe(true)

    const fire = await getEntityBySlug('fire')
    expect(fire.name).toBe('Fire')

    const neighborhood = await getEntityNeighborhood(fire.id, 2)
    expect(neighborhood.entities.length).toBeGreaterThan(0)
    expect(neighborhood.relationships.length).toBeGreaterThan(0)

    const relationships = await getAllPublishedRelationships()
    expect(relationships.length).toBeGreaterThan(0)

    const entityRelationships = await getRelationshipsForEntity(fire.id)
    expect(entityRelationships.length).toBeGreaterThan(0)

    const claims = await getClaimsForEntity(fire.id)
    expect(claims.length).toBeGreaterThan(0)

    const claim = await getClaimById(claims[0].id)
    expect(claim.status).toBe('published')

    const sources = await getAllSources()
    expect(sources.length).toBeGreaterThan(0)

    const source = await getSourceById(sources[0].id)
    expect(source.status).toBe('published')

    const anchors = await getSourceAnchorsForClaim(claim.id)
    expect(anchors.length).toBeGreaterThan(0)
  })

  it('blocks anonymous draft reads and writes through RLS', async () => {
    const { data: draftEntities, error: draftReadError } = await supabase
      .from('entities')
      .select('*')
      .eq('slug', 'draft-figure')

    expect(draftReadError).toBeNull()
    expect(draftEntities).toEqual([])

    const { error: insertError } = await supabase.from('entities').insert({
      type: 'symbol',
      name: 'Anonymous Insert',
      slug: 'anonymous-insert',
    })

    expect(insertError).not.toBeNull()
  })
})

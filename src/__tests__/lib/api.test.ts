import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { getClaimById, getClaimsForEntity } from '@/lib/api/claims'
import { getEntityBySlug, getEntityNeighborhood, getPublishedEntities } from '@/lib/api/entities'
import { getAllPublishedRelationships, getRelationshipsForEntity } from '@/lib/api/relationships'
import { searchAll } from '@/lib/api/search'
import { getAllSources, getSourceAnchorsForClaim, getSourceById } from '@/lib/api/sources'
import { supabase } from '@/lib/supabase/client'
import type { Database } from '@/types/database'

const localSupabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const localServiceRoleKey =
  import.meta.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.KP4pwMOTLQl83IqxvbR0GEWp6qSuHFQNfhkYHo4g67Y'
const describeLocalSupabase =
  import.meta.env.VITE_SUPABASE_INTEGRATION_TESTS === 'true' &&
  (localSupabaseUrl.includes('127.0.0.1') || localSupabaseUrl.includes('localhost'))
    ? describe
    : describe.skip
const serviceSupabase = createClient<Database>(
  localSupabaseUrl || 'http://127.0.0.1:54321',
  localServiceRoleKey
)

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

  it('searches seeded entities, claims, and empty queries', async () => {
    const prometheusResults = await searchAll('prometheus')
    expect(prometheusResults.entities.some((entity) => entity.slug === 'prometheus')).toBe(true)

    const fireTheftResults = await searchAll('fire theft')
    expect(
      fireTheftResults.entities.length +
        fireTheftResults.claims.length +
        fireTheftResults.sources.length
    ).toBeGreaterThan(0)

    const emptyResults = await searchAll('zzzzz')
    expect(emptyResults).toEqual({ claims: [], entities: [], sources: [] })
  })

  it('finds a newly inserted entity through generated search indexes', async () => {
    const slug = `helios-search-beacon-${Date.now()}`

    const { data: insertedEntity, error: insertError } = await serviceSupabase
      .from('entities')
      .insert({
        confidence_score: 0.66,
        description: 'A solar test entity inserted to verify immediate full-text search indexing.',
        name: 'Helios Search Beacon',
        slug,
        status: 'published',
        type: 'symbol',
      })
      .select('id')
      .single()

    expect(insertError).toBeNull()
    expect(insertedEntity).not.toBeNull()

    try {
      const results = await searchAll('helios beacon')
      expect(results.entities.some((entity) => entity.slug === slug)).toBe(true)
    } finally {
      if (insertedEntity) {
        await serviceSupabase.from('entities').delete().eq('id', insertedEntity.id)
      }
    }
  })
})

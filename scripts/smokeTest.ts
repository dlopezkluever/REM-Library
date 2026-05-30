import { getClaimById, getClaimsForEntity } from '@/lib/api/claims'
import { getEntityNeighborhood, getPublishedEntities } from '@/lib/api/entities'
import { getAllPublishedRelationships, getRelationshipsForEntity } from '@/lib/api/relationships'
import { getAllSources, getSourceAnchorsForClaim, getSourceById } from '@/lib/api/sources'
import { supabase } from '@/lib/supabase/client'

const assert = (condition: boolean, message: string) => {
  if (!condition) {
    throw new Error(message)
  }
}

const run = async () => {
  const entities = await getPublishedEntities()
  assert(entities.length > 0, 'Expected published entities')
  assert(!entities.some((entity) => entity.status !== 'published'), 'Expected only published entities')

  const fire = entities.find((entity) => entity.slug === 'fire') ?? entities[0]
  const entity = await getEntityNeighborhood(fire.id, 2)
  assert(entity.entities.length > 0, 'Expected entity neighborhood entities')
  assert(entity.relationships.length > 0, 'Expected entity neighborhood relationships')

  const relationships = await getAllPublishedRelationships()
  assert(relationships.length > 0, 'Expected published relationships')

  const relationshipsForEntity = await getRelationshipsForEntity(fire.id)
  assert(relationshipsForEntity.length > 0, 'Expected relationships for seed entity')

  const claims = await getClaimsForEntity(fire.id)
  assert(claims.length > 0, 'Expected claims for seed entity')

  const claim = await getClaimById(claims[0].id)
  assert(claim.status === 'published', 'Expected a published claim')

  const sources = await getAllSources()
  assert(sources.length > 0, 'Expected published sources')

  const source = await getSourceById(sources[0].id)
  assert(source.status === 'published', 'Expected a published source')

  const anchors = await getSourceAnchorsForClaim(claim.id)
  assert(anchors.length > 0, 'Expected source anchors for claim')

  const { error: insertError } = await supabase.from('entities').insert({
    type: 'symbol',
    name: 'Blocked Anon Insert',
    slug: 'blocked-anon-insert',
  })
  assert(Boolean(insertError), 'Expected anonymous insert to be blocked by RLS')

  console.log('Smoke test passed')
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

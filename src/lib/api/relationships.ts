import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type RelationshipRow = Tables<'relationships'>

const unique = (values: string[]) => Array.from(new Set(values))

const withEffectiveWeight = (relationship: RelationshipRow): RelationshipRow => ({
  ...relationship,
  weight: relationship.weight_override ?? relationship.weight,
})

export const filterPublicRelationships = async (relationships: RelationshipRow[]) => {
  const activeRelationships = relationships.filter((relationship) => relationship.status === 'active')

  if (activeRelationships.length === 0) {
    return []
  }

  const entityIds = unique(
    activeRelationships.flatMap((relationship) => [
      relationship.from_entity_id,
      relationship.to_entity_id,
    ])
  )
  const claimIds = unique(activeRelationships.flatMap((relationship) => relationship.claim_ids))

  if (claimIds.length === 0) {
    return []
  }

  const { data: publishedEntities, error: entitiesError } = await supabase
    .from('entities')
    .select('id')
    .in('id', entityIds)
    .eq('status', 'published')

  if (entitiesError) {
    throw entitiesError
  }

  const { data: publishedClaims, error: claimsError } = await supabase
    .from('claims')
    .select('id')
    .in('id', claimIds)
    .eq('status', 'published')

  if (claimsError) {
    throw claimsError
  }

  const publishedEntityIds = new Set(publishedEntities.map((entity) => entity.id))
  const publishedClaimIds = new Set(publishedClaims.map((claim) => claim.id))

  return activeRelationships
    .filter(
      (relationship) =>
        publishedEntityIds.has(relationship.from_entity_id) &&
        publishedEntityIds.has(relationship.to_entity_id) &&
        relationship.claim_ids.some((claimId) => publishedClaimIds.has(claimId))
    )
    .map(withEffectiveWeight)
}

export const getAllPublishedRelationships = async () => {
  const { data, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('status', 'active')
    .order('created_at')

  if (error) {
    throw error
  }

  return filterPublicRelationships(data)
}

export const getRelationshipsForEntity = async (entityId: string) => {
  const { data, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('status', 'active')
    .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`)
    .order('created_at')

  if (error) {
    throw error
  }

  return filterPublicRelationships(data)
}

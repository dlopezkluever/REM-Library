import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type ClaimRow = Tables<'claims'>
export type ClaimGraphEntity = Tables<'entities'> & { isDirect: boolean }
export type ClaimGraphRelationship = Tables<'relationships'>

export interface ClaimGraph {
  directEntityCount: number
  entities: ClaimGraphEntity[]
  relationships: ClaimGraphRelationship[]
  truncatedDirectEntityCount: number
}

export interface ClaimWithAuthor extends Tables<'claims'> {
  profiles: { display_name: string | null } | null
}

const CLAIM_WITH_AUTHOR_SELECT = '*, profiles!claims_author_id_fkey(display_name)'

const getEffectiveClaimConfidence = (claim: Tables<'claims'>) => {
  return claim.confidence_override ?? claim.confidence_score
}

const sortClaimsForEntity = (claims: ClaimWithAuthor[]) => {
  return [...claims].sort((firstClaim, secondClaim) => {
    if (firstClaim.is_canonical !== secondClaim.is_canonical) {
      return firstClaim.is_canonical ? -1 : 1
    }

    return getEffectiveClaimConfidence(secondClaim) - getEffectiveClaimConfidence(firstClaim)
  })
}

export const getClaimById = async (id: string): Promise<ClaimWithAuthor> => {
  const { data, error } = await supabase
    .from('claims')
    .select(CLAIM_WITH_AUTHOR_SELECT)
    .eq('id', id)
    .single()

  if (error) {
    throw error
  }

  return data as unknown as ClaimWithAuthor
}

export const getEntitiesForClaim = async (claimId: string) => {
  const { data: entityLinks, error: entityLinksError } = await supabase
    .from('claim_entities')
    .select('entity_id')
    .eq('claim_id', claimId)

  if (entityLinksError) {
    throw entityLinksError
  }

  const entityIds = entityLinks.map((entityLink) => entityLink.entity_id)

  if (entityIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .in('id', entityIds)
    .eq('status', 'published')
    .order('name')

  if (error) {
    throw error
  }

  return data
}

export const getClaimGraph = async (claimId: string): Promise<ClaimGraph> => {
  const { data: entityLinks, error: entityLinksError } = await supabase
    .from('claim_entities')
    .select('entity_id')
    .eq('claim_id', claimId)

  if (entityLinksError) {
    throw entityLinksError
  }

  const directEntityIds = Array.from(new Set(entityLinks.map((link) => link.entity_id)))

  if (directEntityIds.length === 0) {
    return {
      directEntityCount: 0,
      entities: [],
      relationships: [],
      truncatedDirectEntityCount: 0,
    }
  }

  const directRelationshipFilter = `from_entity_id.in.(${directEntityIds.join(',')}),to_entity_id.in.(${directEntityIds.join(',')})`
  const { data: directRelationships, error: directRelationshipsError } = await supabase
    .from('relationships')
    .select('*')
    .eq('status', 'active')
    .or(directRelationshipFilter)
    .order('weight', { ascending: false })
    .limit(300)

  if (directRelationshipsError) {
    throw directRelationshipsError
  }

  const { data: directEntities, error: directEntitiesError } = await supabase
    .from('entities')
    .select('id, name')
    .in('id', directEntityIds)
    .eq('status', 'published')

  if (directEntitiesError) {
    throw directEntitiesError
  }

  const directEntityNames = new Map(directEntities.map((entity) => [entity.id, entity.name]))
  const directEntityWeights = new Map(directEntityIds.map((entityId) => [entityId, 0]))

  directRelationships.forEach((relationship) => {
    if (directEntityWeights.has(relationship.from_entity_id)) {
      directEntityWeights.set(
        relationship.from_entity_id,
        (directEntityWeights.get(relationship.from_entity_id) ?? 0) + relationship.weight
      )
    }

    if (directEntityWeights.has(relationship.to_entity_id)) {
      directEntityWeights.set(
        relationship.to_entity_id,
        (directEntityWeights.get(relationship.to_entity_id) ?? 0) + relationship.weight
      )
    }
  })

  const cappedDirectEntityIds = [...directEntityIds]
    .sort((firstId, secondId) => {
      const weightDelta =
        (directEntityWeights.get(secondId) ?? 0) - (directEntityWeights.get(firstId) ?? 0)

      if (weightDelta !== 0) {
        return weightDelta
      }

      return (directEntityNames.get(firstId) ?? firstId).localeCompare(
        directEntityNames.get(secondId) ?? secondId
      )
    })
    .slice(0, 10)
  const directEntitySet = new Set(cappedDirectEntityIds)
  const relationships = directRelationships
    .filter(
      (relationship) =>
        directEntitySet.has(relationship.from_entity_id) ||
        directEntitySet.has(relationship.to_entity_id)
    )
    .slice(0, 80)

  const neighborIds = relationships
    .flatMap((relationship) => [relationship.from_entity_id, relationship.to_entity_id])
    .filter((entityId) => !directEntitySet.has(entityId))
  const returnedEntityIds = Array.from(
    new Set([...cappedDirectEntityIds, ...neighborIds.slice(0, 15)])
  )

  const { data: entities, error: entitiesError } = await supabase
    .from('entities')
    .select('*')
    .in('id', returnedEntityIds)
    .eq('status', 'published')

  if (entitiesError) {
    throw entitiesError
  }

  const entitySet = new Set(entities.map((entity) => entity.id))

  return {
    directEntityCount: directEntityIds.length,
    entities: entities.map((entity) => ({
      ...entity,
      isDirect: directEntitySet.has(entity.id),
    })),
    relationships: relationships.filter(
      (relationship) =>
        entitySet.has(relationship.from_entity_id) && entitySet.has(relationship.to_entity_id)
    ),
    truncatedDirectEntityCount: Math.max(0, directEntityIds.length - cappedDirectEntityIds.length),
  }
}

interface ClaimsForEntityOptions {
  includeDisputed?: boolean
}

export interface ClaimsForEntityResult {
  disputedClaims: ClaimWithAuthor[]
  publishedClaims: ClaimWithAuthor[]
}

export async function getClaimsForEntity(entityId: string): Promise<ClaimWithAuthor[]>
export async function getClaimsForEntity(
  entityId: string,
  options: { includeDisputed: true }
): Promise<ClaimsForEntityResult>
export async function getClaimsForEntity(
  entityId: string,
  options: ClaimsForEntityOptions = {}
): Promise<ClaimWithAuthor[] | ClaimsForEntityResult> {
  const { data: claimLinks, error: claimLinksError } = await supabase
    .from('claim_entities')
    .select('claim_id')
    .eq('entity_id', entityId)

  if (claimLinksError) {
    throw claimLinksError
  }

  const claimIds = claimLinks.map((claimLink) => claimLink.claim_id)

  if (claimIds.length === 0) {
    return options.includeDisputed ? { disputedClaims: [], publishedClaims: [] } : []
  }

  const fetchClaimsByStatus = async (status: 'published' | 'disputed') => {
    const { data, error } = await supabase
      .from('claims')
      .select(CLAIM_WITH_AUTHOR_SELECT)
      .in('id', claimIds)
      .eq('status', status)

    if (error) {
      throw error
    }

    return sortClaimsForEntity(data as unknown as ClaimWithAuthor[])
  }

  const publishedClaims = await fetchClaimsByStatus('published')

  if (!options.includeDisputed) {
    return publishedClaims
  }

  return {
    disputedClaims: await fetchClaimsByStatus('disputed'),
    publishedClaims,
  }
}

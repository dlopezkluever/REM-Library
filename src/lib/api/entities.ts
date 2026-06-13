import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'
import type { EntityPositionUpdate } from '@/lib/graph/types'
import type { EntityType } from '@/types/domain'
import { filterPublicRelationships } from '@/lib/api/relationships'

export type EntityRow = Tables<'entities'>
export type RelationshipRow = Tables<'relationships'>
export type PreviewClaimRow = Pick<
  Tables<'claims'>,
  | 'confidence_override'
  | 'confidence_score'
  | 'id'
  | 'interpretation_frame'
  | 'is_canonical'
  | 'statement'
>

export interface EntityNeighborhood {
  entities: EntityRow[]
  relationships: RelationshipRow[]
}

export interface EntityPreviewWithClaims {
  entity: EntityRow
  previewClaims: PreviewClaimRow[]
}

const unique = (values: string[]) => Array.from(new Set(values))

interface PublishedEntityOptions {
  search?: string
  type?: EntityType
  limit?: number
}

export const getPublishedEntities = async (options: PublishedEntityOptions = {}) => {
  let query = supabase.from('entities').select('*').eq('status', 'published').order('name')

  if (options.search?.trim()) {
    query = query.ilike('name', `%${options.search.trim()}%`)
  }

  if (options.type) {
    query = query.eq('type', options.type)
  }

  if (options.limit) {
    query = query.limit(options.limit)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return data
}

export const getPublishedCultureEntities = async () => {
  return getPublishedEntities({ type: 'culture' })
}

// Published Narrative and Figure entities that have been dated by an admin,
// ordered chronologically for the timeline view.
export const getTimelineEntities = async (): Promise<EntityRow[]> => {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('status', 'published')
    .in('type', ['narrative', 'figure'])
    .not('date_era', 'is', null)
    .not('date_sort_year', 'is', null)
    .order('date_sort_year', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export const getEntityBySlug = async (slug: string) => {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (error) {
    throw error
  }

  return data
}

const getEffectiveClaimConfidence = (claim: PreviewClaimRow) =>
  claim.confidence_override ?? claim.confidence_score

export const getEntityPreviewWithClaims = async (
  entityId: string
): Promise<EntityPreviewWithClaims> => {
  const { data: entity, error: entityError } = await supabase
    .from('entities')
    .select('*')
    .eq('id', entityId)
    .eq('status', 'published')
    .single()

  if (entityError) {
    throw entityError
  }

  const { data: claimLinks, error: claimLinksError } = await supabase
    .from('claim_entities')
    .select('claim_id')
    .eq('entity_id', entityId)

  if (claimLinksError) {
    throw claimLinksError
  }

  const claimIds = claimLinks.map((claimLink) => claimLink.claim_id)

  if (claimIds.length === 0) {
    return { entity, previewClaims: [] }
  }

  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select(
      'id, statement, confidence_score, confidence_override, interpretation_frame, is_canonical'
    )
    .in('id', claimIds)
    .eq('status', 'published')

  if (claimsError) {
    throw claimsError
  }

  const previewClaims = [...(claims as PreviewClaimRow[])]
    .sort((firstClaim, secondClaim) => {
      if (firstClaim.is_canonical !== secondClaim.is_canonical) {
        return firstClaim.is_canonical ? -1 : 1
      }

      return getEffectiveClaimConfidence(secondClaim) - getEffectiveClaimConfidence(firstClaim)
    })
    .slice(0, 2)

  return { entity, previewClaims }
}

export const getEntityNeighborhood = async (
  id: string,
  hops: 1 | 2 = 1
): Promise<EntityNeighborhood> => {
  const { data: firstHopRelationshipRows, error: firstHopError } = await supabase
    .from('relationships')
    .select('*')
    .eq('status', 'active')
    .or(`from_entity_id.eq.${id},to_entity_id.eq.${id}`)

  if (firstHopError) {
    throw firstHopError
  }

  const firstHopRelationships = await filterPublicRelationships(firstHopRelationshipRows)
  const firstHopEntityIds = unique(
    firstHopRelationships.flatMap((relationship) => [
      relationship.from_entity_id,
      relationship.to_entity_id,
    ])
  )

  let relationships = firstHopRelationships
  let entityIds = firstHopEntityIds

  if (hops === 2 && firstHopEntityIds.length > 0) {
    const filters = firstHopEntityIds
      .flatMap((entityId) => [`from_entity_id.eq.${entityId}`, `to_entity_id.eq.${entityId}`])
      .join(',')

    const { data: secondHopRelationshipRows, error: secondHopError } = await supabase
      .from('relationships')
      .select('*')
      .eq('status', 'active')
      .or(filters)

    if (secondHopError) {
      throw secondHopError
    }

    const secondHopRelationships = await filterPublicRelationships(secondHopRelationshipRows)
    relationships = Array.from(
      new Map(
        [...firstHopRelationships, ...secondHopRelationships].map((relationship) => [
          relationship.id,
          relationship,
        ])
      ).values()
    )
    entityIds = unique(
      relationships.flatMap((relationship) => [
        relationship.from_entity_id,
        relationship.to_entity_id,
      ])
    )
  }

  if (entityIds.length === 0) {
    return { entities: [], relationships: [] }
  }

  const { data: entities, error: entitiesError } = await supabase
    .from('entities')
    .select('*')
    .in('id', entityIds)
    .eq('status', 'published')
    .order('name')

  if (entitiesError) {
    throw entitiesError
  }

  const visibleEntityIds = new Set(entities.map((entity) => entity.id))
  const visibleRelationships = relationships.filter(
    (relationship) =>
      visibleEntityIds.has(relationship.from_entity_id) &&
      visibleEntityIds.has(relationship.to_entity_id)
  )

  return { entities, relationships: visibleRelationships }
}

export const persistEntityPositions = async (positions: EntityPositionUpdate[]) => {
  await Promise.all(
    positions.map((position) =>
      supabase
        .from('entities')
        .update({
          position_x: position.position_x,
          position_y: position.position_y,
        })
        .eq('id', position.id)
    )
  )
}

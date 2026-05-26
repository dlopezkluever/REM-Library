import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type EntityRow = Tables<'entities'>
export type RelationshipRow = Tables<'relationships'>

export interface EntityNeighborhood {
  entities: EntityRow[]
  relationships: RelationshipRow[]
}

const unique = (values: string[]) => Array.from(new Set(values))

export const getPublishedEntities = async () => {
  const { data, error } = await supabase
    .from('entities')
    .select('*')
    .eq('status', 'published')
    .order('name')

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

export const getEntityNeighborhood = async (
  id: string,
  hops: 1 | 2 = 1
): Promise<EntityNeighborhood> => {
  const { data: firstHopRelationships, error: firstHopError } = await supabase
    .from('relationships')
    .select('*')
    .or(`from_entity_id.eq.${id},to_entity_id.eq.${id}`)

  if (firstHopError) {
    throw firstHopError
  }

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

    const { data: secondHopRelationships, error: secondHopError } = await supabase
      .from('relationships')
      .select('*')
      .or(filters)

    if (secondHopError) {
      throw secondHopError
    }

    relationships = Array.from(
      new Map(
        [...firstHopRelationships, ...secondHopRelationships].map((relationship) => [
          relationship.id,
          relationship,
        ])
      ).values()
    )
    entityIds = unique(
      relationships.flatMap((relationship) => [relationship.from_entity_id, relationship.to_entity_id])
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
      visibleEntityIds.has(relationship.from_entity_id) && visibleEntityIds.has(relationship.to_entity_id)
  )

  return { entities, relationships: visibleRelationships }
}

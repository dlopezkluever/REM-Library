import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'
import type { EntityPositionUpdate } from '@/lib/graph/types'
import type { EntityType } from '@/types/domain'

export type EntityRow = Tables<'entities'>
export type RelationshipRow = Tables<'relationships'>

export interface EntityNeighborhood {
  entities: EntityRow[]
  relationships: RelationshipRow[]
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

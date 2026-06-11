import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type RelationshipRow = Tables<'relationships'>

const withEffectiveWeight = (relationship: RelationshipRow): RelationshipRow => ({
  ...relationship,
  weight: relationship.weight_override ?? relationship.weight,
})

export const getAllPublishedRelationships = async () => {
  const { data, error } = await supabase
    .from('relationships')
    .select('*')
    .eq('status', 'active')
    .order('created_at')

  if (error) {
    throw error
  }

  return data.map(withEffectiveWeight)
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

  return data.map(withEffectiveWeight)
}

import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type RelationshipRow = Tables<'relationships'>

export const getAllPublishedRelationships = async () => {
  const { data, error } = await supabase.from('relationships').select('*').order('created_at')

  if (error) {
    throw error
  }

  return data
}

export const getRelationshipsForEntity = async (entityId: string) => {
  const { data, error } = await supabase
    .from('relationships')
    .select('*')
    .or(`from_entity_id.eq.${entityId},to_entity_id.eq.${entityId}`)
    .order('created_at')

  if (error) {
    throw error
  }

  return data
}

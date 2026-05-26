import { supabase } from '@/lib/supabase/client'

export const getClaimById = async (id: string) => {
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error) {
    throw error
  }

  return data
}

export const getClaimsForEntity = async (entityId: string) => {
  const { data: claimLinks, error: claimLinksError } = await supabase
    .from('claim_entities')
    .select('claim_id')
    .eq('entity_id', entityId)

  if (claimLinksError) {
    throw claimLinksError
  }

  const claimIds = claimLinks.map((claimLink) => claimLink.claim_id)

  if (claimIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .in('id', claimIds)
    .eq('status', 'published')
    .order('confidence_score', { ascending: false })

  if (error) {
    throw error
  }

  return data
}

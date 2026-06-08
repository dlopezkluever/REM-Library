import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type ClaimRow = Tables<'claims'>

export interface ClaimWithAuthor extends Tables<'claims'> {
  profiles: { display_name: string | null } | null
}

const CLAIM_WITH_AUTHOR_SELECT = '*, profiles!claims_author_id_fkey(display_name)'

const getEffectiveClaimConfidence = (claim: Tables<'claims'>) => {
  return claim.confidence_override ?? claim.confidence_score
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

export const getClaimsForEntity = async (entityId: string): Promise<ClaimWithAuthor[]> => {
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
    .select(CLAIM_WITH_AUTHOR_SELECT)
    .in('id', claimIds)
    .eq('status', 'published')

  if (error) {
    throw error
  }

  return [...(data as unknown as ClaimWithAuthor[])].sort(
    (firstClaim, secondClaim) =>
      getEffectiveClaimConfidence(secondClaim) - getEffectiveClaimConfidence(firstClaim)
  )
}

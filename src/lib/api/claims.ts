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

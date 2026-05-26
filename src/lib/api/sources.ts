import { supabase } from '@/lib/supabase/client'

export const getAllSources = async () => {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('status', 'published')
    .order('title')

  if (error) {
    throw error
  }

  return data
}

export const getSourceById = async (id: string) => {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  if (error) {
    throw error
  }

  return data
}

export const getSourceAnchorsForClaim = async (claimId: string) => {
  const { data: evidenceLinks, error: evidenceError } = await supabase
    .from('claim_evidence')
    .select('anchor_id')
    .eq('claim_id', claimId)

  if (evidenceError) {
    throw evidenceError
  }

  const anchorIds = evidenceLinks.map((evidenceLink) => evidenceLink.anchor_id)

  if (anchorIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('source_anchors')
    .select('*')
    .in('id', anchorIds)
    .order('created_at')

  if (error) {
    throw error
  }

  return data
}

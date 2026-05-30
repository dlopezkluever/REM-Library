import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types/database'

export type SourceRow = Tables<'sources'>
export type SourceAnchorRow = Tables<'source_anchors'>
export type SourceChunkRow = Tables<'chunks'>

export interface SourceAnchorEvidence {
  anchor: SourceAnchorRow
  source: SourceRow
  claimId: string
}

export interface SourceExtractedContent {
  claims: Tables<'claims'>[]
  entities: Tables<'entities'>[]
}

export interface SourceClaimCount {
  sourceId: string
  claimCount: number
}

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

const getSourcesByIds = async (sourceIds: string[]) => {
  if (sourceIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .in('id', Array.from(new Set(sourceIds)))
    .eq('status', 'published')

  if (error) {
    throw error
  }

  return data
}

export const getSourceEvidenceForClaim = async (claimId: string): Promise<SourceAnchorEvidence[]> => {
  const anchors = await getSourceAnchorsForClaim(claimId)
  const sources = await getSourcesByIds(anchors.map((anchor) => anchor.source_id))
  const sourcesById = new Map(sources.map((source) => [source.id, source]))

  return anchors.flatMap((anchor) => {
    const source = sourcesById.get(anchor.source_id)

    return source ? [{ anchor, source, claimId }] : []
  })
}

export const getSourceEvidenceForClaims = async (
  claimIds: string[]
): Promise<SourceAnchorEvidence[]> => {
  const uniqueClaimIds = Array.from(new Set(claimIds))

  if (uniqueClaimIds.length === 0) {
    return []
  }

  const { data: evidenceLinks, error: evidenceError } = await supabase
    .from('claim_evidence')
    .select('*')
    .in('claim_id', uniqueClaimIds)

  if (evidenceError) {
    throw evidenceError
  }

  const anchorIds = evidenceLinks.map((evidenceLink) => evidenceLink.anchor_id)

  if (anchorIds.length === 0) {
    return []
  }

  const { data: anchors, error: anchorsError } = await supabase
    .from('source_anchors')
    .select('*')
    .in('id', Array.from(new Set(anchorIds)))
    .order('created_at')

  if (anchorsError) {
    throw anchorsError
  }

  const sources = await getSourcesByIds(anchors.map((anchor) => anchor.source_id))
  const anchorsById = new Map(anchors.map((anchor) => [anchor.id, anchor]))
  const sourcesById = new Map(sources.map((source) => [source.id, source]))

  return evidenceLinks.flatMap((evidenceLink) => {
    const anchor = anchorsById.get(evidenceLink.anchor_id)
    const source = anchor ? sourcesById.get(anchor.source_id) : undefined

    return anchor && source ? [{ anchor, source, claimId: evidenceLink.claim_id }] : []
  })
}

export const getChunksForSource = async (sourceId: string) => {
  const { data, error } = await supabase
    .from('chunks')
    .select('*')
    .eq('source_id', sourceId)
    .order('chunk_index')

  if (error) {
    throw error
  }

  return data
}

export const getSourceExtractedContent = async (
  sourceId: string
): Promise<SourceExtractedContent> => {
  const { data: anchors, error: anchorsError } = await supabase
    .from('source_anchors')
    .select('*')
    .eq('source_id', sourceId)

  if (anchorsError) {
    throw anchorsError
  }

  const anchorIds = anchors.map((anchor) => anchor.id)

  if (anchorIds.length === 0) {
    return { claims: [], entities: [] }
  }

  const { data: evidenceLinks, error: evidenceError } = await supabase
    .from('claim_evidence')
    .select('claim_id')
    .in('anchor_id', anchorIds)

  if (evidenceError) {
    throw evidenceError
  }

  const claimIds = Array.from(new Set(evidenceLinks.map((evidenceLink) => evidenceLink.claim_id)))

  if (claimIds.length === 0) {
    return { claims: [], entities: [] }
  }

  const { data: claims, error: claimsError } = await supabase
    .from('claims')
    .select('*')
    .in('id', claimIds)
    .eq('status', 'published')
    .order('confidence_score', { ascending: false })

  if (claimsError) {
    throw claimsError
  }

  const { data: entityLinks, error: entityLinksError } = await supabase
    .from('claim_entities')
    .select('entity_id')
    .in('claim_id', claimIds)

  if (entityLinksError) {
    throw entityLinksError
  }

  const entityIds = Array.from(new Set(entityLinks.map((entityLink) => entityLink.entity_id)))

  if (entityIds.length === 0) {
    return { claims, entities: [] }
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

  return { claims, entities }
}

export const getClaimCountsForSources = async (sourceIds: string[]): Promise<SourceClaimCount[]> => {
  const uniqueSourceIds = Array.from(new Set(sourceIds))

  if (uniqueSourceIds.length === 0) {
    return []
  }

  const { data: anchors, error: anchorsError } = await supabase
    .from('source_anchors')
    .select('id, source_id')
    .in('source_id', uniqueSourceIds)

  if (anchorsError) {
    throw anchorsError
  }

  const anchorsById = new Map(anchors.map((anchor) => [anchor.id, anchor.source_id]))
  const anchorIds = anchors.map((anchor) => anchor.id)

  if (anchorIds.length === 0) {
    return uniqueSourceIds.map((sourceId) => ({ sourceId, claimCount: 0 }))
  }

  const { data: evidenceLinks, error: evidenceError } = await supabase
    .from('claim_evidence')
    .select('anchor_id, claim_id')
    .in('anchor_id', anchorIds)

  if (evidenceError) {
    throw evidenceError
  }

  const claimIdsBySourceId = new Map<string, Set<string>>()

  evidenceLinks.forEach((evidenceLink) => {
    const sourceId = anchorsById.get(evidenceLink.anchor_id)

    if (!sourceId) {
      return
    }

    const claimIds = claimIdsBySourceId.get(sourceId) ?? new Set<string>()
    claimIds.add(evidenceLink.claim_id)
    claimIdsBySourceId.set(sourceId, claimIds)
  })

  return uniqueSourceIds.map((sourceId) => ({
    sourceId,
    claimCount: claimIdsBySourceId.get(sourceId)?.size ?? 0,
  }))
}

export const getSignedSourceFileUrl = async (filePath: string) => {
  const { data, error } = await supabase.storage.from('source-files').createSignedUrl(filePath, 3600)

  if (error) {
    throw error
  }

  return data.signedUrl
}

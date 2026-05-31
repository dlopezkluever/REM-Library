import {
  corsHeaders,
  createServiceClient,
  errorMessage,
  jsonResponse,
  readJsonBody,
  requireAdminOrServiceRole,
} from '../_shared/pipeline.ts'

interface ClaimEntityRow {
  claim_id: string
}

interface ClaimEvidenceRow {
  source_anchors: {
    sources: {
      status: string
      tier: string
    } | null
  } | null
}

interface EntityScore {
  entityId: string
  score: number
}

const getEntityIds = (body: unknown) => {
  if (typeof body !== 'object' || body === null || !('entity_ids' in body)) {
    throw new Error('entity_ids is required.')
  }

  const entityIds = (body as { entity_ids: unknown }).entity_ids

  if (!Array.isArray(entityIds)) {
    throw new Error('entity_ids must be an array.')
  }

  const uniqueIds = Array.from(
    new Set(entityIds.filter((entityId): entityId is string => typeof entityId === 'string'))
  )

  if (uniqueIds.length === 0) {
    throw new Error('entity_ids must include at least one entity id.')
  }

  return uniqueIds
}

const clampScore = (score: number) => Math.max(0, Math.min(1, Number(score.toFixed(3))))

const scoreEvidence = (evidenceRows: ClaimEvidenceRow[]) => {
  const publishedEvidence = evidenceRows.filter((row) => {
    return row.source_anchors?.sources?.status === 'published'
  })
  const primaryCount = publishedEvidence.filter((row) => {
    return row.source_anchors?.sources?.tier === 'primary'
  }).length
  const secondaryCount = publishedEvidence.filter((row) => {
    return row.source_anchors?.sources?.tier === 'secondary'
  }).length
  const totalCount = publishedEvidence.length

  if (totalCount === 0) {
    return 0
  }

  return clampScore(0.18 + primaryCount * 0.22 + secondaryCount * 0.12 + totalCount * 0.04)
}

const computeEntityScore = async (
  supabase: ReturnType<typeof createServiceClient>,
  entityId: string
): Promise<EntityScore> => {
  const { data: claimLinks, error: claimLinkError } = await supabase
    .from('claim_entities')
    .select('claim_id')
    .eq('entity_id', entityId)
    .returns<ClaimEntityRow[]>()

  if (claimLinkError) {
    throw claimLinkError
  }

  const claimIds = Array.from(new Set((claimLinks ?? []).map((link) => link.claim_id)))

  if (claimIds.length === 0) {
    return { entityId, score: 0 }
  }

  const { data: evidenceRows, error: evidenceError } = await supabase
    .from('claim_evidence')
    .select('source_anchors(sources(tier,status))')
    .in('claim_id', claimIds)
    .returns<ClaimEvidenceRow[]>()

  if (evidenceError) {
    throw evidenceError
  }

  return {
    entityId,
    score: scoreEvidence(evidenceRows ?? []),
  }
}

const updateRelationshipWeights = async (
  supabase: ReturnType<typeof createServiceClient>,
  scores: EntityScore[]
) => {
  const scoreByEntityId = new Map(scores.map((score) => [score.entityId, score.score]))
  const entityIds = scores.map((score) => score.entityId)

  const { data: relationships, error: relationshipsError } = await supabase
    .from('relationships')
    .select('id,from_entity_id,to_entity_id,weight')
    .or(`from_entity_id.in.(${entityIds.join(',')}),to_entity_id.in.(${entityIds.join(',')})`)

  if (relationshipsError) {
    throw relationshipsError
  }

  await Promise.all(
    (relationships ?? []).map(async (relationship) => {
      const fromScore = scoreByEntityId.get(relationship.from_entity_id)
      const toScore = scoreByEntityId.get(relationship.to_entity_id)
      const knownScores = [fromScore, toScore].filter(
        (score): score is number => typeof score === 'number'
      )

      if (knownScores.length === 0) {
        return
      }

      const nextWeight = clampScore(
        knownScores.reduce((total, score) => total + score, 0) / knownScores.length
      )

      const { error } = await supabase
        .from('relationships')
        .update({ weight: nextWeight })
        .eq('id', relationship.id)

      if (error) {
        throw error
      }
    })
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createServiceClient()

  try {
    const body = await readJsonBody(request)
    const entityIds = getEntityIds(body)

    await requireAdminOrServiceRole(request, supabase)

    const scores = await Promise.all(
      entityIds.map((entityId) => computeEntityScore(supabase, entityId))
    )

    await Promise.all(
      scores.map(async ({ entityId, score }) => {
        const { error } = await supabase
          .from('entities')
          .update({ confidence_score: score })
          .eq('id', entityId)

        if (error) {
          throw error
        }
      })
    )

    await updateRelationshipWeights(supabase, scores)

    return jsonResponse({
      entity_scores: scores,
      updated_entities: scores.length,
    })
  } catch (error) {
    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

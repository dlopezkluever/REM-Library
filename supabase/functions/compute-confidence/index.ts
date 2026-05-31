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
  claims?: {
    status: string
  } | null
  source_anchors: {
    sources: {
      status: string
      tier: string
    } | null
  } | null
}

interface EntityEvidenceRow {
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

interface RelationshipRow {
  from_entity_id: string
  id: string
  to_entity_id: string
}

interface EntityScoreRow {
  confidence_override: number | null
  confidence_score: number
  id: string
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const maxEntityIdsPerRequest = 200

const getEntityIds = (body: unknown) => {
  if (typeof body !== 'object' || body === null || !('entity_ids' in body)) {
    throw new Error('entity_ids is required.')
  }

  const entityIds = (body as { entity_ids: unknown }).entity_ids

  if (!Array.isArray(entityIds)) {
    throw new Error('entity_ids must be an array.')
  }

  const uniqueIds = Array.from(
    new Set(
      entityIds.filter((entityId): entityId is string => {
        return typeof entityId === 'string' && uuidPattern.test(entityId)
      })
    )
  )

  if (uniqueIds.length === 0) {
    throw new Error('entity_ids must include at least one valid entity id.')
  }

  if (uniqueIds.length > maxEntityIdsPerRequest) {
    throw new Error(`entity_ids cannot include more than ${maxEntityIdsPerRequest} ids.`)
  }

  return uniqueIds
}

const clampScore = (score: number) => Math.max(0, Math.min(1, Number(score.toFixed(3))))

const scoreEvidence = (evidenceRows: ClaimEvidenceRow[]) => {
  const publishedEvidence = evidenceRows.filter((row) => {
    return (
      row.source_anchors?.sources?.status === 'published' &&
      (row.claims === undefined || row.claims?.status === 'published')
    )
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

  const claimEvidenceRows =
    claimIds.length > 0
      ? await supabase
          .from('claim_evidence')
          .select('claims(status),source_anchors(sources(tier,status))')
          .in('claim_id', claimIds)
          .returns<ClaimEvidenceRow[]>()
      : { data: [] as ClaimEvidenceRow[], error: null }

  if (claimEvidenceRows.error) {
    throw claimEvidenceRows.error
  }

  const { data: entityEvidenceRows, error: entityEvidenceError } = await supabase
    .from('entity_source_anchors')
    .select('source_anchors(sources(tier,status))')
    .eq('entity_id', entityId)
    .returns<EntityEvidenceRow[]>()

  if (entityEvidenceError) {
    throw entityEvidenceError
  }

  return {
    entityId,
    score: scoreEvidence([
      ...(claimEvidenceRows.data ?? []),
      ...(entityEvidenceRows ?? []).map((row) => ({
        claims: undefined,
        source_anchors: row.source_anchors,
      })),
    ]),
  }
}

const fetchRelationshipsForEntityIds = async (
  supabase: ReturnType<typeof createServiceClient>,
  entityIds: string[]
) => {
  const [fromResult, toResult] = await Promise.all([
    supabase
      .from('relationships')
      .select('id,from_entity_id,to_entity_id')
      .in('from_entity_id', entityIds)
      .returns<RelationshipRow[]>(),
    supabase
      .from('relationships')
      .select('id,from_entity_id,to_entity_id')
      .in('to_entity_id', entityIds)
      .returns<RelationshipRow[]>(),
  ])

  if (fromResult.error) {
    throw fromResult.error
  }

  if (toResult.error) {
    throw toResult.error
  }

  return Array.from(
    new Map(
      [...(fromResult.data ?? []), ...(toResult.data ?? [])].map((relationship) => [
        relationship.id,
        relationship,
      ])
    ).values()
  )
}

const updateRelationshipWeights = async (
  supabase: ReturnType<typeof createServiceClient>,
  scores: EntityScore[]
) => {
  const entityIds = scores.map((score) => score.entityId)

  if (entityIds.length === 0) {
    return
  }

  const relationships = await fetchRelationshipsForEntityIds(supabase, entityIds)
  const relationshipEntityIds = Array.from(
    new Set(
      relationships.flatMap((relationship) => [
        relationship.from_entity_id,
        relationship.to_entity_id,
      ])
    )
  )

  if (relationshipEntityIds.length === 0) {
    return
  }

  const { data: endpointScores, error: endpointScoresError } = await supabase
    .from('entities')
    .select('id,confidence_score,confidence_override')
    .in('id', relationshipEntityIds)
    .returns<EntityScoreRow[]>()

  if (endpointScoresError) {
    throw endpointScoresError
  }

  const scoreByEntityId = new Map(
    (endpointScores ?? []).map((entity) => [
      entity.id,
      entity.confidence_override ?? entity.confidence_score,
    ])
  )

  await Promise.all(
    relationships.map(async (relationship) => {
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

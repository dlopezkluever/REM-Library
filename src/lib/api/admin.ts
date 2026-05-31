import { supabase } from '@/lib/supabase/client'
import type { Enums, Json, Tables, TablesInsert } from '@/types/database'

export type AdminSourceRow = Tables<'sources'>
export type EntityType = Enums<'entity_type'>
export type ContentStatus = Enums<'content_status'>
export type SourceFormat = Enums<'source_format'>
export type SourceTier = Enums<'source_tier'>
export type PipelineStage = Enums<'pipeline_stage'>
export type ExtractionStatus = Enums<'extraction_status'>
export type RelationshipType = Enums<'relationship_type'>
export type AdminEntityRow = Tables<'entities'>
export type AdminClaimRow = Tables<'claims'>
export type AdminExtractionRow = Tables<'extractions'>
export type AdminChunkRow = Tables<'chunks'>

export interface AdminDashboardCounts {
  publishedEntities: number
  publishedClaims: number
  totalSources: number
  sourcesInReview: number
}

export interface EntityTypeCount {
  type: EntityType
  count: number
}

export interface ConfidenceBucket {
  label: string
  count: number
}

export interface StatusCount {
  status: ContentStatus
  entities: number
  claims: number
}

export interface AdminContentStats {
  entitiesByType: EntityTypeCount[]
  confidenceDistribution: ConfidenceBucket[]
  statusCounts: StatusCount[]
}

export interface SourceUploadProgress {
  loaded: number
  percent: number
  total: number
}

export interface CreateAdminSourceInput {
  authors: string[]
  description: string | null
  filePath: string | null
  format: SourceFormat
  id: string
  publicationDate: string | null
  tier: SourceTier
  title: string
  url: string | null
}

export interface AdminSourceListRow {
  extractionCount: number
  pendingReviewCount: number
  reviewStatus: 'No extractions' | 'In progress' | 'Pending review' | 'Reviewed'
  source: AdminSourceRow
}

export interface ReviewEntityItem {
  aliases: string[]
  description: string | null
  itemId: string
  kind: 'entity'
  name: string
  reviewStatus: string
  type: EntityType
}

export interface ReviewClaimItem {
  entitiesInvolved: string[]
  evidenceSummary: string
  itemId: string
  kind: 'claim'
  relationshipType: RelationshipType
  reviewStatus: string
  statement: string
}

export type ReviewItem = ReviewEntityItem | ReviewClaimItem

export interface PendingExtraction {
  chunk: AdminChunkRow
  extraction: AdminExtractionRow
  items: ReviewItem[]
  validationError: string | null
  validationFailed: boolean
  validationRawResponse: string | null
}

export interface ReviewSourceGroup {
  extractions: PendingExtraction[]
  pendingItemCount: number
  source: AdminSourceRow
}

export interface ReviewSourceSummary {
  oldestExtractionAt: string
  pendingExtractionCount: number
  pendingItemCount: number
  source: Pick<AdminSourceRow, 'format' | 'id' | 'status' | 'tier' | 'title'>
  validationFailedCount: number
}

export interface SaveEntityReviewInput {
  aliases: string[]
  description: string | null
  name: string
  type: EntityType
}

export interface SaveClaimReviewInput {
  entitiesInvolved: string[]
  evidenceSummary: string
  relationshipType: RelationshipType
  statement: string
}

export interface SplitEntityInput {
  first: SaveEntityReviewInput
  second: SaveEntityReviewInput
}

export type ReviewActionInput =
  | {
      action: 'confirm'
      extractionId: string
      itemId: string
      itemKind: 'entity' | 'claim'
    }
  | {
      action: 'edit'
      claim?: SaveClaimReviewInput
      entity?: SaveEntityReviewInput
      extractionId: string
      itemId: string
      itemKind: 'entity' | 'claim'
    }
  | {
      action: 'reject'
      extractionId: string
      itemId: string
      itemKind: 'entity' | 'claim'
    }
  | {
      action: 'merge'
      extractionId: string
      itemId: string
      itemKind: 'entity'
      targetEntityId: string
    }
  | {
      action: 'split'
      extractionId: string
      itemId: string
      itemKind: 'entity'
      split: SplitEntityInput
    }

export type PipelineRerunFunction =
  | 'trigger-transcription'
  | 'trigger-chunking'
  | 'trigger-extraction'

export interface PipelineRerunAction {
  disabledReason: string | null
  functionName: PipelineRerunFunction | null
  label: string
}

export interface ReviewActionResult {
  createdIds: string[]
  rowStatus: ExtractionStatus
}

export interface AdminEntityPage {
  entities: AdminEntityRow[]
  page: number
  pageSize: number
  totalCount: number
}

export interface AdminClaimListRow extends AdminClaimRow {
  entityNames: string[]
  evidenceCount: number
}

export interface AdminClaimPage {
  claims: AdminClaimListRow[]
  page: number
  pageSize: number
  totalCount: number
}

const entityTypes: EntityType[] = ['symbol', 'figure', 'narrative', 'culture', 'trope']
const contentStatuses: ContentStatus[] = ['draft', 'published', 'archived', 'disputed']
const relationshipTypes: RelationshipType[] = [
  'symbolizes',
  'appears_in',
  'belongs_to',
  'parallels',
  'instantiates',
  'supports',
]

const confidenceBuckets = [
  { label: '0-0.19', min: 0, max: 0.2 },
  { label: '0.2-0.49', min: 0.2, max: 0.5 },
  { label: '0.5-0.79', min: 0.5, max: 0.8 },
  { label: '0.8-1.0', min: 0.8, max: 1.01 },
]
const adminSourceMonitorLimit = 100
const adminSourceListLimit = 100
const adminEntityPageSize = 50
const adminClaimPageSize = 50
const reviewQueuePageSize = 50
const sourceFileBucket = 'source-files'

const requireCount = (count: number | null) => count ?? 0

const toCount = (value: unknown) => {
  if (typeof value === 'number') {
    return value
  }

  if (typeof value === 'string') {
    return Number.parseInt(value, 10) || 0
  }

  return 0
}

const isEntityType = (value: unknown): value is EntityType => {
  return typeof value === 'string' && entityTypes.some((type) => type === value)
}

const isRelationshipType = (value: unknown): value is RelationshipType => {
  return typeof value === 'string' && relationshipTypes.some((type) => type === value)
}

const toStringArray = (value: unknown) => {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : []
}

const toNullableTrimmedString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ')

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>()
  const result: string[] = []

  values.forEach((value) => {
    const normalized = normalizeName(value)
    const key = normalized.toLowerCase()

    if (normalized && !seen.has(key)) {
      seen.add(key)
      result.push(normalized)
    }
  })

  return result
}

export const slugifyEntityName = (name: string) => {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'entity'
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const getItemId = (item: Record<string, unknown>, fallback: string) => {
  return typeof item.item_id === 'string' && item.item_id ? item.item_id : fallback
}

const parseReviewItems = (extractionData: Json): ReviewItem[] => {
  if (!isRecord(extractionData)) {
    return []
  }

  const entityItems = Array.isArray(extractionData.entities)
    ? extractionData.entities.flatMap((item, index): ReviewEntityItem[] => {
        if (!isRecord(item) || typeof item.name !== 'string' || !isEntityType(item.type)) {
          return []
        }

        return [
          {
            aliases: toStringArray(item.aliases),
            description: toNullableTrimmedString(item.description),
            itemId: getItemId(item, `entity-${index}`),
            kind: 'entity',
            name: normalizeName(item.name),
            reviewStatus: typeof item.review_status === 'string' ? item.review_status : 'pending',
            type: item.type,
          },
        ]
      })
    : []

  const claimItems = Array.isArray(extractionData.claims)
    ? extractionData.claims.flatMap((item, index): ReviewClaimItem[] => {
        if (
          !isRecord(item) ||
          typeof item.statement !== 'string' ||
          !isRelationshipType(item.relationship_type)
        ) {
          return []
        }

        return [
          {
            entitiesInvolved: toStringArray(item.entities_involved),
            evidenceSummary: toNullableTrimmedString(item.evidence_summary) ?? '',
            itemId: getItemId(item, `claim-${index}`),
            kind: 'claim',
            relationshipType: item.relationship_type,
            reviewStatus: typeof item.review_status === 'string' ? item.review_status : 'pending',
            statement: item.statement.trim(),
          },
        ]
      })
    : []

  return [...entityItems, ...claimItems]
}

export const getPendingReviewItems = (extractionData: Json) => {
  return parseReviewItems(extractionData).filter((item) => item.reviewStatus === 'pending')
}

export const getAdminDashboardCounts = async (): Promise<AdminDashboardCounts> => {
  const [publishedEntities, publishedClaims, totalSources, sourcesInReview] = await Promise.all([
    supabase
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('sources').select('id', { count: 'exact', head: true }),
    supabase
      .from('sources')
      .select('id', { count: 'exact', head: true })
      .eq('pipeline_stage', 'review'),
  ])

  const errors = [
    publishedEntities.error,
    publishedClaims.error,
    totalSources.error,
    sourcesInReview.error,
  ].filter(Boolean)

  if (errors[0]) {
    throw errors[0]
  }

  return {
    publishedEntities: requireCount(publishedEntities.count),
    publishedClaims: requireCount(publishedClaims.count),
    totalSources: requireCount(totalSources.count),
    sourcesInReview: requireCount(sourcesInReview.count),
  }
}

const fetchAdminSources = async (limit: number): Promise<AdminSourceRow[]> => {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw error
  }

  return data
}

export const getAdminSources = async (): Promise<AdminSourceRow[]> => {
  return fetchAdminSources(adminSourceMonitorLimit)
}

export const sanitizeSourceFilename = (filename: string) => {
  const safeName = filename
    .trim()
    .replace(/[^\w .()+-]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

  return safeName || 'source-file'
}

export const createSourceFilePath = (sourceId: string, filename: string) => {
  return `${sourceId}/${sanitizeSourceFilename(filename)}`
}

const reportUploadProgress = (
  onUploadProgress: ((progress: SourceUploadProgress) => void) | undefined,
  file: File,
  percent: number
) => {
  onUploadProgress?.({
    loaded: Math.round(file.size * (percent / 100)),
    percent,
    total: file.size,
  })
}

export const uploadSourceFile = async (
  sourceId: string,
  file: File,
  onUploadProgress?: (progress: SourceUploadProgress) => void
) => {
  const path = createSourceFilePath(sourceId, file.name)
  let optimisticPercent = 4
  let intervalId: ReturnType<typeof setInterval> | undefined
  const fileSizeMb = file.size / 1024 / 1024
  const progressStep = fileSizeMb >= 500 ? 2 : fileSizeMb >= 100 ? 4 : 7
  const progressInterval = fileSizeMb >= 500 ? 1100 : fileSizeMb >= 100 ? 700 : 350

  reportUploadProgress(onUploadProgress, file, optimisticPercent)

  if (onUploadProgress) {
    intervalId = setInterval(() => {
      optimisticPercent = Math.min(optimisticPercent + progressStep, 88)
      reportUploadProgress(onUploadProgress, file, optimisticPercent)
    }, progressInterval)
  }

  try {
    const { error } = await supabase.storage.from(sourceFileBucket).upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    })

    if (error) {
      throw error
    }

    reportUploadProgress(onUploadProgress, file, 100)
    return path
  } finally {
    if (intervalId) {
      clearInterval(intervalId)
    }
  }
}

export const deleteSourceFile = async (path: string) => {
  const { error } = await supabase.storage.from(sourceFileBucket).remove([path])

  if (error) {
    throw error
  }
}

export const createAdminSource = async (input: CreateAdminSourceInput) => {
  const row: TablesInsert<'sources'> = {
    authors: input.authors,
    description: input.description,
    file_path: input.filePath,
    format: input.format,
    id: input.id,
    pipeline_stage: 'uploaded',
    publication_date: input.publicationDate,
    status: 'draft',
    tier: input.tier,
    title: input.title,
    url: input.url,
  }

  const { data, error } = await supabase.from('sources').insert(row).select('*').single()

  if (error) {
    throw error
  }

  return data
}

export const triggerSourceTranscription = async (sourceId: string) => {
  const { error } = await supabase.functions.invoke('trigger-transcription', {
    body: { source_id: sourceId },
  })

  if (error) {
    throw error
  }
}

export const isAssemblyAiSourceFormat = (format: SourceFormat) => {
  return format === 'audio' || format === 'video'
}

export const getPipelineRerunAction = (
  stage: PipelineStage,
  source?: Pick<AdminSourceRow, 'file_path' | 'format' | 'status' | 'transcript_id'>
): PipelineRerunAction => {
  if (source?.status === 'archived') {
    return {
      disabledReason: 'Restore this source before re-running the pipeline.',
      functionName: null,
      label: 'Restore required',
    }
  }

  if (stage === 'chunking' || stage === 'chunking_failed') {
    if (!source?.transcript_id) {
      return {
        disabledReason: 'Chunking cannot run until a transcript id exists.',
        functionName: null,
        label: 'Transcript required',
      }
    }

    return {
      disabledReason: null,
      functionName: 'trigger-chunking',
      label: 'Re-run chunking',
    }
  }

  if (stage === 'transcribing' && source?.transcript_id) {
    return {
      disabledReason: null,
      functionName: 'trigger-chunking',
      label: 'Recover chunking',
    }
  }

  if (stage === 'uploaded' || stage === 'transcribing' || stage === 'transcribing_failed') {
    if (source && (source.format === 'url' || !source.file_path)) {
      return {
        disabledReason: 'Automatic URL ingestion is not available yet.',
        functionName: null,
        label: 'URL ingestion pending',
      }
    }

    if (source && !isAssemblyAiSourceFormat(source.format)) {
      return {
        disabledReason: 'Automatic text and document ingestion is not available yet.',
        functionName: null,
        label: 'Document ingestion pending',
      }
    }

    return {
      disabledReason: null,
      functionName: 'trigger-transcription',
      label: 'Re-run transcription',
    }
  }

  return {
    disabledReason: null,
    functionName: 'trigger-extraction',
    label: 'Re-run extraction',
  }
}

const sourceHasChunks = async (sourceId: string) => {
  const { count, error } = await supabase
    .from('chunks')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)

  if (error) {
    throw error
  }

  return requireCount(count) > 0
}

export const rerunSourcePipelineStage = async (
  sourceId: string,
  stage: PipelineStage,
  source?: Pick<AdminSourceRow, 'file_path' | 'format' | 'status' | 'transcript_id'>
) => {
  const action = getPipelineRerunAction(stage, source)

  if (!action.functionName) {
    throw new Error(action.disabledReason ?? 'This pipeline stage cannot be safely re-run yet.')
  }

  if (action.functionName === 'trigger-extraction' && !(await sourceHasChunks(sourceId))) {
    throw new Error('Extraction cannot be re-run until this source has chunks.')
  }

  const { error } = await supabase.functions.invoke(action.functionName, {
    body: { source_id: sourceId },
  })

  if (error) {
    throw error
  }
}

export const archiveAdminSource = async (sourceId: string) => {
  await updateAdminSourceStatus(sourceId, 'archived')
  return getAdminSourceById(sourceId)
}

export const restoreAdminSource = async (sourceId: string) => {
  await updateAdminSourceStatus(sourceId, 'draft')
  return getAdminSourceById(sourceId)
}

export const getAdminSourceById = async (sourceId: string) => {
  const { data, error } = await supabase.from('sources').select('*').eq('id', sourceId).single()

  if (error) {
    throw error
  }

  return data
}

export const getAdminSourceListRows = async (): Promise<AdminSourceListRow[]> => {
  const { data, error } = await supabase.rpc('get_admin_source_list_rows', {
    page_limit: adminSourceListLimit,
    page_offset: 0,
  })

  if (error) {
    throw error
  }

  return data.map((row) => {
    const source: AdminSourceRow = {
      authors: row.authors,
      created_at: row.created_at,
      description: row.description,
      duration_seconds: row.duration_seconds,
      file_path: row.file_path,
      format: row.format,
      id: row.id,
      page_count: row.page_count,
      pipeline_stage: row.pipeline_stage,
      pipeline_stage_entered_at: row.pipeline_stage_entered_at,
      pipeline_error: row.pipeline_error,
      publication_date: row.publication_date,
      status: row.status,
      tier: row.tier,
      title: row.title,
      transcript_id: row.transcript_id,
      updated_at: row.updated_at,
      url: row.url,
    }
    const extractionCount = row.extraction_count
    const pendingReviewCount = row.pending_review_count

    return {
      extractionCount,
      pendingReviewCount,
      reviewStatus: getSourceReviewStatus(
        source.pipeline_stage,
        extractionCount,
        pendingReviewCount
      ),
      source,
    }
  })
}

const getValidationError = (extractionData: Json) => {
  return isRecord(extractionData) && typeof extractionData.validation_error === 'string'
    ? extractionData.validation_error
    : null
}

const getValidationRawResponse = (extractionData: Json) => {
  return isRecord(extractionData) && typeof extractionData.raw_response === 'string'
    ? extractionData.raw_response
    : null
}

const getValidationFailed = (extractionData: Json) => {
  return isRecord(extractionData) && extractionData.validation_failed === true
}

export const getPendingReviewSourceSummaries = async (page = 0): Promise<ReviewSourceSummary[]> => {
  const { data, error } = await supabase.rpc('get_pending_review_source_summaries', {
    page_limit: reviewQueuePageSize,
    page_offset: page * reviewQueuePageSize,
  })

  if (error) {
    throw error
  }

  return data.map((row) => ({
    oldestExtractionAt: row.oldest_extraction_at,
    pendingExtractionCount: row.pending_extraction_count,
    pendingItemCount: row.pending_item_count,
    source: {
      format: row.source_format,
      id: row.source_id,
      status: row.source_status,
      tier: row.source_tier,
      title: row.source_title,
    },
    validationFailedCount: row.validation_failed_count,
  }))
}

export const getPendingExtractionReviewSource = async (
  sourceId: string
): Promise<ReviewSourceGroup | null> => {
  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .select('*')
    .eq('id', sourceId)
    .neq('status', 'archived')
    .single()

  if (sourceError) {
    throw sourceError
  }

  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('*')
    .eq('source_id', sourceId)
    .order('chunk_index', { ascending: true })

  if (chunksError) {
    throw chunksError
  }

  if (chunks.length === 0) {
    return { extractions: [], pendingItemCount: 0, source }
  }

  const chunkIds = chunks.map((chunk) => chunk.id)
  const { data: extractions, error: extractionsError } = await supabase
    .from('extractions')
    .select('*')
    .eq('status', 'pending')
    .in('chunk_id', chunkIds)
    .order('created_at', { ascending: true })
    .limit(200)

  if (extractionsError) {
    throw extractionsError
  }

  const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]))
  const pendingExtractions = extractions.flatMap((extraction): PendingExtraction[] => {
    const chunk = chunksById.get(extraction.chunk_id)

    if (!chunk) {
      return []
    }

    const items = getPendingReviewItems(extraction.extraction_data)
    const validationFailed = getValidationFailed(extraction.extraction_data)

    if (items.length === 0 && !validationFailed) {
      return []
    }

    return [
      {
        chunk,
        extraction,
        items,
        validationError: getValidationError(extraction.extraction_data),
        validationFailed,
        validationRawResponse: getValidationRawResponse(extraction.extraction_data),
      },
    ]
  })

  return {
    extractions: pendingExtractions,
    pendingItemCount: pendingExtractions.reduce(
      (total, extraction) => total + extraction.items.length,
      0
    ),
    source,
  }
}

export const getPendingExtractionReviewSources = async (): Promise<ReviewSourceGroup[]> => {
  const summaries = await getPendingReviewSourceSummaries()
  const groups = await Promise.all(
    summaries.map((summary) => getPendingExtractionReviewSource(summary.source.id))
  )

  return groups.filter((group): group is ReviewSourceGroup => Boolean(group))
}

export const getAdminEntitiesPage = async ({
  page = 0,
  search = '',
  status = null,
}: {
  page?: number
  search?: string
  status?: ContentStatus | null
} = {}): Promise<AdminEntityPage> => {
  const { data, error } = await supabase.rpc('get_admin_entities_page', {
    page_limit: adminEntityPageSize,
    page_offset: page * adminEntityPageSize,
    search_query: search.trim() || null,
    status_filter: status,
  })

  if (error) {
    throw error
  }

  return {
    entities: data.map((row) => ({
      aliases: row.aliases,
      confidence_override: row.confidence_override,
      confidence_score: row.confidence_score,
      created_at: row.created_at,
      description: row.description,
      fts: null,
      id: row.id,
      name: row.name,
      position_x: row.position_x,
      position_y: row.position_y,
      slug: row.slug,
      status: row.status,
      type: row.type,
      updated_at: row.updated_at,
    })),
    page,
    pageSize: adminEntityPageSize,
    totalCount: data[0]?.total_count ?? 0,
  }
}

export const getAdminEntities = async () => {
  return (await getAdminEntitiesPage()).entities
}

export const searchAdminEntities = async (search: string) => {
  const query = search.trim()

  if (!query) {
    return []
  }

  return (await getAdminEntitiesPage({ search: query })).entities.slice(0, 10)
}

export const updateAdminEntityStatus = async (entityId: string, status: ContentStatus) => {
  const updateValues = status === 'published' ? { status } : { confidence_score: 0, status }
  const { data, error } = await supabase
    .from('entities')
    .update(updateValues)
    .eq('id', entityId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  if (status === 'published') {
    await triggerConfidenceComputation([entityId])
  }

  return data
}

export const publishAdminEntities = async (entityIds: string[]) => {
  const uniqueEntityIds = uniqueStrings(entityIds)

  if (uniqueEntityIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('entities')
    .update({ status: 'published' })
    .in('id', uniqueEntityIds)
    .select('*')

  if (error) {
    throw error
  }

  await triggerConfidenceComputation(uniqueEntityIds)

  return data
}

export const getAdminClaimsPage = async ({
  page = 0,
  search = '',
  status = null,
}: {
  page?: number
  search?: string
  status?: ContentStatus | null
} = {}): Promise<AdminClaimPage> => {
  const { data, error } = await supabase.rpc('get_admin_claims_page', {
    page_limit: adminClaimPageSize,
    page_offset: page * adminClaimPageSize,
    search_query: search.trim() || null,
    status_filter: status,
  })

  if (error) {
    throw error
  }

  return {
    claims: data.map((row) => ({
      author_id: row.author_id,
      confidence_override: row.confidence_override,
      confidence_score: row.confidence_score,
      created_at: row.created_at,
      detailed_argument: row.detailed_argument,
      entityNames: row.entity_names,
      evidenceCount: row.evidence_count,
      id: row.id,
      statement: row.statement,
      status: row.status,
      updated_at: row.updated_at,
    })),
    page,
    pageSize: adminClaimPageSize,
    totalCount: data[0]?.total_count ?? 0,
  }
}

export const updateAdminClaimStatus = async (claimId: string, status: ContentStatus) => {
  const { data: affectedEntityIds, error } = await supabase.rpc('update_claim_status', {
    claim_id: claimId,
    next_status: status,
  })

  if (error) {
    throw error
  }

  await triggerConfidenceComputation(affectedEntityIds)
}

export const publishAdminClaims = async (claimIds: string[]) => {
  const uniqueClaimIds = uniqueStrings(claimIds)

  if (uniqueClaimIds.length === 0) {
    return
  }

  const { data: affectedEntityIds, error } = await supabase.rpc('publish_claims', {
    claim_ids: uniqueClaimIds,
  })

  if (error) {
    throw error
  }

  await triggerConfidenceComputation(affectedEntityIds)
}

export const updateAdminSourceStatus = async (sourceId: string, status: ContentStatus) => {
  const { data: affectedEntityIds, error } = await supabase.rpc('update_source_status', {
    next_status: status,
    source_id: sourceId,
  })

  if (error) {
    throw error
  }

  await triggerConfidenceComputation(affectedEntityIds)
}

export const publishAdminSources = async (sourceIds: string[]) => {
  const uniqueSourceIds = uniqueStrings(sourceIds)

  if (uniqueSourceIds.length === 0) {
    return
  }

  const { data: affectedEntityIds, error } = await supabase.rpc('publish_sources', {
    source_ids: uniqueSourceIds,
  })

  if (error) {
    throw error
  }

  await triggerConfidenceComputation(affectedEntityIds)
}

export const triggerConfidenceComputation = async (entityIds: string[]) => {
  const uniqueEntityIds = uniqueStrings(entityIds)

  if (uniqueEntityIds.length === 0) {
    return
  }

  const { error } = await supabase.functions.invoke('compute-confidence', {
    body: { entity_ids: uniqueEntityIds },
  })

  if (error) {
    throw error
  }
}

const isReviewActionResult = (value: unknown): value is ReviewActionResult => {
  if (!isObjectRecord(value)) {
    return false
  }

  return Array.isArray(value.createdIds) && typeof value.rowStatus === 'string'
}

export const reviewExtractionItem = async (
  input: ReviewActionInput
): Promise<ReviewActionResult> => {
  const { data, error } = await supabase.rpc('review_extraction_item', {
    action: input.action,
    claim_input: input.action === 'edit' ? ((input.claim ?? null) as Json | null) : null,
    entity_input: input.action === 'edit' ? ((input.entity ?? null) as Json | null) : null,
    extraction_id: input.extractionId,
    item_id: input.itemId,
    item_kind: input.itemKind,
    split_input: input.action === 'split' ? (input.split as unknown as Json) : null,
    target_entity_id: input.action === 'merge' ? input.targetEntityId : null,
  })

  if (error) {
    throw error
  }

  if (!isReviewActionResult(data)) {
    throw new Error('Review action returned an invalid payload.')
  }

  return data
}

export const rejectFailedExtraction = async (extractionId: string): Promise<ReviewActionResult> => {
  const { data, error } = await supabase.rpc('reject_failed_extraction', {
    extraction_id: extractionId,
  })

  if (error) {
    throw error
  }

  if (!isReviewActionResult(data)) {
    throw new Error('Reject action returned an invalid payload.')
  }

  return data
}

export const adminSourceTitleExists = async (title: string) => {
  const { count, error } = await supabase
    .from('sources')
    .select('id', { count: 'exact', head: true })
    .ilike('title', title)

  if (error) {
    throw error
  }

  return requireCount(count) > 0
}

const getSourceReviewStatus = (
  pipelineStage: PipelineStage,
  extractionCount: number,
  pendingReviewCount: number
): AdminSourceListRow['reviewStatus'] => {
  if (pendingReviewCount > 0 || pipelineStage === 'review') {
    return 'Pending review'
  }

  if (pipelineStage === 'curated' || pipelineStage === 'published') {
    return 'Reviewed'
  }

  if (extractionCount > 0) {
    return 'In progress'
  }

  return 'No extractions'
}

export const getAdminContentStats = async (): Promise<AdminContentStats> => {
  const { data, error } = await supabase.rpc('get_admin_content_stats')

  if (error) {
    throw error
  }

  if (!isObjectRecord(data)) {
    throw new Error('Admin content stats returned an invalid payload.')
  }

  const entitiesByType = entityTypes.map((type) => {
    const match = Array.isArray(data.entitiesByType)
      ? data.entitiesByType.find((item) => isObjectRecord(item) && item.type === type)
      : null

    return {
      type,
      count: isObjectRecord(match) ? toCount(match.count) : 0,
    }
  })

  const confidenceDistribution = confidenceBuckets.map((bucket) => {
    const match = Array.isArray(data.confidenceDistribution)
      ? data.confidenceDistribution.find(
          (item) => isObjectRecord(item) && item.label === bucket.label
        )
      : null

    return {
      label: bucket.label,
      count: isObjectRecord(match) ? toCount(match.count) : 0,
    }
  })

  const statusCounts = contentStatuses.map((status) => {
    const match = Array.isArray(data.statusCounts)
      ? data.statusCounts.find((item) => isObjectRecord(item) && item.status === status)
      : null

    return {
      status,
      entities: isObjectRecord(match) ? toCount(match.entities) : 0,
      claims: isObjectRecord(match) ? toCount(match.claims) : 0,
    }
  })

  return {
    entitiesByType,
    confidenceDistribution,
    statusCounts,
  }
}

const pipelineStages: Array<AdminSourceRow['pipeline_stage']> = [
  'uploaded',
  'transcribing',
  'transcribing_failed',
  'chunking',
  'chunking_failed',
  'extracting',
  'extracting_failed',
  'review',
  'curated',
  'published',
]

const sourceFormats: Array<AdminSourceRow['format']> = ['audio', 'video', 'text', 'book', 'url']
const sourceTiers: Array<AdminSourceRow['tier']> = ['primary', 'secondary']

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

const isNullableString = (value: unknown): value is string | null => {
  return typeof value === 'string' || value === null
}

const isNullableNumber = (value: unknown): value is number | null => {
  return typeof value === 'number' || value === null
}

const isPipelineStage = (value: unknown): value is AdminSourceRow['pipeline_stage'] => {
  return typeof value === 'string' && pipelineStages.some((stage) => stage === value)
}

const isSourceFormat = (value: unknown): value is AdminSourceRow['format'] => {
  return typeof value === 'string' && sourceFormats.some((format) => format === value)
}

const isSourceTier = (value: unknown): value is AdminSourceRow['tier'] => {
  return typeof value === 'string' && sourceTiers.some((tier) => tier === value)
}

const isContentStatus = (value: unknown): value is ContentStatus => {
  return typeof value === 'string' && contentStatuses.some((status) => status === value)
}

const isAdminSourceRow = (value: unknown): value is AdminSourceRow => {
  if (!isObjectRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isStringArray(value.authors) &&
    isNullableString(value.publication_date) &&
    isSourceFormat(value.format) &&
    isSourceTier(value.tier) &&
    isNullableString(value.url) &&
    isNullableString(value.file_path) &&
    isNullableNumber(value.duration_seconds) &&
    isNullableNumber(value.page_count) &&
    isPipelineStage(value.pipeline_stage) &&
    isNullableString(value.pipeline_error) &&
    isContentStatus(value.status) &&
    typeof value.created_at === 'string' &&
    typeof value.updated_at === 'string' &&
    typeof value.pipeline_stage_entered_at === 'string' &&
    isNullableString(value.transcript_id) &&
    isNullableString(value.description)
  )
}

export type SourceRealtimeChange =
  | { eventType: 'DELETE'; id: string }
  | { eventType: 'INSERT' | 'UPDATE'; source: AdminSourceRow }

export const sortSourcesByCreatedAt = (sources: AdminSourceRow[]) => {
  return [...sources].sort(
    (first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
  )
}

export const applySourceRealtimeChange = (
  currentSources: AdminSourceRow[] | undefined,
  change: SourceRealtimeChange
) => {
  if (change.eventType === 'DELETE') {
    return (currentSources ?? []).filter((source) => source.id !== change.id)
  }

  if (change.source.status === 'archived') {
    return (currentSources ?? []).filter((source) => source.id !== change.source.id)
  }

  const sourceExists = (currentSources ?? []).some((source) => source.id === change.source.id)
  const nextSources = sourceExists
    ? (currentSources ?? []).map((source) =>
        source.id === change.source.id ? change.source : source
      )
    : [change.source, ...(currentSources ?? [])]

  return sortSourcesByCreatedAt(nextSources)
}

export const subscribeToSourceUpdates = (handler: (change: SourceRealtimeChange) => void) => {
  const channel = supabase
    .channel('admin-sources-pipeline')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sources' }, (payload) => {
      if (payload.eventType === 'DELETE') {
        const previousSource: unknown = payload.old

        if (isObjectRecord(previousSource) && typeof previousSource.id === 'string') {
          handler({ eventType: 'DELETE', id: previousSource.id })
        }

        return
      }

      const nextSource: unknown = payload.new

      if (
        (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') &&
        isAdminSourceRow(nextSource)
      ) {
        handler({ eventType: payload.eventType, source: nextSource })
      }
    })
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

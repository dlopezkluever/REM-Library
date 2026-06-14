import { supabase } from '@/lib/supabase/client'
import { normalizeSourceUrlForDedup } from '@/lib/sourceUrl'
import type { CommunityTargetType, FlagTargetType } from '@/lib/api/community'
import type { Enums, Json, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type AdminSourceRow = Tables<'sources'>
export type EntityType = Enums<'entity_type'>
export type ContentStatus = Enums<'content_status'>
export type SourceFormat = Enums<'source_format'>
export type SourceTier = Enums<'source_tier'>
export type SourceCategory = Enums<'source_category'>
export type InterpretationFrame = Enums<'interpretation_frame'>
export type PipelineStage = Enums<'pipeline_stage'>
export type ExtractionStatus = Enums<'extraction_status'>
export type RelationshipType = Enums<'relationship_type'>
export type AdminEntityRow = Tables<'entities'>
export type AdminClaimRow = Tables<'claims'>
export type AdminExtractionRow = Tables<'extractions'>
export type AdminChunkRow = Tables<'chunks'>
export type AdminRelationshipRow = Tables<'relationships'>
export type AdminCommentRow = Tables<'comments'>
export type AdminFlagRow = Tables<'content_flags'>
export type RelationshipStatus = 'active' | 'archived'
export type AdminSuggestionRow = Tables<'suggestions'> & {
  submitter?: Pick<Tables<'profiles'>, 'display_name' | 'email'> | null
  targetClaim?: Pick<Tables<'claims'>, 'id' | 'statement'> | null
  targetEntity?: Pick<Tables<'entities'>, 'id' | 'name' | 'slug'> | null
}

export interface CommunitySignalSummary {
  communityScore: number
  flagCount: number
  pendingCommentCount: number
}

export interface AdminCommentModerationRow extends AdminCommentRow {
  author: Pick<Tables<'profiles'>, 'display_name' | 'email' | 'role'> | null
}

export interface AdminFlagModerationRow extends AdminFlagRow {
  reporter: Pick<Tables<'profiles'>, 'display_name' | 'email'> | null
}

export interface AdminCommentPage {
  comments: AdminCommentModerationRow[]
  page: number
  pageSize: number
  totalCount: number
}

export interface AdminFlagPage {
  flags: AdminFlagModerationRow[]
  page: number
  pageSize: number
  totalCount: number
}

export interface AdminCommentFilters {
  status?: AdminCommentRow['status'] | 'all'
  targetType?: CommunityTargetType | 'all'
}

export interface AdminFlagFilters {
  status?: AdminFlagRow['status'] | 'all'
  targetType?: FlagTargetType | 'all'
}

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
  category?: SourceCategory
  description: string | null
  filePath: string | null
  format: SourceFormat
  id: string
  publicationDate: string | null
  tier: SourceTier
  title: string
  url: string | null
}

export interface CreateAdminEntityInput {
  dateEra: string | null
  dateSortYear: number | null
  description: string | null
  name: string
  status: Extract<ContentStatus, 'draft' | 'published'>
  type: EntityType
}

export interface CreateAdminClaimInput {
  content: string
  entityIds: string[]
  interpretationFrame: InterpretationFrame | null
  isCanonical: boolean
  status: Extract<ContentStatus, 'draft' | 'published'>
}

export type UrlIngestionDomainRow = Tables<'url_ingestion_config'>

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
  interpretationFrame: InterpretationFrame | null
  isCanonical: boolean
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
  communityScore: number
  flagCount: number
  oldestExtractionAt: string
  pendingExtractionCount: number
  pendingItemCount: number
  source: Pick<AdminSourceRow, 'format' | 'id' | 'status' | 'tier' | 'title'>
  validationFailedCount: number
}

export type ReviewQueueSort = 'oldest' | 'newest' | 'most_flagged' | 'highest_net_votes'

export interface SaveEntityReviewInput {
  aliases: string[]
  description: string | null
  name: string
  type: EntityType
}

export interface SaveClaimReviewInput {
  entitiesInvolved: string[]
  evidenceSummary: string
  interpretationFrame: InterpretationFrame | null
  isCanonical: boolean
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
      confirmClaimMeta?: {
        interpretationFrame: InterpretationFrame | null
        isCanonical: boolean
      }
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
  canonicalConflict?: boolean
  createdIds: string[]
  rowStatus: ExtractionStatus
}

export interface AdminEntityPage {
  entities: AdminEntityListRow[]
  page: number
  pageSize: number
  totalCount: number
}

export interface AdminEntityListRow extends AdminEntityRow, CommunitySignalSummary {}

export interface AdminClaimListRow extends AdminClaimRow, CommunitySignalSummary {
  entityNames: string[]
  evidenceCount: number
}

export interface AdminClaimPage {
  claims: AdminClaimListRow[]
  page: number
  pageSize: number
  totalCount: number
}

export interface AdminSourceImpactClaim extends AdminClaimRow {
  entityNames: string[]
}

export interface AdminSourceImpact {
  claims: AdminSourceImpactClaim[]
  entities: AdminEntityRow[]
}

export interface AdminRelationshipEntitySummary {
  id: string
  name: string
  status: ContentStatus
  type: EntityType
}

export interface AdminRelationshipClaimSummary {
  confidence_override: number | null
  confidence_score: number
  id: string
  statement: string
  status: ContentStatus
}

export interface AdminRelationshipListRow extends AdminRelationshipRow {
  backingClaims: AdminRelationshipClaimSummary[]
  claimCount: number
  computedWeight: number
  effectiveWeight: number
  fromEntity: AdminRelationshipEntitySummary | null
  toEntity: AdminRelationshipEntitySummary | null
}

export interface AdminRelationshipPage {
  page: number
  pageSize: number
  relationships: AdminRelationshipListRow[]
  totalCount: number
}

export interface GetAdminRelationshipsOptions {
  page?: number
  pageSize?: number
  search?: string
  status?: RelationshipStatus | 'all' | null
}

export interface AdminSourceUrlDuplicate {
  id: string
  title: string
  url: string | null
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
export const interpretationFrames: InterpretationFrame[] = [
  'canonical_rem',
  'supporting_context',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'disputed_alternative',
]

export const sourceCategories: SourceCategory[] = [
  'primary_rem',
  'secondary_rem',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'community_submitted',
]

export const interpretationFrameLabels: Record<InterpretationFrame, string> = {
  canonical_rem: 'Canonical REM',
  disputed_alternative: 'Disputed alternative',
  external_academic: 'External academic',
  historical_record: 'Historical record',
  literary_artistic: 'Literary & artistic',
  supporting_context: 'Supporting context',
}

export const sourceCategoryLabels: Record<SourceCategory, string> = {
  community_submitted: 'Community submitted',
  external_academic: 'External academic',
  historical_record: 'Historical record',
  literary_artistic: 'Literary & artistic',
  primary_rem: 'Primary REM',
  secondary_rem: 'Secondary REM',
}

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
const adminRelationshipPageSize = 50
const adminRelationshipMaxPageSize = 100
const confidenceComputationBatchSize = 200
const reviewQueuePageSize = 50
const adminCommentPageSize = 50
const adminFlagPageSize = 50
const sourceFileBucket = 'source-files'
const entityImagesBucket = 'entity-images'

const requireCount = (count: number | null) => count ?? 0

const requireBoundedNumber = (value: number, label: string, min: number, max: number) => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}.`)
  }
}

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

const isInterpretationFrame = (value: unknown): value is InterpretationFrame => {
  return typeof value === 'string' && interpretationFrames.some((frame) => frame === value)
}

export const getEffectiveRelationshipWeight = (
  relationship: Pick<AdminRelationshipRow, 'weight' | 'weight_override'>
) => relationship.weight_override ?? relationship.weight

const toStringArray = (value: unknown) => {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : []
}

const toNullableTrimmedString = (value: unknown) => {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const normalizeName = (name: string) => name.trim().replace(/\s+/g, ' ')

const sourceTierFromCategory = (category: SourceCategory): SourceTier => {
  return category === 'primary_rem' || category === 'secondary_rem' ? 'primary' : 'secondary'
}

const uniqueIds = (values: string[]) => {
  return Array.from(new Set(values.filter((value) => Boolean(value))))
}

const chunkStrings = (values: string[], size: number) => {
  const chunks: string[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

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
            interpretationFrame: isInterpretationFrame(item.interpretation_frame)
              ? item.interpretation_frame
              : null,
            isCanonical: item.is_canonical === true,
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

const getCurrentAdminUserId = async () => {
  const { data } = await supabase.auth.getUser()

  return data.user?.id ?? null
}

const getCurrentAdminRole = async () => {
  const userId = await getCurrentAdminUserId()

  if (!userId) {
    return null
  }

  const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single()

  if (error) {
    throw error
  }

  return data.role
}

const insertAdminAuditEvent = async (
  action: string,
  targetTable: string,
  targetId: string | null,
  details: Json = {}
) => {
  const { error } = await supabase.from('admin_audit_events').insert({
    action,
    actor_id: await getCurrentAdminUserId(),
    details,
    target_id: targetId,
    target_table: targetTable,
  })

  if (error) {
    throw error
  }
}

const getSignalSummariesForTargets = async (
  targetType: CommunityTargetType,
  targetIds: string[]
): Promise<Map<string, CommunitySignalSummary>> => {
  const uniqueTargetIds = uniqueIds(targetIds)
  const summaries = new Map<string, CommunitySignalSummary>()

  uniqueTargetIds.forEach((targetId) => {
    summaries.set(targetId, {
      communityScore: 0,
      flagCount: 0,
      pendingCommentCount: 0,
    })
  })

  if (uniqueTargetIds.length === 0) {
    return summaries
  }

  const [scoreResult, flagResult, commentResult] = await Promise.all([
    supabase
      .from('community_scores')
      .select('target_id, community_score')
      .eq('target_type', targetType)
      .in('target_id', uniqueTargetIds),
    supabase
      .from('open_flag_counts')
      .select('target_id, flag_count')
      .eq('target_type', targetType)
      .in('target_id', uniqueTargetIds),
    supabase
      .from('comments')
      .select('target_id')
      .eq('target_type', targetType)
      .eq('status', 'pending')
      .in('target_id', uniqueTargetIds),
  ])

  if (scoreResult.error) {
    throw scoreResult.error
  }

  if (flagResult.error) {
    throw flagResult.error
  }

  if (commentResult.error) {
    throw commentResult.error
  }

  scoreResult.data.forEach((row) => {
    if (!row.target_id) {
      return
    }

    const summary = summaries.get(row.target_id)

    if (summary) {
      summary.communityScore = row.community_score ?? 0
    }
  })

  flagResult.data.forEach((row) => {
    if (!row.target_id) {
      return
    }

    const summary = summaries.get(row.target_id)

    if (summary) {
      summary.flagCount = row.flag_count ?? 0
    }
  })

  commentResult.data.forEach((row) => {
    const summary = summaries.get(row.target_id)

    if (summary) {
      summary.pendingCommentCount += 1
    }
  })

  return summaries
}

export const getSignalSummaryForTarget = async (
  targetType: CommunityTargetType,
  targetId: string
): Promise<CommunitySignalSummary> => {
  const summaries = await getSignalSummariesForTargets(targetType, [targetId])

  return (
    summaries.get(targetId) ?? {
      communityScore: 0,
      flagCount: 0,
      pendingCommentCount: 0,
    }
  )
}

const withReviewerFields = async <T extends { id: string }>(
  update: PromiseLike<{ data: T | null; error: unknown }>
) => {
  const { data, error } = await update

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error('Moderation update returned no row.')
  }

  return data
}

export const getPendingComments = async (
  page = 0,
  filters: AdminCommentFilters = {}
): Promise<AdminCommentPage> => {
  const pageOffset = Math.max(0, page) * adminCommentPageSize
  let query = supabase
    .from('comments')
    .select('*, author:profiles!comments_author_id_fkey(display_name,email,role)', {
      count: 'exact',
    })
    .order('created_at', { ascending: true })
    .range(pageOffset, pageOffset + adminCommentPageSize - 1)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  } else if (!filters.status) {
    query = query.eq('status', 'pending')
  }

  if (filters.targetType && filters.targetType !== 'all') {
    query = query.eq('target_type', filters.targetType)
  }

  const { data, error, count } = await query

  if (error) {
    throw error
  }

  return {
    comments: (data ?? []) as unknown as AdminCommentModerationRow[],
    page,
    pageSize: adminCommentPageSize,
    totalCount: requireCount(count),
  }
}

const moderateComment = async (
  commentId: string,
  status: AdminCommentRow['status'],
  note: string | null = null
) => {
  return withReviewerFields(
    supabase
      .from('comments')
      .update({
        reviewed_at: new Date().toISOString(),
        reviewer_id: await getCurrentAdminUserId(),
        reviewer_note: note,
        status,
      })
      .eq('id', commentId)
      .select('*')
      .single()
  )
}

export const approveComment = async (commentId: string) => {
  return moderateComment(commentId, 'approved')
}

export const rejectComment = async (commentId: string) => {
  return moderateComment(commentId, 'rejected')
}

export const requestCommentClarification = async (commentId: string, note: string) => {
  const trimmed = note.trim()

  if (!trimmed) {
    throw new Error('Clarification note is required.')
  }

  return moderateComment(commentId, 'needs_clarification', trimmed)
}

export const getOpenFlags = async (
  page = 0,
  filters: AdminFlagFilters = {}
): Promise<AdminFlagPage> => {
  const pageOffset = Math.max(0, page) * adminFlagPageSize
  let query = supabase
    .from('content_flags')
    .select('*, reporter:profiles!content_flags_reporter_id_fkey(display_name,email)', {
      count: 'exact',
    })
    .order('created_at', { ascending: true })
    .range(pageOffset, pageOffset + adminFlagPageSize - 1)

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status)
  } else if (!filters.status) {
    query = query.eq('status', 'open')
  }

  if (filters.targetType && filters.targetType !== 'all') {
    query = query.eq('target_type', filters.targetType)
  }

  const { data, error, count } = await query

  if (error) {
    throw error
  }

  return {
    flags: (data ?? []) as unknown as AdminFlagModerationRow[],
    page,
    pageSize: adminFlagPageSize,
    totalCount: requireCount(count),
  }
}

export const getOpenFlagsForTarget = async (
  targetType: FlagTargetType,
  targetId: string
): Promise<AdminFlagModerationRow[]> => {
  const { data, error } = await supabase
    .from('content_flags')
    .select('*, reporter:profiles!content_flags_reporter_id_fkey(display_name,email)')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return (data ?? []) as unknown as AdminFlagModerationRow[]
}

const moderateFlag = async (flagId: string, status: Extract<AdminFlagRow['status'], string>) => {
  return withReviewerFields(
    supabase
      .from('content_flags')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by: await getCurrentAdminUserId(),
        status,
      })
      .eq('id', flagId)
      .select('*')
      .single()
  )
}

export const resolveFlag = async (flagId: string) => {
  return moderateFlag(flagId, 'resolved')
}

export const dismissFlag = async (flagId: string) => {
  return moderateFlag(flagId, 'dismissed')
}

export const createAdminSource = async (input: CreateAdminSourceInput) => {
  const tier = input.category ? sourceTierFromCategory(input.category) : input.tier
  const row: TablesInsert<'sources'> = {
    authors: input.authors,
    category: input.category ?? null,
    description: input.description,
    file_path: input.filePath,
    format: input.format,
    id: input.id,
    pipeline_stage: 'uploaded',
    publication_date: input.publicationDate,
    status: 'draft',
    tier,
    title: input.title,
    url: input.url,
  }

  const { data, error } = await supabase.from('sources').insert(row).select('*').single()

  if (error) {
    throw error
  }

  return data
}

export interface EntityTimelineDates {
  date_era: string | null
  date_sort_year: number | null
}

export const getEntityTimelineDates = async (entityId: string): Promise<EntityTimelineDates> => {
  const { data, error } = await supabase
    .from('entities')
    .select('date_era, date_sort_year')
    .eq('id', entityId)
    .single()

  if (error) {
    throw error
  }

  return data
}

export const updateEntityTimelineDates = async (
  entityId: string,
  dates: EntityTimelineDates
): Promise<void> => {
  const { error } = await supabase
    .from('entities')
    .update({
      date_era: dates.date_era,
      date_sort_year: dates.date_sort_year,
    })
    .eq('id', entityId)

  if (error) {
    throw error
  }
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
    if (source?.format === 'url') {
      if (stage === 'chunking_failed') {
        return {
          disabledReason: 'Use the Fetch URL button to re-fetch this URL source.',
          functionName: null,
          label: 'Run extraction',
        }
      }

      return {
        disabledReason: null,
        functionName: 'trigger-extraction',
        label: 'Run extraction',
      }
    }

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
        disabledReason:
          'URL ingestion requires Fetch URL for URL-format sources before running extraction.',
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

const getSourceAnchorIds = async (sourceId: string) => {
  const { data, error } = await supabase
    .from('source_anchors')
    .select('id')
    .eq('source_id', sourceId)

  if (error) {
    throw error
  }

  return data.map((anchor) => anchor.id)
}

const getSourceClaimIds = async (sourceId: string) => {
  const anchorIds = await getSourceAnchorIds(sourceId)

  if (anchorIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('claim_evidence')
    .select('claim_id')
    .in('anchor_id', anchorIds)

  if (error) {
    throw error
  }

  return uniqueIds(data.map((evidenceLink) => evidenceLink.claim_id))
}

export const getSourceAffectedEntityIds = async (sourceId: string): Promise<string[]> => {
  const anchorIds = await getSourceAnchorIds(sourceId)

  if (anchorIds.length === 0) {
    return []
  }

  const [entityLinksResult, evidenceLinksResult] = await Promise.all([
    supabase.from('entity_source_anchors').select('entity_id').in('anchor_id', anchorIds),
    supabase.from('claim_evidence').select('claim_id').in('anchor_id', anchorIds),
  ])

  if (entityLinksResult.error) {
    throw entityLinksResult.error
  }

  if (evidenceLinksResult.error) {
    throw evidenceLinksResult.error
  }

  const claimIds = uniqueIds(evidenceLinksResult.data.map((evidenceLink) => evidenceLink.claim_id))

  if (claimIds.length === 0) {
    return uniqueIds(entityLinksResult.data.map((entityLink) => entityLink.entity_id))
  }

  const { data: claimEntityLinks, error: claimEntityLinksError } = await supabase
    .from('claim_entities')
    .select('entity_id')
    .in('claim_id', claimIds)

  if (claimEntityLinksError) {
    throw claimEntityLinksError
  }

  return uniqueIds([
    ...entityLinksResult.data.map((entityLink) => entityLink.entity_id),
    ...claimEntityLinks.map((entityLink) => entityLink.entity_id),
  ])
}

export const getSourceImpact = async (sourceId: string): Promise<AdminSourceImpact> => {
  const anchorIds = await getSourceAnchorIds(sourceId)

  if (anchorIds.length === 0) {
    return { claims: [], entities: [] }
  }

  const [entityLinksResult, evidenceLinksResult] = await Promise.all([
    supabase.from('entity_source_anchors').select('entity_id').in('anchor_id', anchorIds),
    supabase.from('claim_evidence').select('claim_id').in('anchor_id', anchorIds),
  ])

  if (entityLinksResult.error) {
    throw entityLinksResult.error
  }

  if (evidenceLinksResult.error) {
    throw evidenceLinksResult.error
  }

  const entityIds = uniqueIds(entityLinksResult.data.map((entityLink) => entityLink.entity_id))
  const claimIds = uniqueIds(evidenceLinksResult.data.map((evidenceLink) => evidenceLink.claim_id))

  const [entitiesResult, claimsResult, claimEntityLinksResult] = await Promise.all([
    entityIds.length > 0
      ? supabase
          .from('entities')
          .select('*')
          .in('id', entityIds)
          .neq('status', 'archived')
          .order('name')
      : Promise.resolve({ data: [] as AdminEntityRow[], error: null }),
    claimIds.length > 0
      ? supabase
          .from('claims')
          .select('*')
          .in('id', claimIds)
          .neq('status', 'archived')
          .order('updated_at', {
            ascending: false,
          })
      : Promise.resolve({ data: [] as AdminClaimRow[], error: null }),
    claimIds.length > 0
      ? supabase.from('claim_entities').select('claim_id, entity_id').in('claim_id', claimIds)
      : Promise.resolve({
          data: [] as Array<{ claim_id: string; entity_id: string }>,
          error: null,
        }),
  ])

  if (entitiesResult.error) {
    throw entitiesResult.error
  }

  if (claimsResult.error) {
    throw claimsResult.error
  }

  if (claimEntityLinksResult.error) {
    throw claimEntityLinksResult.error
  }

  const claimEntityIds = uniqueIds(
    claimEntityLinksResult.data.map((entityLink) => entityLink.entity_id)
  )
  const { data: claimEntities, error: claimEntitiesError } =
    claimEntityIds.length > 0
      ? await supabase.from('entities').select('id, name').in('id', claimEntityIds)
      : { data: [] as Array<Pick<AdminEntityRow, 'id' | 'name'>>, error: null }

  if (claimEntitiesError) {
    throw claimEntitiesError
  }

  const entityNamesById = new Map(claimEntities.map((entity) => [entity.id, entity.name]))
  const entityNamesByClaimId = new Map<string, string[]>()

  claimEntityLinksResult.data.forEach((entityLink) => {
    const entityName = entityNamesById.get(entityLink.entity_id)

    if (!entityName) {
      return
    }

    const names = entityNamesByClaimId.get(entityLink.claim_id) ?? []
    names.push(entityName)
    entityNamesByClaimId.set(entityLink.claim_id, names)
  })

  return {
    claims: claimsResult.data.map((claim) => ({
      ...claim,
      entityNames: entityNamesByClaimId.get(claim.id) ?? [],
    })),
    entities: entitiesResult.data,
  }
}

export const updateSourceTier = async (sourceId: string, tier: SourceTier) => {
  const { data: currentSource, error: currentSourceError } = await supabase
    .from('sources')
    .select('tier')
    .eq('id', sourceId)
    .single()

  if (currentSourceError) {
    throw currentSourceError
  }

  const { data, error } = await supabase
    .from('sources')
    .update({ tier })
    .eq('id', sourceId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_source_tier', 'sources', sourceId, {
    new_tier: tier,
    old_tier: currentSource.tier,
  })

  return data
}

export const updateSourceCategory = async (sourceId: string, category: SourceCategory) => {
  const { data: currentSource, error: currentSourceError } = await supabase
    .from('sources')
    .select('category,tier')
    .eq('id', sourceId)
    .single()

  if (currentSourceError) {
    throw currentSourceError
  }

  const tier = sourceTierFromCategory(category)
  const { data, error } = await supabase
    .from('sources')
    .update({ category, tier })
    .eq('id', sourceId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_source_category', 'sources', sourceId, {
    new_category: category,
    new_tier: tier,
    old_category: currentSource.category,
    old_tier: currentSource.tier,
  })

  return data
}

export const updateSourceRightsMetadata = async (
  sourceId: string,
  values: Pick<
    TablesUpdate<'sources'>,
    'attribution' | 'fair_use_rationale' | 'license' | 'rights_notes'
  >
) => {
  const { data, error } = await supabase
    .from('sources')
    .update(values)
    .eq('id', sourceId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_source_rights_metadata', 'sources', sourceId, values as Json)

  return data
}

export const triggerUrlFetch = async (sourceId: string) => {
  const { data, error } = await supabase.functions.invoke('trigger-url-fetch', {
    body: { source_id: sourceId },
  })

  if (error) {
    throw error
  }

  return data as { chunks_created?: number; pipeline_stage?: string; source_id?: string }
}

export const triggerSiteCrawl = async (rootUrl: string) => {
  const { data, error } = await supabase.functions.invoke('trigger-site-crawl', {
    body: { root_url: rootUrl },
  })

  if (error) {
    throw error
  }

  return data as {
    created: Array<{ id: string; title: string; url: string; word_count: number }>
    skipped: Array<{ reason: string; url: string }>
    total_discovered: number
    truncated: boolean
  }
}

export const createEntityImagePath = (entityId: string, file: File, kind: 'hero' | 'profile') => {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : 'jpg'
  const safeExtension = extension?.replace(/[^a-z0-9]/g, '') || 'jpg'

  return `${entityId}/${kind}-${Date.now()}.${safeExtension}`
}

export const uploadEntityImage = async (
  entityId: string,
  file: File,
  kind: 'hero' | 'profile'
) => {
  const path = createEntityImagePath(entityId, file, kind)
  const { error } = await supabase.storage.from(entityImagesBucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: true,
  })

  if (error) {
    throw error
  }

  const { data } = supabase.storage.from(entityImagesBucket).getPublicUrl(path)

  return data.publicUrl
}

export const updateEntityImages = async (
  entityId: string,
  values: Pick<TablesUpdate<'entities'>, 'hero_image_url' | 'image_url'>
) => {
  const { data, error } = await supabase
    .from('entities')
    .update(values)
    .eq('id', entityId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_entity_images', 'entities', entityId, values as Json)

  return data
}

export const listUrlIngestionDomains = async (): Promise<UrlIngestionDomainRow[]> => {
  const { data, error } = await supabase
    .from('url_ingestion_config')
    .select('*')
    .order('domain', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export const normalizeUrlIngestionDomain = (domain: string) => {
  const trimmedDomain = domain.trim().toLowerCase()

  if (!trimmedDomain) {
    throw new Error('Domain is required.')
  }

  let url: URL

  try {
    url = new URL(
      trimmedDomain.startsWith('http://') || trimmedDomain.startsWith('https://')
        ? trimmedDomain
        : `https://${trimmedDomain}`
    )
  } catch {
    throw new Error('Enter a valid domain, such as example.com.')
  }

  const hostname = url.hostname.replace(/\.$/, '')

  if (!hostname || !hostname.includes('.')) {
    throw new Error('Enter a valid domain, such as example.com.')
  }

  return hostname
}

export const createUrlIngestionDomain = async (domain: string) => {
  const normalizedDomain = normalizeUrlIngestionDomain(domain)

  const { data, error } = await supabase
    .from('url_ingestion_config')
    .insert({
      added_by: await getCurrentAdminUserId(),
      domain: normalizedDomain,
    })
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('create_url_ingestion_domain', 'url_ingestion_config', data.id, {
    domain: normalizedDomain,
  })

  return data
}

export const updateUrlIngestionDomainEnabled = async (domainId: string, enabled: boolean) => {
  const { data, error } = await supabase
    .from('url_ingestion_config')
    .update({ enabled })
    .eq('id', domainId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_url_ingestion_domain', 'url_ingestion_config', domainId, {
    enabled,
  })

  return data
}

export const getAdminSuggestions = async (params?: {
  status?: AdminSuggestionRow['status']
  type?: AdminSuggestionRow['type']
  page?: number
  pageSize?: number
}): Promise<AdminSuggestionRow[]> => {
  const { status, type, page = 0, pageSize = 50 } = params ?? {}

  let query = supabase
    .from('suggestions')
    .select(
      `
      *,
      submitter:profiles!suggestions_submitter_id_fkey(display_name,email),
      targetEntity:entities!suggestions_target_entity_id_fkey(id,name,slug),
      targetClaim:claims!suggestions_target_claim_id_fkey(id,statement)
    `
    )
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)

  if (status) {
    query = query.eq('status', status)
  }

  if (type) {
    query = query.eq('type', type)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return data as unknown as AdminSuggestionRow[]
}

export const approveSuggestion = async (suggestionId: string, adminNote: string | null = null) => {
  const { data, error } = await supabase.rpc('approve_suggestion', {
    admin_note: adminNote,
    suggestion_id: suggestionId,
  })

  if (error) {
    throw error
  }

  return data as { created_claim_id: string | null; status: string; suggestion_id: string }
}

export const rejectSuggestion = async (suggestionId: string, rejectionReason: string | null) => {
  const { data, error } = await supabase
    .from('suggestions')
    .update({
      rejection_reason: rejectionReason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: await getCurrentAdminUserId(),
      status: 'rejected',
    })
    .eq('id', suggestionId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export const requestSuggestionClarification = async (
  suggestionId: string,
  adminNotes: string | null
) => {
  const { data, error } = await supabase
    .from('suggestions')
    .update({
      admin_notes: adminNotes,
      reviewed_at: new Date().toISOString(),
      reviewed_by: await getCurrentAdminUserId(),
      status: 'clarification_requested',
    })
    .eq('id', suggestionId)
    .select('*')
    .single()

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
    // The list RPC does not yet expose Phase 2 source metadata columns; detail views fetch them.
    const source: AdminSourceRow = {
      authors: row.authors,
      attribution: null,
      category: null,
      crawl_date: null,
      created_at: row.created_at,
      description: row.description,
      duration_seconds: row.duration_seconds,
      fair_use_rationale: null,
      file_path: row.file_path,
      format: row.format,
      id: row.id,
      license: null,
      page_count: row.page_count,
      pipeline_stage: row.pipeline_stage,
      pipeline_stage_entered_at: row.pipeline_stage_entered_at,
      pipeline_error: row.pipeline_error,
      publication_date: row.publication_date,
      rights_notes: null,
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

export const getPendingReviewSourceSummaries = async (
  page = 0,
  sort: ReviewQueueSort = 'oldest'
): Promise<ReviewSourceSummary[]> => {
  const fetchLimit = sort === 'oldest' ? reviewQueuePageSize : 500
  const { data, error } = await supabase.rpc('get_pending_review_source_summaries', {
    page_limit: fetchLimit,
    page_offset: sort === 'oldest' ? page * reviewQueuePageSize : 0,
  })

  if (error) {
    throw error
  }

  const { data: signalRows, error: signalError } = await supabase.rpc('get_review_queue_signals')

  if (signalError) {
    throw signalError
  }

  const signalsBySourceId = new Map(
    (signalRows ?? []).map((signal) => [
      signal.source_id,
      {
        communityScore: signal.community_score ?? 0,
        flagCount: signal.flag_count ?? 0,
      },
    ])
  )

  const summaries = data.map((row) => ({
    communityScore: signalsBySourceId.get(row.source_id)?.communityScore ?? 0,
    flagCount: signalsBySourceId.get(row.source_id)?.flagCount ?? 0,
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

  const sortedSummaries = [...summaries].sort((first, second) => {
    if (sort === 'newest') {
      return (
        new Date(second.oldestExtractionAt).getTime() -
        new Date(first.oldestExtractionAt).getTime()
      )
    }

    if (sort === 'most_flagged') {
      const flagDelta = second.flagCount - first.flagCount

      if (flagDelta !== 0) {
        return flagDelta
      }
    }

    if (sort === 'highest_net_votes') {
      const scoreDelta = second.communityScore - first.communityScore

      if (scoreDelta !== 0) {
        return scoreDelta
      }
    }

    return (
      new Date(first.oldestExtractionAt).getTime() - new Date(second.oldestExtractionAt).getTime()
    )
  })

  return sort === 'oldest'
    ? sortedSummaries
    : sortedSummaries.slice(page * reviewQueuePageSize, page * reviewQueuePageSize + reviewQueuePageSize)
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

  const signalSummaries = await getSignalSummariesForTargets(
    'entity',
    data.map((row) => row.id)
  )

  return {
    entities: data.map((row) => ({
      aliases: row.aliases,
      communityScore: signalSummaries.get(row.id)?.communityScore ?? 0,
      confidence_override: row.confidence_override,
      confidence_score: row.confidence_score,
      created_at: row.created_at,
      date_era: null,
      date_sort_year: null,
      description: row.description,
      fts: null,
      hero_image_url: null,
      id: row.id,
      image_url: null,
      name: row.name,
      position_x: row.position_x,
      position_y: row.position_y,
      slug: row.slug,
      status: row.status,
      flagCount: signalSummaries.get(row.id)?.flagCount ?? 0,
      pendingCommentCount: signalSummaries.get(row.id)?.pendingCommentCount ?? 0,
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

const getAvailableEntitySlug = async (name: string) => {
  const baseSlug = slugifyEntityName(name)

  for (let suffix = 0; suffix < 100; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`
    const { count, error } = await supabase
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('slug', slug)

    if (error) {
      throw error
    }

    if (requireCount(count) === 0) {
      return slug
    }
  }

  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`
}

export const createAdminEntity = async (input: CreateAdminEntityInput) => {
  const name = normalizeName(input.name)

  if (!name) {
    throw new Error('Entity name is required.')
  }

  const row: TablesInsert<'entities'> = {
    aliases: [],
    date_era: input.dateEra,
    date_sort_year: input.dateSortYear,
    description: input.description,
    name,
    slug: await getAvailableEntitySlug(name),
    status: input.status,
    type: input.type,
  }

  const { data, error } = await supabase.from('entities').insert(row).select('*').single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('create_manual_entity', 'entities', data.id, {
    name: data.name,
    status: data.status,
    type: data.type,
  })

  return data
}

export interface SetClaimCanonicalResult {
  claim_id?: string
  conflict: boolean
  existingCanonicalClaimId?: string
  is_canonical?: boolean
  replaced_claim_id?: string | null
}

const isSetClaimCanonicalResult = (value: unknown): value is SetClaimCanonicalResult => {
  return isObjectRecord(value) && typeof value.conflict === 'boolean'
}

export const updateClaimInterpretationFrame = async (
  claimId: string,
  frame: InterpretationFrame | null
) => {
  const { data: currentClaim, error: currentClaimError } = await supabase
    .from('claims')
    .select('interpretation_frame')
    .eq('id', claimId)
    .single()

  if (currentClaimError) {
    throw currentClaimError
  }

  const { data, error } = await supabase
    .from('claims')
    .update({ interpretation_frame: frame })
    .eq('id', claimId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_claim_interpretation_frame', 'claims', claimId, {
    new_frame: frame,
    old_frame: currentClaim.interpretation_frame,
  })

  return data
}

export const setClaimCanonical = async (
  claimId: string,
  value: boolean,
  forceReplace = false
): Promise<SetClaimCanonicalResult> => {
  const { data, error } = await supabase.rpc('set_claim_canonical', {
    claim_id: claimId,
    force_replace: forceReplace,
    next_is_canonical: value,
  })

  if (error) {
    throw error
  }

  if (!isSetClaimCanonicalResult(data)) {
    throw new Error('Canonical update returned an invalid payload.')
  }

  return data
}

export const createAdminClaim = async (input: CreateAdminClaimInput) => {
  const statement = input.content.trim()
  const entityIds = uniqueIds(input.entityIds)

  if (!statement) {
    throw new Error('Claim content is required.')
  }

  if (entityIds.length === 0) {
    throw new Error('At least one entity is required.')
  }

  if (input.isCanonical) {
    const role = await getCurrentAdminRole()

    if (role !== 'super_admin') {
      throw new Error('Only super admins can set canonical claims.')
    }
  }

  const { data: claim, error: claimError } = await supabase
    .from('claims')
    .insert({
      author_id: await getCurrentAdminUserId(),
      interpretation_frame: input.interpretationFrame,
      statement,
      status: input.status,
    })
    .select('*')
    .single()

  if (claimError) {
    throw claimError
  }

  const { error: linkError } = await supabase.from('claim_entities').insert(
    entityIds.map((entityId) => ({
      claim_id: claim.id,
      entity_id: entityId,
    }))
  )

  if (linkError) {
    throw linkError
  }

  if (input.isCanonical) {
    const canonicalResult = await setClaimCanonical(claim.id, true)

    if (canonicalResult.conflict) {
      await insertAdminAuditEvent('create_manual_claim', 'claims', claim.id, {
        canonical_conflict: true,
        entity_ids: entityIds,
        interpretation_frame: input.interpretationFrame,
        is_canonical: false,
        status: input.status,
      })

      return {
        ...claim,
        canonicalConflict: true,
        existingCanonicalClaimId: canonicalResult.existingCanonicalClaimId ?? null,
        is_canonical: false,
      }
    }
  }

  await insertAdminAuditEvent('create_manual_claim', 'claims', claim.id, {
    entity_ids: entityIds,
    interpretation_frame: input.interpretationFrame,
    is_canonical: input.isCanonical,
    status: input.status,
  })

  return { ...claim, is_canonical: input.isCanonical }
}

export const updateAdminEntityStatus = async (entityId: string, status: ContentStatus) => {
  const { data: currentEntity, error: currentEntityError } = await supabase
    .from('entities')
    .select('status')
    .eq('id', entityId)
    .single()

  if (currentEntityError) {
    throw currentEntityError
  }

  const updateValues = status === 'draft' ? { confidence_score: 0, status } : { status }
  const { data, error } = await supabase
    .from('entities')
    .update(updateValues)
    .eq('id', entityId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_entity_status', 'entities', entityId, {
    new_status: status,
    old_status: currentEntity.status,
  })

  if (status === 'published') {
    await recomputeConfidenceInBatches([entityId])
  }

  return data
}

export const updateEntityConfidenceOverride = async (entityId: string, override: number | null) => {
  if (override !== null) {
    requireBoundedNumber(override, 'Entity confidence override', 0, 1)
  }

  const { data: currentEntity, error: currentEntityError } = await supabase
    .from('entities')
    .select('confidence_override')
    .eq('id', entityId)
    .single()

  if (currentEntityError) {
    throw currentEntityError
  }

  const { data, error } = await supabase
    .from('entities')
    .update({ confidence_override: override })
    .eq('id', entityId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_entity_confidence_override', 'entities', entityId, {
    new_override: override,
    old_override: currentEntity.confidence_override,
  })

  return data
}

export const publishAdminEntities = async (
  entityIds: string[]
): Promise<{ entities: AdminEntityRow[]; confidenceUpdateFailed: boolean }> => {
  const uniqueEntityIds = uniqueStrings(entityIds)

  if (uniqueEntityIds.length === 0) {
    return { entities: [], confidenceUpdateFailed: false }
  }

  const { data, error } = await supabase
    .from('entities')
    .update({ status: 'published' })
    .in('id', uniqueEntityIds)
    .select('*')

  if (error) {
    throw error
  }

  let confidenceUpdateFailed = false

  try {
    await recomputeConfidenceInBatches(uniqueEntityIds)
  } catch {
    confidenceUpdateFailed = true
  }

  return { entities: data, confidenceUpdateFailed }
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

  const signalSummaries = await getSignalSummariesForTargets(
    'claim',
    data.map((row) => row.id)
  )

  return {
    claims: data.map((row) => ({
      author_id: row.author_id,
      communityScore: signalSummaries.get(row.id)?.communityScore ?? 0,
      confidence_override: row.confidence_override,
      confidence_score: row.confidence_score,
      created_at: row.created_at,
      detailed_argument: row.detailed_argument,
      entityNames: row.entity_names,
      evidenceCount: row.evidence_count,
      id: row.id,
      interpretation_frame: row.interpretation_frame,
      is_canonical: row.is_canonical,
      flagCount: signalSummaries.get(row.id)?.flagCount ?? 0,
      pendingCommentCount: signalSummaries.get(row.id)?.pendingCommentCount ?? 0,
      statement: row.statement,
      status: row.status,
      updated_at: row.updated_at,
    })),
    page,
    pageSize: adminClaimPageSize,
    totalCount: data[0]?.total_count ?? 0,
  }
}

const setAdminClaimStatus = async (claimId: string, status: ContentStatus) => {
  const { data: affectedEntityIds, error } = await supabase.rpc('update_claim_status', {
    claim_id: claimId,
    next_status: status,
  })

  if (error) {
    throw error
  }

  return affectedEntityIds
}

export const updateAdminClaimStatus = async (claimId: string, status: ContentStatus) => {
  const affectedEntityIds = await setAdminClaimStatus(claimId, status)

  await recomputeConfidenceInBatches(affectedEntityIds)
}

export const updateClaimConfidenceOverride = async (claimId: string, override: number | null) => {
  if (override !== null) {
    requireBoundedNumber(override, 'Claim confidence override', 0, 1)
  }

  const { data: currentClaim, error: currentClaimError } = await supabase
    .from('claims')
    .select('confidence_override')
    .eq('id', claimId)
    .single()

  if (currentClaimError) {
    throw currentClaimError
  }

  const { data, error } = await supabase
    .from('claims')
    .update({ confidence_override: override })
    .eq('id', claimId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_claim_confidence_override', 'claims', claimId, {
    new_override: override,
    old_override: currentClaim.confidence_override,
  })

  return data
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

  await recomputeConfidenceInBatches(affectedEntityIds)
}

const updateSourceClaimsStatus = async (
  sourceId: string,
  status: ContentStatus,
  claimIds: string[]
) => {
  const requestedClaimIds = uniqueStrings(claimIds)

  if (requestedClaimIds.length === 0) {
    return { affectedEntityIds: [], claimIds: [] }
  }

  const sourceClaimIds = new Set(await getSourceClaimIds(sourceId))
  const scopedClaimIds = requestedClaimIds.filter((claimId) => sourceClaimIds.has(claimId))

  if (scopedClaimIds.length === 0) {
    return { affectedEntityIds: [], claimIds: [] }
  }

  const { data: affectedEntityIds, error } = await supabase.rpc('bulk_update_claim_status', {
    claim_ids: scopedClaimIds,
    next_status: status,
  })

  if (error) {
    throw error
  }

  await recomputeConfidenceInBatches(affectedEntityIds)

  return { affectedEntityIds, claimIds: scopedClaimIds }
}

export const unpublishSourceClaims = async (sourceId: string, claimIds: string[]) => {
  return updateSourceClaimsStatus(sourceId, 'draft', claimIds)
}

export const markSourceClaimsDisputed = async (sourceId: string, claimIds: string[]) => {
  return updateSourceClaimsStatus(sourceId, 'disputed', claimIds)
}

const getRelationshipSearchEntityIds = async (search: string) => {
  const query = search.trim()

  if (!query) {
    return []
  }

  const { data, error } = await supabase
    .from('entities')
    .select('id')
    .ilike('name', `%${query}%`)
    .limit(100)

  if (error) {
    throw error
  }

  return data.map((entity) => entity.id)
}

export const getAdminRelationships = async ({
  page = 0,
  pageSize = adminRelationshipPageSize,
  search = '',
  status = null,
}: GetAdminRelationshipsOptions = {}): Promise<AdminRelationshipPage> => {
  const resolvedPageSize = Math.max(1, Math.min(Math.floor(pageSize), adminRelationshipMaxPageSize))
  const pageOffset = Math.max(0, page) * resolvedPageSize
  const searchEntityIds = await getRelationshipSearchEntityIds(search)

  if (search.trim() && searchEntityIds.length === 0) {
    return {
      page,
      pageSize: resolvedPageSize,
      relationships: [],
      totalCount: 0,
    }
  }

  let query = supabase
    .from('relationships')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(pageOffset, pageOffset + resolvedPageSize - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (searchEntityIds.length > 0) {
    const entityFilter = searchEntityIds.join(',')
    query = query.or(`from_entity_id.in.(${entityFilter}),to_entity_id.in.(${entityFilter})`)
  }

  const { data: relationships, error, count } = await query

  if (error) {
    throw error
  }

  const entityIds = uniqueIds(
    relationships.flatMap((relationship) => [
      relationship.from_entity_id,
      relationship.to_entity_id,
    ])
  )
  const claimIds = uniqueIds(relationships.flatMap((relationship) => relationship.claim_ids))

  const [entitiesResult, claimsResult] = await Promise.all([
    entityIds.length > 0
      ? supabase.from('entities').select('id, name, status, type').in('id', entityIds)
      : Promise.resolve({
          data: [] as AdminRelationshipEntitySummary[],
          error: null,
        }),
    claimIds.length > 0
      ? supabase
          .from('claims')
          .select('id, statement, status, confidence_score, confidence_override')
          .in('id', claimIds)
      : Promise.resolve({
          data: [] as AdminRelationshipClaimSummary[],
          error: null,
        }),
  ])

  if (entitiesResult.error) {
    throw entitiesResult.error
  }

  if (claimsResult.error) {
    throw claimsResult.error
  }

  const entitiesById = new Map(entitiesResult.data.map((entity) => [entity.id, entity]))
  const claimsById = new Map(claimsResult.data.map((claim) => [claim.id, claim]))

  return {
    page,
    pageSize: resolvedPageSize,
    relationships: relationships.map((relationship) => {
      const backingClaims = relationship.claim_ids.flatMap((claimId) => {
        const claim = claimsById.get(claimId)

        return claim ? [claim] : []
      })

      return {
        ...relationship,
        backingClaims,
        claimCount: backingClaims.length,
        computedWeight: relationship.weight,
        effectiveWeight: getEffectiveRelationshipWeight(relationship),
        fromEntity: entitiesById.get(relationship.from_entity_id) ?? null,
        toEntity: entitiesById.get(relationship.to_entity_id) ?? null,
      }
    }),
    totalCount: requireCount(count),
  }
}

export const updateRelationshipWeight = async (relationshipId: string, weight: number | null) => {
  if (weight !== null) {
    requireBoundedNumber(weight, 'Relationship weight', 0, 1)
  }

  const { data: currentRelationship, error: currentRelationshipError } = await supabase
    .from('relationships')
    .select('weight, weight_override')
    .eq('id', relationshipId)
    .single()

  if (currentRelationshipError) {
    throw currentRelationshipError
  }

  const { data, error } = await supabase
    .from('relationships')
    .update({ weight_override: weight })
    .eq('id', relationshipId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent('update_relationship_weight', 'relationships', relationshipId, {
    new_weight_override: weight,
    old_effective_weight: currentRelationship.weight_override ?? currentRelationship.weight,
    old_weight_override: currentRelationship.weight_override,
  })

  return data
}

const updateRelationshipStatus = async (
  relationshipId: string,
  values: TablesUpdate<'relationships'>,
  action: string
) => {
  const { data, error } = await supabase
    .from('relationships')
    .update(values)
    .eq('id', relationshipId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  await insertAdminAuditEvent(action, 'relationships', relationshipId, {
    status: values.status ?? null,
  })

  return data
}

export const archiveRelationship = async (relationshipId: string) => {
  return updateRelationshipStatus(
    relationshipId,
    {
      archived_at: new Date().toISOString(),
      archived_by: await getCurrentAdminUserId(),
      status: 'archived',
    },
    'archive_relationship'
  )
}

export const restoreRelationship = async (relationshipId: string) => {
  return updateRelationshipStatus(
    relationshipId,
    {
      archived_at: null,
      archived_by: null,
      status: 'active',
    },
    'restore_relationship'
  )
}

export const updateAdminSourceStatus = async (sourceId: string, status: ContentStatus) => {
  const { data: affectedEntityIds, error } = await supabase.rpc('update_source_status', {
    next_status: status,
    source_id: sourceId,
  })

  if (error) {
    throw error
  }

  await recomputeConfidenceInBatches(affectedEntityIds)
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

  await recomputeConfidenceInBatches(affectedEntityIds)
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

export const recomputeConfidenceInBatches = async (entityIds: string[]) => {
  const uniqueEntityIds = uniqueIds(entityIds)

  for (const batch of chunkStrings(uniqueEntityIds, confidenceComputationBatchSize)) {
    await triggerConfidenceComputation(batch)
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

  const reviewResult: ReviewActionResult = data

  if (input.action === 'edit' && input.itemKind === 'claim' && input.claim) {
    const createdClaimId = reviewResult.createdIds[0]

    if (createdClaimId) {
      if (input.claim.interpretationFrame !== null) {
        await updateClaimInterpretationFrame(createdClaimId, input.claim.interpretationFrame)
      }

      if (input.claim.isCanonical) {
        const result = await setClaimCanonical(createdClaimId, true)

        if (result.conflict) {
          return { ...reviewResult, canonicalConflict: true }
        }
      }
    }
  }

  if (input.action === 'confirm' && input.itemKind === 'claim' && input.confirmClaimMeta) {
    const createdClaimId = reviewResult.createdIds[0]

    if (createdClaimId) {
      if (input.confirmClaimMeta.interpretationFrame !== null) {
        await updateClaimInterpretationFrame(
          createdClaimId,
          input.confirmClaimMeta.interpretationFrame
        )
      }

      if (input.confirmClaimMeta.isCanonical) {
        const result = await setClaimCanonical(createdClaimId, true)

        if (result.conflict) {
          return { ...reviewResult, canonicalConflict: true }
        }
      }
    }
  }

  return reviewResult
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

export const normalizeSourceUrl = normalizeSourceUrlForDedup

export const adminSourceUrlExists = async (
  url: string
): Promise<AdminSourceUrlDuplicate | null> => {
  const normalizedUrl = normalizeSourceUrlForDedup(url)

  if (!normalizedUrl) {
    return null
  }

  const { data, error } = await supabase.rpc('find_source_by_normalized_url', {
    input_url: normalizedUrl,
  })

  if (error) {
    throw error
  }

  return data[0] ?? null
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
const sourceCategoriesSet: Array<NonNullable<AdminSourceRow['category']>> = [
  'primary_rem',
  'secondary_rem',
  'external_academic',
  'historical_record',
  'literary_artistic',
  'community_submitted',
]
const sourceTiers: Array<AdminSourceRow['tier']> = ['primary', 'secondary']

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

const isNullableSourceCategory = (value: unknown): value is AdminSourceRow['category'] => {
  return (
    value === null ||
    (typeof value === 'string' && sourceCategoriesSet.some((category) => category === value))
  )
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
    isNullableSourceCategory(value.category) &&
    isNullableString(value.url) &&
    isNullableString(value.file_path) &&
    isNullableNumber(value.duration_seconds) &&
    isNullableNumber(value.page_count) &&
    isNullableString(value.crawl_date) &&
    isNullableString(value.license) &&
    isNullableString(value.rights_notes) &&
    isNullableString(value.fair_use_rationale) &&
    isNullableString(value.attribution) &&
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

import { supabase } from '@/lib/supabase/client'
import type { Enums, Tables, TablesInsert } from '@/types/database'

export type AdminSourceRow = Tables<'sources'>
export type EntityType = Enums<'entity_type'>
export type ContentStatus = Enums<'content_status'>
export type SourceFormat = Enums<'source_format'>
export type SourceTier = Enums<'source_tier'>
export type PipelineStage = Enums<'pipeline_stage'>
export type ExtractionStatus = Enums<'extraction_status'>

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

export type PipelineRerunFunction = 'trigger-transcription' | 'trigger-extraction'

export interface PipelineRerunAction {
  disabledReason: string | null
  functionName: PipelineRerunFunction | null
  label: string
}

const entityTypes: EntityType[] = ['symbol', 'figure', 'narrative', 'culture', 'trope']
const contentStatuses: ContentStatus[] = ['draft', 'published', 'archived', 'disputed']

const confidenceBuckets = [
  { label: '0-0.19', min: 0, max: 0.2 },
  { label: '0.2-0.49', min: 0.2, max: 0.5 },
  { label: '0.5-0.79', min: 0.5, max: 0.8 },
  { label: '0.8-1.0', min: 0.8, max: 1.01 },
]
const adminSourceMonitorLimit = 100
const adminSourceListLimit = 100
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

export const getPipelineRerunAction = (
  stage: PipelineStage,
  source?: Pick<AdminSourceRow, 'file_path' | 'format' | 'status'>
): PipelineRerunAction => {
  if (source?.status === 'archived') {
    return {
      disabledReason: 'Restore this source before re-running the pipeline.',
      functionName: null,
      label: 'Restore required',
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

    return {
      disabledReason: null,
      functionName: 'trigger-transcription',
      label: 'Re-run transcription',
    }
  }

  if (stage === 'chunking' || stage === 'chunking_failed') {
    return {
      disabledReason: 'Chunking recovery will be enabled with the chunking pipeline.',
      functionName: null,
      label: 'Recovery unavailable',
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
  source?: Pick<AdminSourceRow, 'file_path' | 'format' | 'status'>
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
  const { data, error } = await supabase
    .from('sources')
    .update({ status: 'archived' })
    .eq('id', sourceId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
}

export const restoreAdminSource = async (sourceId: string) => {
  const { data, error } = await supabase
    .from('sources')
    .update({ status: 'draft' })
    .eq('id', sourceId)
    .select('*')
    .single()

  if (error) {
    throw error
  }

  return data
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

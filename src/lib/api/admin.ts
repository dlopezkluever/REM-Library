import { supabase } from '@/lib/supabase/client'
import type { Enums, Tables } from '@/types/database'

export type AdminSourceRow = Tables<'sources'>
export type EntityType = Enums<'entity_type'>
export type ContentStatus = Enums<'content_status'>

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

const entityTypes: EntityType[] = ['symbol', 'figure', 'narrative', 'culture', 'trope']
const contentStatuses: ContentStatus[] = ['draft', 'published', 'archived', 'disputed']

const confidenceBuckets = [
  { label: '0-0.19', min: 0, max: 0.2 },
  { label: '0.2-0.49', min: 0.2, max: 0.5 },
  { label: '0.5-0.79', min: 0.5, max: 0.8 },
  { label: '0.8-1.0', min: 0.8, max: 1.01 },
]
const adminSourceMonitorLimit = 100

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

export const getAdminSources = async (): Promise<AdminSourceRow[]> => {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(adminSourceMonitorLimit)

  if (error) {
    throw error
  }

  return data
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

import { supabase } from '@/lib/supabase/client'
import type { Enums, Tables } from '@/types/database'

export type AdminSourceRow = Tables<'sources'>
export type EntityType = Enums<'entity_type'>
export type ContentStatus = Enums<'content_status'>

export interface AdminDashboardCounts {
  publishedEntities: number
  publishedClaims: number
  totalSources: number
  pendingReview: number
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

const requireCount = (count: number | null) => count ?? 0

export const getAdminDashboardCounts = async (): Promise<AdminDashboardCounts> => {
  const [publishedEntities, publishedClaims, totalSources, pendingReview] = await Promise.all([
    supabase
      .from('entities')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase.from('claims').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('sources').select('id', { count: 'exact', head: true }),
    supabase
      .from('extractions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])

  const errors = [
    publishedEntities.error,
    publishedClaims.error,
    totalSources.error,
    pendingReview.error,
  ].filter(Boolean)

  if (errors[0]) {
    throw errors[0]
  }

  return {
    publishedEntities: requireCount(publishedEntities.count),
    publishedClaims: requireCount(publishedClaims.count),
    totalSources: requireCount(totalSources.count),
    pendingReview: requireCount(pendingReview.count),
  }
}

export const getAdminSources = async (): Promise<AdminSourceRow[]> => {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data
}

export const getAdminContentStats = async (): Promise<AdminContentStats> => {
  const [entitiesResult, claimsResult] = await Promise.all([
    supabase.from('entities').select('type, status, confidence_score'),
    supabase.from('claims').select('status, confidence_score'),
  ])

  if (entitiesResult.error) {
    throw entitiesResult.error
  }

  if (claimsResult.error) {
    throw claimsResult.error
  }

  const entitiesByType = entityTypes.map((type) => ({
    type,
    count: entitiesResult.data.filter((entity) => entity.type === type).length,
  }))

  const confidenceValues = [
    ...entitiesResult.data.map((entity) => entity.confidence_score),
    ...claimsResult.data.map((claim) => claim.confidence_score),
  ]

  const confidenceDistribution = confidenceBuckets.map((bucket) => ({
    label: bucket.label,
    count: confidenceValues.filter((score) => score >= bucket.min && score < bucket.max).length,
  }))

  const statusCounts = contentStatuses.map((status) => ({
    status,
    entities: entitiesResult.data.filter((entity) => entity.status === status).length,
    claims: claimsResult.data.filter((claim) => claim.status === status).length,
  }))

  return {
    entitiesByType,
    confidenceDistribution,
    statusCounts,
  }
}

const pipelineStages: Array<AdminSourceRow['pipeline_stage']> = [
  'uploaded',
  'transcribing',
  'chunking',
  'extracting',
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
    isNullableString(value.description)
  )
}

export const subscribeToSourceUpdates = (handler: (source: AdminSourceRow) => void) => {
  const channel = supabase
    .channel('sources')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sources' }, (payload) => {
      const nextSource: unknown = payload.new

      if (isAdminSourceRow(nextSource)) {
        handler(nextSource)
      }
    })
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

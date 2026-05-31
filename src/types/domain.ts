export type EntityType = 'symbol' | 'figure' | 'narrative' | 'culture' | 'trope'

export type RelationshipType =
  | 'symbolizes'
  | 'appears_in'
  | 'belongs_to'
  | 'parallels'
  | 'instantiates'
  | 'supports'

export type ContentStatus = 'draft' | 'published' | 'archived' | 'disputed'

export type SourceFormat = 'audio' | 'video' | 'text' | 'book' | 'url'

export type SourceTier = 'primary' | 'secondary'

export type PipelineStage =
  | 'uploaded'
  | 'transcribing'
  | 'transcribing_failed'
  | 'chunking'
  | 'chunking_failed'
  | 'extracting'
  | 'extracting_failed'
  | 'review'
  | 'curated'
  | 'published'

export type AdminRole = 'super_admin' | 'editor' | 'viewer'

export interface EntityNode {
  id: string
  type: EntityType
  name: string
  slug: string
  aliases: string[]
  description: string | null
  confidence_score: number
  confidence_override: number | null
  position_x: number | null
  position_y: number | null
  status: ContentStatus
  created_at: string
  updated_at: string
}

export interface Relationship {
  id: string
  from_entity_id: string
  to_entity_id: string
  type: RelationshipType
  weight: number
  claim_ids: string[]
  created_at: string
}

export interface FeaturedConnection {
  id: string
  title: string
  description: string
  entity_color: string
  created_at: string
}

export interface Source {
  id: string
  title: string
  authors: string[]
  publication_date: string | null
  format: SourceFormat
  tier: SourceTier
  url: string | null
  file_path: string | null
  duration_seconds: number | null
  page_count: number | null
  pipeline_stage: PipelineStage
  created_at: string
}

export interface EntitySearchResult {
  kind: 'entity'
  id: string
  type: EntityType
  name: string
  slug: string
  confidenceScore: number
  matchedExcerpt: string
}

export interface ClaimSearchResult {
  kind: 'claim'
  id: string
  statement: string
  confidenceScore: number
  matchedExcerpt: string
}

export interface SourceSearchResult {
  kind: 'source'
  id: string
  title: string
  format: SourceFormat
  tier: SourceTier
  matchedExcerpt: string
  chunkId?: string
}

export interface SearchResults {
  entities: EntitySearchResult[]
  claims: ClaimSearchResult[]
  sources: SourceSearchResult[]
}

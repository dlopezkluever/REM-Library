import type { EntityType, RelationshipType } from '@/types/domain'

export interface GraphNodeAttributes {
  entityType: EntityType
  label: string
  slug: string
  description: string | null
  confidence: number
  x: number
  y: number
  persistedPosition: boolean
  hidden?: boolean
}

export interface GraphEdgeAttributes {
  relationshipType: RelationshipType
  label: string
  weight: number
  hidden?: boolean
}

export interface GraphAttributes {
  generatedAt: string
}

export interface EntityPositionUpdate {
  id: string
  position_x: number
  position_y: number
}

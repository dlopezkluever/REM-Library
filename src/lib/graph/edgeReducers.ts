import type { EdgeDisplayData } from 'sigma/types'
import type { RelationshipType } from '@/types/domain'
import type { GraphEdgeAttributes } from '@/lib/graph/types'

const RELATIONSHIP_COLORS: Record<RelationshipType, string> = {
  symbolizes: 'rgba(74,124,111,0.28)',
  appears_in: 'rgba(245,240,232,0.12)',
  belongs_to: 'rgba(138,90,154,0.24)',
  parallels: 'rgba(107,95,160,0.28)',
  instantiates: 'rgba(139,115,85,0.24)',
  supports: 'rgba(160,82,45,0.24)',
}

export const weightToSize = (weight: number): number => {
  const normalizedWeight = Math.min(Math.max(weight, 0), 1)
  return 0.3 + normalizedWeight * 1.2
}

export const relationshipTypeToColor = (type: RelationshipType): string => RELATIONSHIP_COLORS[type]

export const relationshipTypeToDashed = (type: RelationshipType): boolean => type === 'parallels'

interface EdgeReducerOptions {
  focusedEdgeIds: Set<string>
  hasFocusedNode: boolean
}

export const createEdgeReducer =
  ({ focusedEdgeIds, hasFocusedNode }: EdgeReducerOptions) =>
  (edge: string, data: GraphEdgeAttributes): Partial<EdgeDisplayData> => {
    const focused = !hasFocusedNode || focusedEdgeIds.has(edge)
    const color = focused
      ? relationshipTypeToColor(data.relationshipType)
      : 'rgba(255,255,255,0.05)'

    return {
      color,
      hidden: data.hidden ?? false,
      label: data.label,
      size: focused ? weightToSize(data.weight) : 0.3,
      type: focused && relationshipTypeToDashed(data.relationshipType) ? 'dashed' : 'line',
    }
  }

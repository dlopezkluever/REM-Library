import { MultiDirectedGraph } from 'graphology'
import type { EntityRow } from '@/lib/api/entities'
import type { RelationshipRow } from '@/lib/api/relationships'
import type { GraphAttributes, GraphEdgeAttributes, GraphNodeAttributes } from '@/lib/graph/types'
import { formatEnumLabel } from '@/lib/format'

export type MythographGraph = MultiDirectedGraph<
  GraphNodeAttributes,
  GraphEdgeAttributes,
  GraphAttributes
>

const fallbackPositionForIndex = (index: number, total: number) => {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2
  const radius = 1 + (index % 5) * 0.18

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

const relationshipLabel = (type: string) => formatEnumLabel(type).toUpperCase()

export const buildGraphology = (
  entities: EntityRow[],
  relationships: RelationshipRow[]
): MythographGraph => {
  const graph = new MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes, GraphAttributes>({
    multi: true,
    type: 'directed',
  })

  graph.setAttribute('generatedAt', new Date().toISOString())

  entities.forEach((entity, index) => {
    const fallbackPosition = fallbackPositionForIndex(index, entities.length)

    graph.addNode(entity.id, {
      confidence: entity.confidence_override ?? entity.confidence_score,
      description: entity.description,
      entityType: entity.type,
      label: entity.name,
      persistedPosition: entity.position_x !== null && entity.position_y !== null,
      slug: entity.slug,
      x: entity.position_x ?? fallbackPosition.x,
      y: entity.position_y ?? fallbackPosition.y,
    })
  })

  relationships.forEach((relationship) => {
    if (!graph.hasNode(relationship.from_entity_id) || !graph.hasNode(relationship.to_entity_id)) {
      return
    }

    graph.addDirectedEdgeWithKey(
      relationship.id,
      relationship.from_entity_id,
      relationship.to_entity_id,
      {
        label: relationshipLabel(relationship.type),
        relationshipType: relationship.type,
        weight: relationship.weight,
      }
    )
  })

  return graph
}

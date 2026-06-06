import { ENTITY_COLORS } from '@/constants/entityTypes'
import type { MythographGraph } from '@/lib/graph/buildGraphology'
import { relationshipTypeToColor } from '@/lib/graph/edgeReducers'
import { computeHiddenNodeIds } from '@/lib/graph/graphFilters'
import type { GraphFilterState } from '@/stores/graphStore'
import type { EntityType, RelationshipType } from '@/types/domain'

export const GRAPH_3D_NODE_CAP = 2000

export interface Graph3DNode {
  id: string
  name: string
  type: EntityType
  confidence: number
  color: string
  val: number
  x?: number
  y?: number
  z?: number
}

export interface Graph3DLink {
  source: string
  target: string
  color: string
  relationshipType: RelationshipType
}

export interface Graph3DData {
  nodes: Graph3DNode[]
  links: Graph3DLink[]
  visibleNodeCount: number
  capped: boolean
}

export const confidenceToVal = (confidence: number): number => {
  const normalized = Math.min(Math.max(confidence, 0), 1)
  return 1 + normalized * 7
}

export const buildGraph3DData = (
  graph: MythographGraph,
  filterState: GraphFilterState,
  nodeCap: number = GRAPH_3D_NODE_CAP
): Graph3DData => {
  const hiddenNodeIds = computeHiddenNodeIds(graph, filterState)

  interface Candidate {
    id: string
    name: string
    type: EntityType
    confidence: number
  }

  const visible: Candidate[] = []
  graph.forEachNode((node, attributes) => {
    if (hiddenNodeIds.has(node)) {
      return
    }

    visible.push({
      confidence: attributes.confidence,
      id: node,
      name: attributes.label,
      type: attributes.entityType,
    })
  })

  const visibleNodeCount = visible.length
  const capped = visibleNodeCount > nodeCap
  const selected = capped
    ? [...visible]
        .sort((first, second) =>
          second.confidence === first.confidence
            ? first.id.localeCompare(second.id)
            : second.confidence - first.confidence
        )
        .slice(0, nodeCap)
    : visible

  const selectedIds = new Set(selected.map((candidate) => candidate.id))

  const nodes: Graph3DNode[] = selected.map((candidate) => ({
    color: ENTITY_COLORS[candidate.type].node,
    confidence: candidate.confidence,
    id: candidate.id,
    name: candidate.name,
    type: candidate.type,
    val: confidenceToVal(candidate.confidence),
  }))

  const links: Graph3DLink[] = []
  graph.forEachEdge((_, attributes, source, target) => {
    if (!selectedIds.has(source) || !selectedIds.has(target)) {
      return
    }

    links.push({
      color: relationshipTypeToColor(attributes.relationshipType),
      relationshipType: attributes.relationshipType,
      source,
      target,
    })
  })

  return { capped, links, nodes, visibleNodeCount }
}

export const buildNeighborMap = (links: Graph3DLink[]): Map<string, Set<string>> => {
  const neighborMap = new Map<string, Set<string>>()

  const connect = (from: string, to: string) => {
    const neighbors = neighborMap.get(from) ?? new Set<string>()
    neighbors.add(to)
    neighborMap.set(from, neighbors)
  }

  links.forEach((link) => {
    connect(link.source, link.target)
    connect(link.target, link.source)
  })

  return neighborMap
}

export const dimNodeColor = (hex: string): string => {
  const normalizedHex = hex.replace('#', '')

  if (normalizedHex.length !== 6) {
    return hex
  }

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16)
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16)
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16)

  const keep = 0.22
  const floor = 12
  const blend = (channel: number) => Math.round(channel * keep + floor * (1 - keep))
  const toHex = (channel: number) => blend(channel).toString(16).padStart(2, '0')

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

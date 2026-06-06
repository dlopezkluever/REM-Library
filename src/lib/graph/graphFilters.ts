import type { MythographGraph } from '@/lib/graph/buildGraphology'
import type { GraphFilterState } from '@/stores/graphStore'

export const getCultureScopedNodeIds = (
  graph: MythographGraph,
  cultureIds: string[]
): Set<string> => {
  const scopedNodeIds = new Set<string>(cultureIds)

  if (cultureIds.length === 0) {
    return scopedNodeIds
  }

  graph.forEachEdge((_, attributes, source, target) => {
    if (attributes.relationshipType !== 'belongs_to') {
      return
    }

    if (cultureIds.includes(target)) {
      scopedNodeIds.add(source)
      scopedNodeIds.add(target)
    }
  })

  return scopedNodeIds
}

export const computeHiddenNodeIds = (
  graph: MythographGraph,
  filterState: GraphFilterState
): Set<string> => {
  const cultureScopedNodeIds = getCultureScopedNodeIds(graph, filterState.cultureIds)
  const hiddenNodeIds = new Set<string>()

  graph.forEachNode((node, attributes) => {
    const passesType = filterState.entityTypes[attributes.entityType]
    const passesConfidence = attributes.confidence >= filterState.confidenceThreshold
    const passesCulture =
      filterState.cultureIds.length === 0 ||
      cultureScopedNodeIds.has(node) ||
      filterState.cultureIds.includes(node)

    if (!passesType || !passesConfidence || !passesCulture) {
      hiddenNodeIds.add(node)
    }
  })

  return hiddenNodeIds
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Sigma from 'sigma'
import { createNodeCompoundProgram, NodeCircleProgram } from 'sigma/rendering'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { Button } from '@/components/ui/button'
import { getPublishedEntities, persistEntityPositions } from '@/lib/api/entities'
import { getAllPublishedRelationships } from '@/lib/api/relationships'
import { buildGraphology, type MythographGraph } from '@/lib/graph/buildGraphology'
import { createEdgeReducer } from '@/lib/graph/edgeReducers'
import { GlowNodeProgram } from '@/lib/graph/GlowNodeProgram'
import { createNodeReducer } from '@/lib/graph/nodeReducers'
import type {
  EntityPositionUpdate,
  GraphAttributes,
  GraphEdgeAttributes,
  GraphNodeAttributes,
} from '@/lib/graph/types'
import { useGraphStore } from '@/stores/graphStore'
import type { EntityType } from '@/types/domain'

interface GraphCanvasProps {
  focusedNodeId: string | null
  onFocusBlocked: (nodeId: string, reason: GraphFocusBlockReason) => void
  onFocusedNodeSettled: (nodeId: string) => void
}

export type GraphFocusBlockReason = 'hidden' | 'missing'

const getCultureScopedNodeIds = (graph: MythographGraph, cultureIds: string[]) => {
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

const applyFiltersToGraph = (graph: MythographGraph) => {
  const filterState = useGraphStore.getState().filterState
  const cultureScopedNodeIds = getCultureScopedNodeIds(graph, filterState.cultureIds)
  const hiddenNodeIds = new Set<string>()

  graph.forEachNode((node, attributes) => {
    const passesType = filterState.entityTypes[attributes.entityType]
    const passesConfidence = attributes.confidence >= filterState.confidenceThreshold
    const passesCulture =
      filterState.cultureIds.length === 0 ||
      cultureScopedNodeIds.has(node) ||
      filterState.cultureIds.includes(node)
    const hidden = !passesType || !passesConfidence || !passesCulture

    graph.setNodeAttribute(node, 'hidden', hidden)

    if (hidden) {
      hiddenNodeIds.add(node)
    }
  })

  graph.forEachEdge((edge, _, source, target) => {
    graph.setEdgeAttribute(edge, 'hidden', hiddenNodeIds.has(source) || hiddenNodeIds.has(target))
  })

  return graph.order - hiddenNodeIds.size
}

const collectFocusSets = (graph: MythographGraph, focusedNodeId: string | null) => {
  const highlightedNodeIds = new Set<string>()
  const focusedEdgeIds = new Set<string>()

  if (!focusedNodeId || !graph.hasNode(focusedNodeId)) {
    return { focusedEdgeIds, highlightedNodeIds }
  }

  graph.neighbors(focusedNodeId).forEach((neighbor) => highlightedNodeIds.add(neighbor))

  graph.forEachEdge((edge, _, source, target) => {
    if (source === focusedNodeId || target === focusedNodeId) {
      focusedEdgeIds.add(edge)
    }
  })

  return { focusedEdgeIds, highlightedNodeIds }
}

export const GraphCanvas = ({
  focusedNodeId,
  onFocusBlocked,
  onFocusedNodeSettled,
}: GraphCanvasProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<MythographGraph | null>(null)
  const sigmaRef = useRef<Sigma<GraphNodeAttributes, GraphEdgeAttributes, GraphAttributes> | null>(
    null
  )
  const allLabelsVisibleRef = useRef(false)
  const [visibleNodeCount, setVisibleNodeCount] = useState(0)

  const filterState = useGraphStore((state) => state.filterState)
  const hoveredNodeId = useGraphStore((state) => state.hoveredNodeId)
  const activeNodeId = useGraphStore((state) => state.activeNodeId)
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId)
  const setActiveNodeId = useGraphStore((state) => state.setActiveNodeId)
  const clearInteraction = useGraphStore((state) => state.clearInteraction)

  const entitiesQuery = useQuery({
    queryKey: ['entities', 'published'],
    queryFn: () => getPublishedEntities(),
    staleTime: 60_000,
  })

  const relationshipsQuery = useQuery({
    queryKey: ['relationships', 'published'],
    queryFn: getAllPublishedRelationships,
    staleTime: 60_000,
  })

  const graph = useMemo(() => {
    if (!entitiesQuery.data || !relationshipsQuery.data) {
      return null
    }

    const nextGraph = buildGraphology(entitiesQuery.data, relationshipsQuery.data)
    const needsLayout = entitiesQuery.data.some(
      (entity) => entity.position_x === null || entity.position_y === null
    )

    if (needsLayout && nextGraph.order > 1) {
      forceAtlas2.assign(nextGraph, {
        getEdgeWeight: 'weight',
        iterations: 100,
        settings: forceAtlas2.inferSettings(nextGraph),
      })

      const positions: EntityPositionUpdate[] = []
      nextGraph.forEachNode((node, attributes) => {
        positions.push({
          id: node,
          position_x: attributes.x,
          position_y: attributes.y,
        })
      })
      void persistEntityPositions(positions).catch(() => undefined)
    }

    return nextGraph
  }, [entitiesQuery.data, relationshipsQuery.data])

  useEffect(() => {
    if (!graph || !containerRef.current) {
      return undefined
    }

    graphRef.current = graph
    setVisibleNodeCount(applyFiltersToGraph(graph))

    const focusNodeId =
      useGraphStore.getState().hoveredNodeId ?? useGraphStore.getState().activeNodeId
    const { focusedEdgeIds, highlightedNodeIds } = collectFocusSets(graph, focusNodeId)
    const GlowProgram = createNodeCompoundProgram<
      GraphNodeAttributes,
      GraphEdgeAttributes,
      GraphAttributes
    >([GlowNodeProgram, NodeCircleProgram])

    const renderer = new Sigma<GraphNodeAttributes, GraphEdgeAttributes, GraphAttributes>(
      graph,
      containerRef.current,
      {
        allowInvalidContainer: true,
        defaultDrawNodeLabel: (context, data) => {
          if (!data.label) {
            return
          }

          context.font = `${Math.max(6, data.size * 0.42)}px Cinzel, Georgia, serif`
          context.fillStyle = 'rgba(255,255,255,0.82)'
          context.fillText(data.label, data.x + data.size + 3, data.y + data.size / 3)
        },
        defaultNodeColor: '#4A7C6F',
        edgeReducer: createEdgeReducer({
          focusedEdgeIds,
          hasFocusedNode: focusNodeId !== null,
        }),
        labelColor: { color: 'rgba(255,255,255,0.82)' },
        labelFont: 'Cinzel, Georgia, serif',
        labelRenderedSizeThreshold: 9,
        labelSize: 9,
        nodeProgramClasses: {
          glow: GlowProgram,
        },
        nodeReducer: createNodeReducer({
          activeNodeId: useGraphStore.getState().activeNodeId,
          allLabelsVisible: () => allLabelsVisibleRef.current,
          highlightedNodeIds,
          hoveredNodeId: useGraphStore.getState().hoveredNodeId,
        }),
        renderEdgeLabels: false,
        zIndex: true,
      }
    )

    sigmaRef.current = renderer

    renderer.on('enterNode', ({ node }) => setHoveredNodeId(node))
    renderer.on('leaveNode', () => setHoveredNodeId(null))
    renderer.on('clickNode', ({ node }) => setActiveNodeId(node))
    renderer.on('clickStage', () => clearInteraction())
    renderer.on('afterRender', () => {
      const zoomedIn = renderer.getCamera().getState().ratio < 0.5

      if (zoomedIn !== allLabelsVisibleRef.current) {
        allLabelsVisibleRef.current = zoomedIn
        renderer.refresh({ schedule: true })
      }
    })

    return () => {
      renderer.kill()
      sigmaRef.current = null
      graphRef.current = null
    }
  }, [clearInteraction, graph, setActiveNodeId, setHoveredNodeId])

  useEffect(() => {
    const currentGraph = graphRef.current
    const renderer = sigmaRef.current

    if (!currentGraph || !renderer) {
      return
    }

    const nextVisibleNodeCount = applyFiltersToGraph(currentGraph)
    setVisibleNodeCount(nextVisibleNodeCount)

    if (activeNodeId && currentGraph.hasNode(activeNodeId)) {
      const activeAttributes = currentGraph.getNodeAttributes(activeNodeId)

      if (activeAttributes.hidden) {
        setActiveNodeId(null)
      }
    }

    renderer.refresh()
  }, [activeNodeId, filterState, setActiveNodeId])

  useEffect(() => {
    const currentGraph = graphRef.current
    const renderer = sigmaRef.current

    if (!currentGraph || !renderer) {
      return
    }

    const focusNodeId = hoveredNodeId ?? activeNodeId
    const { focusedEdgeIds, highlightedNodeIds } = collectFocusSets(currentGraph, focusNodeId)

    renderer.setSettings({
      edgeReducer: createEdgeReducer({
        focusedEdgeIds,
        hasFocusedNode: focusNodeId !== null,
      }),
      nodeReducer: createNodeReducer({
        activeNodeId,
        allLabelsVisible: () => allLabelsVisibleRef.current,
        highlightedNodeIds,
        hoveredNodeId,
      }),
    })
    renderer.refresh({ schedule: true })
  }, [activeNodeId, hoveredNodeId])

  useEffect(() => {
    const currentGraph = graphRef.current
    const renderer = sigmaRef.current

    if (!focusedNodeId) {
      return
    }

    if (!currentGraph || !renderer) {
      return
    }

    if (!currentGraph.hasNode(focusedNodeId)) {
      onFocusBlocked(focusedNodeId, 'missing')
      return
    }

    const attributes = currentGraph.getNodeAttributes(focusedNodeId)

    if (attributes.hidden) {
      onFocusBlocked(focusedNodeId, 'hidden')
      return
    }

    void renderer
      .getCamera()
      .animate(
        {
          ratio: 0.5,
          x: attributes.x,
          y: attributes.y,
        },
        { duration: 400, easing: 'cubicInOut' }
      )
      .then(() => onFocusedNodeSettled(focusedNodeId))
  }, [filterState, focusedNodeId, graph, onFocusBlocked, onFocusedNodeSettled])

  if (entitiesQuery.isError || relationshipsQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <p className="font-body text-sm text-white/50">Could not load the knowledge graph.</p>
          <Button
            className="border-white/15 bg-transparent text-white hover:bg-white/10"
            type="button"
            variant="outline"
            onClick={() => {
              void entitiesQuery.refetch()
              void relationshipsQuery.refetch()
            }}
          >
            Refresh
          </Button>
        </div>
      </div>
    )
  }

  const loading = entitiesQuery.isLoading || relationshipsQuery.isLoading
  const empty = !loading && entitiesQuery.data?.length === 0
  const filteredEmpty = !loading && !empty && visibleNodeCount === 0

  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <div ref={containerRef} className="h-full w-full" />

      {loading || empty || filteredEmpty ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <div className="max-w-sm px-6 text-center">
            <div className="mx-auto mb-4 h-28 w-44 opacity-30">
              <div className="relative h-full w-full">
                {(['symbol', 'figure', 'narrative', 'culture', 'trope'] as EntityType[]).map(
                  (type, index) => (
                    <span
                      key={type}
                      className="absolute rounded-full border-0.5 border-white/20"
                      style={{
                        height: 24 + index * 5,
                        left: `${10 + index * 18}%`,
                        top: `${15 + ((index * 17) % 54)}%`,
                        width: 24 + index * 5,
                      }}
                    />
                  )
                )}
              </div>
            </div>
            <p className="font-display text-[10px] uppercase tracking-label text-white/45">
              {loading
                ? 'Loading graph'
                : filteredEmpty
                  ? 'No nodes match the active filters'
                  : 'The knowledge graph is being built'}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

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
import { computeHiddenNodeIds } from '@/lib/graph/graphFilters'
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
  // When set (guided explorations), these nodes are highlighted and every
  // other node is dimmed. Filters are bypassed so the tour can reference any
  // published entity regardless of the viewer's saved graph filters.
  highlightNodeIds?: readonly string[] | null
}

export type GraphFocusBlockReason = 'hidden' | 'missing' | 'capped'

const applyFiltersToGraph = (graph: MythographGraph, bypassFilters: boolean) => {
  if (bypassFilters) {
    graph.forEachNode((node) => graph.setNodeAttribute(node, 'hidden', false))
    graph.forEachEdge((edge) => graph.setEdgeAttribute(edge, 'hidden', false))

    return graph.order
  }

  const filterState = useGraphStore.getState().filterState
  const hiddenNodeIds = computeHiddenNodeIds(graph, filterState)

  graph.forEachNode((node) => {
    graph.setNodeAttribute(node, 'hidden', hiddenNodeIds.has(node))
  })

  graph.forEachEdge((edge, _, source, target) => {
    graph.setEdgeAttribute(edge, 'hidden', hiddenNodeIds.has(source) || hiddenNodeIds.has(target))
  })

  return graph.order - hiddenNodeIds.size
}

const collectExplorationFocusEdges = (graph: MythographGraph, focusNodeIds: Set<string>) => {
  const focusedEdgeIds = new Set<string>()

  graph.forEachEdge((edge, _, source, target) => {
    if (focusNodeIds.has(source) && focusNodeIds.has(target)) {
      focusedEdgeIds.add(edge)
    }
  })

  return focusedEdgeIds
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
  highlightNodeIds = null,
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

  const explorationFocusIds = useMemo(
    () => (highlightNodeIds ? new Set(highlightNodeIds) : null),
    [highlightNodeIds]
  )
  const explorationActive = explorationFocusIds !== null
  // The renderer is created once; the creation effect reads the latest
  // exploration focus through this ref so step changes never re-instantiate
  // Sigma (which would reset the tour camera).
  const explorationFocusIdsRef = useRef(explorationFocusIds)

  useEffect(() => {
    explorationFocusIdsRef.current = explorationFocusIds
  }, [explorationFocusIds])

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
    const explorationFocus = explorationFocusIdsRef.current
    const explorationOn = explorationFocus !== null
    setVisibleNodeCount(applyFiltersToGraph(graph, explorationOn))

    const focusNodeId = explorationOn
      ? null
      : (useGraphStore.getState().hoveredNodeId ?? useGraphStore.getState().activeNodeId)
    const { focusedEdgeIds, highlightedNodeIds } = explorationFocus
      ? {
          focusedEdgeIds: collectExplorationFocusEdges(graph, explorationFocus),
          highlightedNodeIds: explorationFocus,
        }
      : collectFocusSets(graph, focusNodeId)
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
          hasFocusedNode: explorationOn || focusNodeId !== null,
        }),
        labelColor: { color: 'rgba(255,255,255,0.82)' },
        labelFont: 'Cinzel, Georgia, serif',
        labelRenderedSizeThreshold: 9,
        labelSize: 9,
        nodeProgramClasses: {
          glow: GlowProgram,
        },
        nodeReducer: createNodeReducer({
          activeNodeId: explorationOn ? null : useGraphStore.getState().activeNodeId,
          allLabelsVisible: () => allLabelsVisibleRef.current,
          focusNodeIds: explorationFocus,
          highlightedNodeIds,
          hoveredNodeId: explorationOn ? null : useGraphStore.getState().hoveredNodeId,
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

    const nextVisibleNodeCount = applyFiltersToGraph(currentGraph, explorationActive)
    setVisibleNodeCount(nextVisibleNodeCount)

    if (!explorationActive && activeNodeId && currentGraph.hasNode(activeNodeId)) {
      const activeAttributes = currentGraph.getNodeAttributes(activeNodeId)

      if (activeAttributes.hidden) {
        setActiveNodeId(null)
      }
    }

    renderer.refresh()
  }, [activeNodeId, explorationActive, filterState, setActiveNodeId])

  useEffect(() => {
    const currentGraph = graphRef.current
    const renderer = sigmaRef.current

    if (!currentGraph || !renderer) {
      return
    }

    if (explorationFocusIds) {
      renderer.setSettings({
        edgeReducer: createEdgeReducer({
          focusedEdgeIds: collectExplorationFocusEdges(currentGraph, explorationFocusIds),
          hasFocusedNode: true,
        }),
        nodeReducer: createNodeReducer({
          activeNodeId: null,
          allLabelsVisible: () => allLabelsVisibleRef.current,
          focusNodeIds: explorationFocusIds,
          highlightedNodeIds: explorationFocusIds,
          hoveredNodeId: null,
        }),
      })
      renderer.refresh({ schedule: true })

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
  }, [activeNodeId, explorationFocusIds, hoveredNodeId])

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

  // Guided explorations: pan/zoom the camera to frame the current step's
  // focus nodes whenever the highlighted set changes.
  useEffect(() => {
    const currentGraph = graphRef.current
    const renderer = sigmaRef.current

    if (!explorationFocusIds || explorationFocusIds.size === 0 || !currentGraph || !renderer) {
      return
    }

    const xs: number[] = []
    const ys: number[] = []

    explorationFocusIds.forEach((nodeId) => {
      if (currentGraph.hasNode(nodeId)) {
        const attributes = currentGraph.getNodeAttributes(nodeId)
        xs.push(attributes.x)
        ys.push(attributes.y)
      }
    })

    if (xs.length === 0) {
      return
    }

    const centerX = xs.reduce((sum, value) => sum + value, 0) / xs.length
    const centerY = ys.reduce((sum, value) => sum + value, 0) / ys.length

    void renderer.getCamera().animate(
      {
        ratio: xs.length === 1 ? 0.5 : 0.75,
        x: centerX,
        y: centerY,
      },
      { duration: 600, easing: 'cubicInOut' }
    )
  }, [explorationFocusIds, graph])

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

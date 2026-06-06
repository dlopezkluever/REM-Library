import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import ForceGraph3D, { type ForceGraph3DInstance } from '3d-force-graph'
import type { GraphFocusBlockReason } from '@/components/graph/GraphCanvas'
import { Button } from '@/components/ui/button'
import { getPublishedEntities } from '@/lib/api/entities'
import { getAllPublishedRelationships } from '@/lib/api/relationships'
import { buildGraphology } from '@/lib/graph/buildGraphology'
import {
  buildGraph3DData,
  buildNeighborMap,
  dimNodeColor,
  GRAPH_3D_NODE_CAP,
  type Graph3DLink,
  type Graph3DNode,
} from '@/lib/graph/graph3dData'
import { useGraphStore } from '@/stores/graphStore'

interface GraphCanvas3DProps {
  focusedNodeId: string | null
  onFocusBlocked: (nodeId: string, reason: GraphFocusBlockReason) => void
  onFocusedNodeSettled: (nodeId: string) => void
}

const CANVAS_BACKGROUND = '#0C0A08'
const FOCUS_DISTANCE = 180

// 3d-force-graph exposes only the default-parameterised constructor type, so we
// re-type it once here to flow our concrete node/link shapes through the chainable API.
const ForceGraph3DConstructor = ForceGraph3D as unknown as new (
  element: HTMLElement
) => ForceGraph3DInstance<Graph3DNode, Graph3DLink>

export const GraphCanvas3D = ({
  focusedNodeId,
  onFocusBlocked,
  onFocusedNodeSettled,
}: GraphCanvas3DProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<ForceGraph3DInstance<Graph3DNode, Graph3DLink> | null>(null)
  const nodeByIdRef = useRef<Map<string, Graph3DNode>>(new Map())
  const neighborsRef = useRef<Map<string, Set<string>>>(new Map())
  const hoveredRef = useRef<string | null>(null)
  const pendingFocusRef = useRef<string | null>(null)

  const filterState = useGraphStore((state) => state.filterState)
  const activeNodeId = useGraphStore((state) => state.activeNodeId)
  const setActiveNodeId = useGraphStore((state) => state.setActiveNodeId)
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId)
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

    return buildGraphology(entitiesQuery.data, relationshipsQuery.data)
  }, [entitiesQuery.data, relationshipsQuery.data])

  const graphData = useMemo(
    () => (graph ? buildGraph3DData(graph, filterState) : null),
    [graph, filterState]
  )

  const colorForNode = useCallback((node: Graph3DNode) => {
    const focusId = hoveredRef.current ?? useGraphStore.getState().activeNodeId

    if (!focusId || node.id === focusId || neighborsRef.current.get(focusId)?.has(node.id)) {
      return node.color
    }

    return dimNodeColor(node.color)
  }, [])

  const focusPendingNode = useCallback(() => {
    const instance = graphRef.current
    const nodeId = pendingFocusRef.current

    if (!instance || !nodeId) {
      return
    }

    const node = nodeByIdRef.current.get(nodeId)

    if (!node || node.x === undefined || node.y === undefined || node.z === undefined) {
      return
    }

    const hypotenuse = Math.hypot(node.x, node.y, node.z) || 1
    const ratio = 1 + FOCUS_DISTANCE / hypotenuse

    instance.cameraPosition(
      { x: node.x * ratio, y: node.y * ratio, z: node.z * ratio },
      { x: node.x, y: node.y, z: node.z },
      1200
    )

    pendingFocusRef.current = null
    onFocusedNodeSettled(nodeId)
  }, [onFocusedNodeSettled])

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return undefined
    }

    const instance = new ForceGraph3DConstructor(container)
    graphRef.current = instance

    instance
      .backgroundColor(CANVAS_BACKGROUND)
      .showNavInfo(false)
      .nodeRelSize(4)
      .nodeResolution(8)
      .nodeOpacity(0.92)
      .nodeLabel((node) => node.name)
      .nodeVal((node) => node.val)
      .nodeColor(colorForNode)
      .linkColor((link) => link.color)
      .linkOpacity(0.45)
      .linkWidth(0.6)
      .cooldownTicks(120)
      .onNodeClick((node) => setActiveNodeId(node.id))
      .onNodeHover((node) => {
        hoveredRef.current = node?.id ?? null
        setHoveredNodeId(node?.id ?? null)
        instance.nodeColor(colorForNode)
        container.style.cursor = node ? 'pointer' : 'default'
      })
      .onBackgroundClick(() => clearInteraction())
      .onEngineStop(() => focusPendingNode())

    const syncSize = () => {
      instance.width(container.clientWidth).height(container.clientHeight)
    }

    syncSize()
    const resizeObserver = new ResizeObserver(syncSize)
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      instance._destructor()
      graphRef.current = null
    }
  }, [clearInteraction, colorForNode, focusPendingNode, setActiveNodeId, setHoveredNodeId])

  useEffect(() => {
    const instance = graphRef.current

    if (!instance || !graphData) {
      return
    }

    nodeByIdRef.current = new Map(graphData.nodes.map((node) => [node.id, node]))
    neighborsRef.current = buildNeighborMap(graphData.links)
    instance.graphData({ links: graphData.links, nodes: graphData.nodes })
  }, [graphData])

  useEffect(() => {
    graphRef.current?.nodeColor(colorForNode)
  }, [activeNodeId, colorForNode])

  useEffect(() => {
    if (!focusedNodeId || !graph || !graphRef.current) {
      return
    }

    if (!graph.hasNode(focusedNodeId)) {
      onFocusBlocked(focusedNodeId, 'missing')
      return
    }

    if (!nodeByIdRef.current.has(focusedNodeId)) {
      onFocusBlocked(focusedNodeId, 'hidden')
      return
    }

    pendingFocusRef.current = focusedNodeId
    focusPendingNode()
  }, [focusPendingNode, focusedNodeId, graph, graphData, onFocusBlocked])

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
  const filteredEmpty = !loading && graphData !== null && graphData.nodes.length === 0

  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <div ref={containerRef} className="h-full w-full" />

      {loading || filteredEmpty ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <p className="font-display text-[10px] uppercase tracking-label text-white/45">
            {loading ? 'Loading 3D graph' : 'No nodes match the active filters'}
          </p>
        </div>
      ) : null}

      {graphData?.capped ? (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 w-[min(calc(100vw-2rem),440px)] -translate-x-1/2 rounded border-0.5 border-white/10 bg-charcoal/90 px-4 py-3 text-center font-body text-[12px] text-white/70 backdrop-blur-md">
          3D view shows the top {GRAPH_3D_NODE_CAP.toLocaleString()} nodes by confidence. Use filters
          to explore a subset.
        </div>
      ) : null}
    </div>
  )
}

import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Sigma from 'sigma'
import { createNodeCompoundProgram, NodeCircleProgram } from 'sigma/rendering'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { getEntityNeighborhood } from '@/lib/api/entities'
import { buildGraphology } from '@/lib/graph/buildGraphology'
import { GlowNodeProgram } from '@/lib/graph/GlowNodeProgram'
import { confidenceToRadius, entityTypeToColor, hexToRgba } from '@/lib/graph/nodeReducers'
import type { GraphAttributes, GraphEdgeAttributes, GraphNodeAttributes } from '@/lib/graph/types'

interface MiniGraphProps {
  entityId: string
}

export const MiniGraph = ({ entityId }: MiniGraphProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  const neighborhoodQuery = useQuery({
    queryKey: ['entity', entityId, 'mini-graph'],
    queryFn: () => getEntityNeighborhood(entityId, 1),
    staleTime: 60_000,
  })

  const graph = useMemo(() => {
    if (!neighborhoodQuery.data) {
      return null
    }

    const nextGraph = buildGraphology(
      neighborhoodQuery.data.entities,
      neighborhoodQuery.data.relationships
    )

    if (nextGraph.order > 1) {
      forceAtlas2.assign(nextGraph, {
        getEdgeWeight: 'weight',
        iterations: 50,
        settings: forceAtlas2.inferSettings(nextGraph),
      })
    }

    return nextGraph
  }, [neighborhoodQuery.data])

  useEffect(() => {
    if (!graph || !containerRef.current) {
      return undefined
    }

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
        defaultEdgeColor: 'rgba(15,13,11,0.16)',
        defaultNodeColor: '#4A7C6F',
        edgeReducer: () => ({ size: 0.6 }),
        labelColor: { color: '#1C1917' },
        labelFont: 'Cinzel, Georgia, serif',
        labelRenderedSizeThreshold: 0,
        labelSize: 7,
        nodeProgramClasses: {
          glow: GlowProgram,
        },
        nodeReducer: (node, data) => {
          const focused = node === entityId
          const baseSize = confidenceToRadius(data.confidence)

          return {
            color: hexToRgba(entityTypeToColor(data.entityType), focused ? 0.95 : 0.72),
            forceLabel: focused,
            highlighted: focused,
            label: focused ? data.label : null,
            size: focused ? Math.max(7, baseSize * 0.42) : Math.max(4, baseSize * 0.25),
            type: 'glow',
          }
        },
        renderEdgeLabels: false,
        zIndex: true,
      }
    )

    renderer.on('clickNode', ({ node }) => {
      const attributes = graph.getNodeAttributes(node)

      if (attributes.slug) {
        navigate(`/entity/${attributes.slug}`)
      }
    })

    return () => renderer.kill()
  }, [entityId, graph, navigate])

  if (neighborhoodQuery.isLoading) {
    return <div className="h-[174px] w-[174px] rounded-lg border-0.5 border-black/10 bg-white" />
  }

  if (neighborhoodQuery.isError || !graph || graph.order === 0) {
    return (
      <div className="flex h-[174px] w-[174px] items-center justify-center rounded-lg border-0.5 border-black/10 bg-white px-4 text-center font-body text-[11px] text-[#777]">
        Mini graph unavailable.
      </div>
    )
  }

  return (
    <div className="rounded-lg border-0.5 border-black/10 bg-white p-2">
      <div ref={containerRef} className="h-[158px] w-[158px]" />
    </div>
  )
}

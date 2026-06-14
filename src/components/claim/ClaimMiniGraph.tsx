import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import Sigma from 'sigma'
import { createNodeCompoundProgram, NodeCircleProgram } from 'sigma/rendering'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import { buildGraphology } from '@/lib/graph/buildGraphology'
import { GlowNodeProgram } from '@/lib/graph/GlowNodeProgram'
import { getClaimGraph } from '@/lib/api/claims'
import { confidenceToRadius, entityTypeToColor, hexToRgba } from '@/lib/graph/nodeReducers'
import type { GraphAttributes, GraphEdgeAttributes, GraphNodeAttributes } from '@/lib/graph/types'

interface ClaimMiniGraphProps {
  claimId: string
}

export const ClaimMiniGraph = ({ claimId }: ClaimMiniGraphProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const graphQuery = useQuery({
    queryKey: ['claim', claimId, 'mini-graph'],
    queryFn: () => getClaimGraph(claimId),
    staleTime: 60_000,
  })

  const graph = useMemo(() => {
    if (!graphQuery.data) {
      return null
    }

    const nextGraph = buildGraphology(graphQuery.data.entities, graphQuery.data.relationships)

    if (nextGraph.order > 1) {
      forceAtlas2.assign(nextGraph, {
        getEdgeWeight: 'weight',
        iterations: 80,
        settings: forceAtlas2.inferSettings(nextGraph),
      })
    }

    return nextGraph
  }, [graphQuery.data])

  const directEntityIds = useMemo(
    () => new Set((graphQuery.data?.entities ?? []).filter((entity) => entity.isDirect).map((entity) => entity.id)),
    [graphQuery.data?.entities]
  )
  const shouldCollapse =
    graphQuery.data !== undefined && graphQuery.data.directEntityCount > 10 && !expanded

  useEffect(() => {
    if (!graph || !containerRef.current || shouldCollapse) {
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
        edgeLabelColor: { color: '#57534E' },
        edgeReducer: (_edge, data) => ({
          label: graph.order <= 15 ? data.label : null,
          size: Math.max(0.5, data.weight * 1.4),
        }),
        labelColor: { color: '#1C1917' },
        labelFont: 'Cinzel, Georgia, serif',
        labelRenderedSizeThreshold: 0,
        labelSize: 8,
        nodeProgramClasses: {
          glow: GlowProgram,
        },
        nodeReducer: (node, data) => {
          const direct = directEntityIds.has(node)
          const baseSize = confidenceToRadius(data.confidence)

          return {
            color: hexToRgba(entityTypeToColor(data.entityType), direct ? 0.95 : 0.42),
            forceLabel: direct,
            highlighted: direct,
            label: direct ? data.label : null,
            size: direct ? Math.max(8, baseSize * 0.45) : Math.max(4, baseSize * 0.24),
            type: 'glow',
            x: data.x,
            y: data.y,
          }
        },
        renderEdgeLabels: graph.order <= 15,
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
  }, [directEntityIds, graph, navigate, shouldCollapse])

  if (graphQuery.isLoading) {
    return (
      <section className="border-t-0.5 border-black/10 py-6">
        <div className="h-[300px] rounded border-0.5 border-black/10 bg-white" />
      </section>
    )
  }

  if (graphQuery.isError || !graphQuery.data || !graph || graph.order === 0) {
    return null
  }

  return (
    <section className="border-t-0.5 border-black/10 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[11px] uppercase tracking-label text-ink">
            Claim Graph
          </h2>
          {graphQuery.data.truncatedDirectEntityCount > 0 ? (
            <p className="mt-1 font-body text-xs text-[#777]">
              Showing 10 of {graphQuery.data.directEntityCount} direct entities.
            </p>
          ) : null}
        </div>
        {graphQuery.data.directEntityCount > 10 ? (
          <button
            className="font-body text-xs text-verdigris hover:text-verdigris-dark"
            type="button"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Collapse graph' : 'Show graph'}
          </button>
        ) : null}
      </div>
      {shouldCollapse ? null : (
        <div className="overflow-hidden rounded border-0.5 border-black/10 bg-white">
          <div ref={containerRef} className="h-[300px] w-full" />
        </div>
      )}
    </section>
  )
}

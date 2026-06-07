import { describe, expect, it } from 'vitest'
import { MultiDirectedGraph } from 'graphology'
import { ENTITY_COLORS } from '@/constants/entityTypes'
import type { MythographGraph } from '@/lib/graph/buildGraphology'
import {
  buildGraph3DData,
  buildNeighborMap,
  confidenceToVal,
  dimNodeColor,
  getGraph3DFocusBlockReason,
  getRetainedGraph3DNodeId,
  GRAPH_3D_NODE_CAP,
} from '@/lib/graph/graph3dData'
import { DEFAULT_GRAPH_FILTERS, type GraphFilterState } from '@/stores/graphStore'
import type { EntityType, RelationshipType } from '@/types/domain'

interface NodeSeed {
  id: string
  type: EntityType
  confidence: number
  name?: string
}

interface EdgeSeed {
  id: string
  source: string
  target: string
  type?: RelationshipType
}

const buildGraph = (nodes: NodeSeed[], edges: EdgeSeed[] = []): MythographGraph => {
  const graph: MythographGraph = new MultiDirectedGraph({ multi: true, type: 'directed' })
  graph.setAttribute('generatedAt', new Date(0).toISOString())

  nodes.forEach((node, index) => {
    graph.addNode(node.id, {
      confidence: node.confidence,
      description: null,
      entityType: node.type,
      label: node.name ?? node.id,
      persistedPosition: false,
      slug: node.id,
      x: index,
      y: index,
    })
  })

  edges.forEach((edge) => {
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      label: (edge.type ?? 'symbolizes').toUpperCase(),
      relationshipType: edge.type ?? 'symbolizes',
      weight: 1,
    })
  })

  return graph
}

const filtersWith = (overrides: Partial<GraphFilterState>): GraphFilterState => ({
  ...DEFAULT_GRAPH_FILTERS,
  ...overrides,
  entityTypes: { ...DEFAULT_GRAPH_FILTERS.entityTypes, ...overrides.entityTypes },
})

describe('confidenceToVal', () => {
  it('maps confidence into a positive, monotonically increasing size', () => {
    expect(confidenceToVal(0)).toBe(1)
    expect(confidenceToVal(1)).toBe(8)
    expect(confidenceToVal(0.5)).toBeGreaterThan(confidenceToVal(0.2))
  })

  it('clamps out-of-range confidence values', () => {
    expect(confidenceToVal(-3)).toBe(1)
    expect(confidenceToVal(5)).toBe(8)
  })
})

describe('buildGraph3DData', () => {
  it('maps nodes to the force-graph shape with type color and confidence size', () => {
    const graph = buildGraph([{ confidence: 0.8, id: 'a', name: 'Athena', type: 'figure' }])

    const data = buildGraph3DData(graph, DEFAULT_GRAPH_FILTERS)

    expect(data.nodes).toHaveLength(1)
    expect(data.nodes[0]).toMatchObject({
      color: ENTITY_COLORS.figure.node,
      confidence: 0.8,
      id: 'a',
      name: 'Athena',
      type: 'figure',
      val: confidenceToVal(0.8),
    })
    expect(data.capped).toBe(false)
    expect(data.visibleNodeCount).toBe(1)
  })

  it('only includes links whose endpoints are both visible', () => {
    const graph = buildGraph(
      [
        { confidence: 0.9, id: 'a', type: 'symbol' },
        { confidence: 0.9, id: 'b', type: 'figure' },
        { confidence: 0.1, id: 'c', type: 'trope' },
      ],
      [
        { id: 'ab', source: 'a', target: 'b' },
        { id: 'ac', source: 'a', target: 'c' },
      ]
    )

    const data = buildGraph3DData(graph, filtersWith({ confidenceThreshold: 0.5 }))

    expect(data.nodes.map((node) => node.id).sort()).toEqual(['a', 'b'])
    expect(data.links).toHaveLength(1)
    expect(data.links[0]).toMatchObject({ source: 'a', target: 'b' })
  })

  it('hides nodes whose entity type is disabled', () => {
    const graph = buildGraph([
      { confidence: 0.9, id: 'a', type: 'symbol' },
      { confidence: 0.9, id: 'b', type: 'figure' },
    ])

    const data = buildGraph3DData(
      graph,
      filtersWith({
        entityTypes: {
          culture: true,
          figure: false,
          narrative: true,
          symbol: true,
          trope: true,
        },
      })
    )

    expect(data.nodes.map((node) => node.id)).toEqual(['a'])
  })

  it('caps the node count to the top-N by confidence and flags it', () => {
    const nodes: NodeSeed[] = Array.from({ length: 5 }, (_, index) => ({
      confidence: index / 10,
      id: `n${index}`,
      type: 'symbol',
    }))

    const data = buildGraph3DData(graph_(nodes), DEFAULT_GRAPH_FILTERS, 2)

    expect(data.capped).toBe(true)
    expect(data.visibleNodeCount).toBe(5)
    expect(data.visibleNodeIdsBeforeCap).toEqual(new Set(['n0', 'n1', 'n2', 'n3', 'n4']))
    expect(data.nodes).toHaveLength(2)
    expect(data.nodes.map((node) => node.id)).toEqual(['n4', 'n3'])
  })

  it('does not flag capped when visible count equals the cap', () => {
    const nodes: NodeSeed[] = Array.from({ length: 2 }, (_, index) => ({
      confidence: 0.5,
      id: `n${index}`,
      type: 'symbol',
    }))

    const data = buildGraph3DData(graph_(nodes), DEFAULT_GRAPH_FILTERS, 2)

    expect(data.capped).toBe(false)
    expect(data.nodes).toHaveLength(2)
  })

  it('defaults the cap to 2000 nodes', () => {
    expect(GRAPH_3D_NODE_CAP).toBe(2000)
  })
})

describe('getRetainedGraph3DNodeId', () => {
  it('keeps rendered ids and clears stale ids', () => {
    const renderedIds = new Set(['a', 'b'])

    expect(getRetainedGraph3DNodeId('a', renderedIds)).toBe('a')
    expect(getRetainedGraph3DNodeId('c', renderedIds)).toBeNull()
    expect(getRetainedGraph3DNodeId(null, renderedIds)).toBeNull()
  })
})

describe('getGraph3DFocusBlockReason', () => {
  it('distinguishes missing, hidden, capped, and rendered focus targets', () => {
    const graph = buildGraph([
      { confidence: 0.9, id: 'visible', type: 'symbol' },
      { confidence: 0.8, id: 'capped', type: 'symbol' },
      { confidence: 0.1, id: 'hidden', type: 'symbol' },
    ])
    const data = buildGraph3DData(graph, filtersWith({ confidenceThreshold: 0.5 }), 1)

    expect(getGraph3DFocusBlockReason('visible', graph, data)).toBeNull()
    expect(getGraph3DFocusBlockReason('capped', graph, data)).toBe('capped')
    expect(getGraph3DFocusBlockReason('hidden', graph, data)).toBe('hidden')
    expect(getGraph3DFocusBlockReason('missing', graph, data)).toBe('missing')
  })
})

describe('buildNeighborMap', () => {
  it('builds a bidirectional adjacency map from links', () => {
    const neighbors = buildNeighborMap([
      { color: '#fff', relationshipType: 'symbolizes', source: 'a', target: 'b' },
      { color: '#fff', relationshipType: 'symbolizes', source: 'b', target: 'c' },
    ])

    expect(neighbors.get('a')).toEqual(new Set(['b']))
    expect(neighbors.get('b')).toEqual(new Set(['a', 'c']))
    expect(neighbors.get('c')).toEqual(new Set(['b']))
  })
})

describe('dimNodeColor', () => {
  it('darkens a hex color toward the canvas floor', () => {
    const dimmed = dimNodeColor('#4A7C6F')

    expect(dimmed).toMatch(/^#[0-9a-f]{6}$/)
    expect(dimmed).not.toBe('#4A7C6F')
  })

  it('returns the input unchanged when it is not a 6-digit hex', () => {
    expect(dimNodeColor('rgba(0,0,0,1)')).toBe('rgba(0,0,0,1)')
  })
})

const graph_ = (nodes: NodeSeed[]): MythographGraph => buildGraph(nodes)

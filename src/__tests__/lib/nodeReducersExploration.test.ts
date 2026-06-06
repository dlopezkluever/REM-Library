import { describe, expect, it } from 'vitest'
import { createNodeReducer } from '@/lib/graph/nodeReducers'
import type { GraphNodeAttributes } from '@/lib/graph/types'

const makeNode = (overrides: Partial<GraphNodeAttributes> = {}): GraphNodeAttributes => ({
  confidence: 0.5,
  description: null,
  entityType: 'symbol',
  label: 'Node',
  persistedPosition: false,
  slug: 'node',
  x: 0,
  y: 0,
  ...overrides,
})

describe('createNodeReducer in exploration mode', () => {
  const reducer = createNodeReducer({
    activeNodeId: null,
    allLabelsVisible: () => false,
    focusNodeIds: new Set(['focus']),
    highlightedNodeIds: new Set(['focus']),
    hoveredNodeId: null,
  })

  it('keeps focused nodes bright and labelled', () => {
    const result = reducer('focus', makeNode({ label: 'Focused' }))
    expect(result.highlighted).toBe(true)
    expect(result.forceLabel).toBe(true)
    expect(result.label).toBe('Focused')
    expect(result.color).toContain('0.95')
  })

  it('dims and unlabels nodes outside the focus set', () => {
    const result = reducer('other', makeNode({ label: 'Other' }))
    expect(result.highlighted).toBe(false)
    expect(result.forceLabel).toBe(false)
    expect(result.label).toBeNull()
    expect(result.color).toContain('0.08')
  })
})

describe('createNodeReducer without exploration focus', () => {
  it('treats all nodes as focused when nothing is hovered or active', () => {
    const reducer = createNodeReducer({
      activeNodeId: null,
      allLabelsVisible: () => true,
      highlightedNodeIds: new Set(),
      hoveredNodeId: null,
    })

    const result = reducer('any', makeNode())
    expect(result.color).toContain('0.92')
  })
})

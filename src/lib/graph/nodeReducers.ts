import type { NodeDisplayData } from 'sigma/types'
import { ENTITY_COLORS } from '@/constants/entityTypes'
import type { EntityType } from '@/types/domain'
import type { GraphNodeAttributes } from '@/lib/graph/types'

export const confidenceToRadius = (score: number): number => {
  const normalizedScore = Math.min(Math.max(score, 0), 1)
  return 5 + normalizedScore * 23
}

export const entityTypeToColor = (type: EntityType): string => ENTITY_COLORS[type].node

export const hexToRgba = (hex: string, opacity: number): string => {
  const normalizedHex = hex.replace('#', '')

  if (normalizedHex.length !== 6) {
    return hex
  }

  const red = Number.parseInt(normalizedHex.slice(0, 2), 16)
  const green = Number.parseInt(normalizedHex.slice(2, 4), 16)
  const blue = Number.parseInt(normalizedHex.slice(4, 6), 16)

  return `rgba(${red},${green},${blue},${opacity})`
}

interface NodeReducerOptions {
  activeNodeId: string | null
  hoveredNodeId: string | null
  highlightedNodeIds: Set<string>
  allLabelsVisible: () => boolean
  // When provided (guided explorations), only these nodes are treated as
  // focused; every other node is dimmed regardless of hover/active state.
  focusNodeIds?: Set<string> | null
}

export const createNodeReducer =
  ({
    activeNodeId,
    hoveredNodeId,
    highlightedNodeIds,
    allLabelsVisible,
    focusNodeIds = null,
  }: NodeReducerOptions) =>
  (node: string, data: GraphNodeAttributes): Partial<NodeDisplayData> => {
    const size = confidenceToRadius(data.confidence)
    const baseColor = entityTypeToColor(data.entityType)
    const explorationMode = focusNodeIds !== null

    if (explorationMode) {
      const focused = focusNodeIds.has(node)
      const opacity = focused ? 0.95 : 0.08

      return {
        color: hexToRgba(baseColor, opacity),
        forceLabel: focused,
        hidden: data.hidden ?? false,
        highlighted: focused,
        label: focused ? data.label : null,
        size,
        type: 'glow',
        x: data.x,
        y: data.y,
      }
    }

    const hasFocus = hoveredNodeId !== null || activeNodeId !== null
    const focused =
      !hasFocus || node === hoveredNodeId || node === activeNodeId || highlightedNodeIds.has(node)
    const opacity = focused ? 0.92 : 0.15
    const label =
      allLabelsVisible() || size >= 9 || node === hoveredNodeId || node === activeNodeId
        ? data.label
        : null

    return {
      color: hexToRgba(baseColor, opacity),
      forceLabel: label !== null && (allLabelsVisible() || size >= 9 || node === activeNodeId),
      hidden: data.hidden ?? false,
      highlighted: node === activeNodeId || node === hoveredNodeId,
      label,
      size,
      type: 'glow',
      x: data.x,
      y: data.y,
    }
  }

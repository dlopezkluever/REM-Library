import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { FeaturedConnections } from '@/components/graph/FeaturedConnections'
import { GraphCanvas, type GraphFocusBlockReason } from '@/components/graph/GraphCanvas'
import { GraphFilters } from '@/components/graph/GraphFilters'
import { GraphSearchBar } from '@/components/graph/GraphSearchBar'
import { GraphSidePanel } from '@/components/graph/GraphSidePanel'
import { cn } from '@/lib/utils'
import { useGraphStore } from '@/stores/graphStore'
import type { EntitySearchResult } from '@/types/domain'

const GraphCanvas3D = lazy(() =>
  import('@/components/graph/GraphCanvas3D').then((module) => ({ default: module.GraphCanvas3D }))
)

type GraphViewMode = '2d' | '3d'

interface PendingFocus {
  id: string
  name: string
}

interface BlockedFocus extends PendingFocus {
  reason: GraphFocusBlockReason
}

export default function GraphPage() {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [viewMode, setViewMode] = useState<GraphViewMode>('2d')
  const [pendingFocus, setPendingFocus] = useState<PendingFocus | null>(null)
  const [blockedFocus, setBlockedFocus] = useState<BlockedFocus | null>(null)
  const setActiveNodeId = useGraphStore((state) => state.setActiveNodeId)
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId)
  const resetFilters = useGraphStore((state) => state.resetFilters)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const target = event.target
      const editableTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if (editableTarget) {
        return
      }

      event.preventDefault()
      searchInputRef.current?.focus()
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSearchSelect = useCallback(
    (entity: EntitySearchResult) => {
      setHoveredNodeId(null)
      setActiveNodeId(null)
      setBlockedFocus(null)
      setPendingFocus({ id: entity.id, name: entity.name })
    },
    [setActiveNodeId, setHoveredNodeId]
  )

  const handleFocusedNodeSettled = useCallback(
    (nodeId: string) => {
      setActiveNodeId(nodeId)
      setPendingFocus((current) => (current?.id === nodeId ? null : current))
      setBlockedFocus(null)
    },
    [setActiveNodeId]
  )

  const handleFocusBlocked = useCallback(
    (nodeId: string, reason: GraphFocusBlockReason) => {
      const focusName = pendingFocus?.id === nodeId ? pendingFocus.name : 'This entity'

      setBlockedFocus({
        id: nodeId,
        name: focusName,
        reason,
      })
      setPendingFocus((current) => (current?.id === nodeId ? null : current))
    },
    [pendingFocus]
  )

  const retryBlockedFocus = () => {
    if (!blockedFocus) {
      return
    }

    resetFilters()
    setPendingFocus({ id: blockedFocus.id, name: blockedFocus.name })
    setBlockedFocus(null)
  }

  const openBlockedFocusIn2D = () => {
    if (!blockedFocus) {
      return
    }

    setPendingFocus({ id: blockedFocus.id, name: blockedFocus.name })
    setBlockedFocus(null)
    setViewMode('2d')
  }

  const dismissBlockedFocus = () => setBlockedFocus(null)

  const blockedFocusMessage = blockedFocus
    ? blockedFocus.reason === 'hidden'
      ? `${blockedFocus.name} is hidden by your current filters.`
      : blockedFocus.reason === 'capped'
        ? `${blockedFocus.name} is outside the 3D top 2,000 node cap. Use filters to narrow the graph, or open it in 2D.`
        : 'This entity is not loaded in the current graph view.'
    : null

  const blockedFocusAction =
    blockedFocus?.reason === 'hidden'
      ? retryBlockedFocus
      : blockedFocus?.reason === 'capped'
        ? openBlockedFocusIn2D
        : dismissBlockedFocus

  const blockedFocusActionLabel =
    blockedFocus?.reason === 'hidden'
      ? 'Clear filters'
      : blockedFocus?.reason === 'capped'
        ? 'Open in 2D'
        : 'Dismiss'

  const handleViewModeChange = useCallback(
    (mode: GraphViewMode) => {
      if (mode === viewMode) {
        return
      }

      const activeNodeId = useGraphStore.getState().activeNodeId
      setBlockedFocus(null)

      if (activeNodeId) {
        setPendingFocus({ id: activeNodeId, name: 'This entity' })
      }

      setViewMode(mode)
    },
    [viewMode]
  )

  const canvasProps = {
    focusedNodeId: pendingFocus?.id ?? null,
    onFocusBlocked: handleFocusBlocked,
    onFocusedNodeSettled: handleFocusedNodeSettled,
  }

  return (
    <div className="relative h-full">
      {viewMode === '2d' ? (
        <GraphCanvas {...canvasProps} />
      ) : (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center bg-canvas">
              <p className="font-display text-[10px] uppercase tracking-label text-white/45">
                Loading 3D graph
              </p>
            </div>
          }
        >
          <GraphCanvas3D {...canvasProps} />
        </Suspense>
      )}
      <div className="pointer-events-none absolute inset-0">
        <GraphSearchBar inputRef={searchInputRef} onSelect={handleSearchSelect} />
        <GraphFilters />
        <div
          className="pointer-events-auto absolute right-16 top-4 z-30 flex items-center gap-1 rounded border-0.5 border-white/10 bg-charcoal/80 p-1 backdrop-blur-md"
          role="group"
          aria-label="Graph dimension"
        >
          {(['2d', '3d'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={viewMode === mode}
              className={cn(
                'rounded px-2.5 py-1 font-display text-[10px] uppercase tracking-label transition-colors',
                viewMode === mode ? 'bg-verdigris text-stone' : 'text-white/55 hover:text-white'
              )}
              type="button"
              onClick={() => handleViewModeChange(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
        <FeaturedConnections />
      </div>
      {blockedFocus ? (
        <div className="absolute bottom-5 left-1/2 z-40 flex w-[min(calc(100vw-2rem),420px)] -translate-x-1/2 items-center justify-between gap-4 rounded border-0.5 border-white/10 bg-charcoal/95 px-4 py-3 text-white shadow-xl backdrop-blur-md">
          <p className="font-body text-[12px] text-white/70">{blockedFocusMessage}</p>
          <button
            className="shrink-0 font-body text-[12px] text-verdigris-light hover:text-white"
            type="button"
            onClick={blockedFocusAction}
          >
            {blockedFocusActionLabel}
          </button>
        </div>
      ) : null}
      <GraphSidePanel />
    </div>
  )
}

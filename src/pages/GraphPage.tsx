import { useCallback, useEffect, useRef, useState } from 'react'
import { FeaturedConnections } from '@/components/graph/FeaturedConnections'
import { GraphCanvas, type GraphFocusBlockReason } from '@/components/graph/GraphCanvas'
import { GraphFilters } from '@/components/graph/GraphFilters'
import { GraphSearchBar } from '@/components/graph/GraphSearchBar'
import { GraphSidePanel } from '@/components/graph/GraphSidePanel'
import { useGraphStore } from '@/stores/graphStore'
import type { EntitySearchResult } from '@/types/domain'

interface PendingFocus {
  id: string
  name: string
}

interface BlockedFocus extends PendingFocus {
  reason: GraphFocusBlockReason
}

export default function GraphPage() {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
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

  const dismissBlockedFocus = () => setBlockedFocus(null)

  return (
    <div className="relative h-full">
      <GraphCanvas
        focusedNodeId={pendingFocus?.id ?? null}
        onFocusBlocked={handleFocusBlocked}
        onFocusedNodeSettled={handleFocusedNodeSettled}
      />
      <div className="pointer-events-none absolute inset-0">
        <GraphSearchBar inputRef={searchInputRef} onSelect={handleSearchSelect} />
        <GraphFilters />
        <FeaturedConnections />
      </div>
      {blockedFocus ? (
        <div className="absolute bottom-5 left-1/2 z-40 flex w-[min(calc(100vw-2rem),420px)] -translate-x-1/2 items-center justify-between gap-4 rounded border-0.5 border-white/10 bg-charcoal/95 px-4 py-3 text-white shadow-xl backdrop-blur-md">
          <p className="font-body text-[12px] text-white/70">
            {blockedFocus.reason === 'hidden'
              ? `${blockedFocus.name} is hidden by your current filters.`
              : 'This entity is not loaded in the current graph view.'}
          </p>
          <button
            className="shrink-0 font-body text-[12px] text-verdigris-light hover:text-white"
            type="button"
            onClick={blockedFocus.reason === 'hidden' ? retryBlockedFocus : dismissBlockedFocus}
          >
            {blockedFocus.reason === 'hidden' ? 'Clear filters' : 'Dismiss'}
          </button>
        </div>
      ) : null}
      <GraphSidePanel />
    </div>
  )
}

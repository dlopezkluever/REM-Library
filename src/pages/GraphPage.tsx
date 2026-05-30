import { useCallback, useEffect, useRef, useState } from 'react'
import { FeaturedConnections } from '@/components/graph/FeaturedConnections'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { GraphFilters } from '@/components/graph/GraphFilters'
import { GraphSearchBar } from '@/components/graph/GraphSearchBar'
import { GraphSidePanel } from '@/components/graph/GraphSidePanel'
import { useGraphStore } from '@/stores/graphStore'
import type { EntitySearchResult } from '@/types/domain'

export default function GraphPage() {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [pendingFocusName, setPendingFocusName] = useState<string | null>(null)
  const [hiddenSearchResultName, setHiddenSearchResultName] = useState<string | null>(null)
  const [hiddenSearchResultId, setHiddenSearchResultId] = useState<string | null>(null)
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
      setPendingFocusName(entity.name)
      setHiddenSearchResultName(null)
      setHiddenSearchResultId(null)
      setFocusedNodeId(entity.id)
    },
    [setActiveNodeId, setHoveredNodeId]
  )

  const handleFocusedNodeSettled = useCallback(
    (nodeId: string) => {
      setActiveNodeId(nodeId)
      setFocusedNodeId(null)
      setPendingFocusName(null)
      setHiddenSearchResultName(null)
      setHiddenSearchResultId(null)
    },
    [setActiveNodeId]
  )

  const handleFocusBlocked = useCallback((nodeId: string) => {
    setFocusedNodeId(null)
    setHiddenSearchResultName(pendingFocusName)
    setHiddenSearchResultId(nodeId)
    setPendingFocusName(null)
  }, [pendingFocusName])

  return (
    <div className="relative h-full">
      <GraphCanvas
        focusedNodeId={focusedNodeId}
        onFocusBlocked={handleFocusBlocked}
        onFocusedNodeSettled={handleFocusedNodeSettled}
      />
      <div className="pointer-events-none absolute inset-0">
        <GraphSearchBar inputRef={searchInputRef} onSelect={handleSearchSelect} />
        <GraphFilters />
        <FeaturedConnections />
      </div>
      {hiddenSearchResultName ? (
        <div className="absolute bottom-5 left-1/2 z-40 flex w-[min(calc(100vw-2rem),420px)] -translate-x-1/2 items-center justify-between gap-4 rounded border-0.5 border-white/10 bg-charcoal/95 px-4 py-3 text-white shadow-xl backdrop-blur-md">
          <p className="font-body text-[12px] text-white/70">
            {hiddenSearchResultName} is hidden by your current filters.
          </p>
          <button
            className="shrink-0 font-body text-[12px] text-verdigris-light hover:text-white"
            type="button"
            onClick={() => {
              resetFilters()
              setHiddenSearchResultName(null)
              setFocusedNodeId(hiddenSearchResultId)
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}
      <GraphSidePanel />
    </div>
  )
}

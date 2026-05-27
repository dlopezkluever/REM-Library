import { useCallback, useEffect, useRef, useState } from 'react'
import { FeaturedConnections } from '@/components/graph/FeaturedConnections'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { GraphFilters } from '@/components/graph/GraphFilters'
import { GraphSearchBar } from '@/components/graph/GraphSearchBar'
import { GraphSidePanel } from '@/components/graph/GraphSidePanel'
import type { EntityRow } from '@/lib/api/entities'
import { useGraphStore } from '@/stores/graphStore'

export default function GraphPage() {
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const setActiveNodeId = useGraphStore((state) => state.setActiveNodeId)
  const setHoveredNodeId = useGraphStore((state) => state.setHoveredNodeId)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
    (entity: EntityRow) => {
      setHoveredNodeId(null)
      setActiveNodeId(entity.id)
      setFocusedNodeId(entity.id)
    },
    [setActiveNodeId, setHoveredNodeId]
  )

  return (
    <div className="relative h-full">
      <GraphCanvas
        focusedNodeId={focusedNodeId}
        onFocusedNodeSettled={() => setFocusedNodeId(null)}
      />
      <div className="pointer-events-none absolute inset-0">
        <GraphSearchBar inputRef={searchInputRef} onSelect={handleSearchSelect} />
        <GraphFilters />
        <FeaturedConnections />
      </div>
      <GraphSidePanel />
    </div>
  )
}

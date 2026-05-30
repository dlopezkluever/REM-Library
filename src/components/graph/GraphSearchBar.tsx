import { type KeyboardEvent, type RefObject, useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { useSearch } from '@/hooks/useSearch'
import type { EntitySearchResult } from '@/types/domain'

interface GraphSearchBarProps {
  inputRef: RefObject<HTMLInputElement | null>
  onSelect: (entity: EntitySearchResult) => void
}

export const GraphSearchBar = ({ inputRef, onSelect }: GraphSearchBarProps) => {
  const [activeIndex, setActiveIndex] = useState(0)
  const { error, isLoading, query, results, setQuery } = useSearch()
  const entityResults = results.entities.slice(0, 8)
  const safeActiveIndex = Math.min(activeIndex, Math.max(entityResults.length - 1, 0))

  useEffect(() => {
    const focusSearch = () => inputRef.current?.focus()

    window.addEventListener('mythograph:focus-graph-search', focusSearch)

    return () => window.removeEventListener('mythograph:focus-graph-search', focusSearch)
  }, [inputRef])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setQuery('')
      inputRef.current?.focus()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, Math.max(entityResults.length - 1, 0)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      const selectedEntity = entityResults[safeActiveIndex]

      if (selectedEntity) {
        event.preventDefault()
        onSelect(selectedEntity)
        setQuery('')
      }
    }
  }

  return (
    <div className="pointer-events-auto absolute left-1/2 top-8 z-20 w-[min(calc(100vw-2rem),520px)] -translate-x-1/2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search symbols, figures, narratives..."
          className="h-11 w-full rounded border-0.5 border-white/15 bg-charcoal/80 pl-10 pr-4 font-body text-[13px] text-white/80 outline-none backdrop-blur-sm transition-colors placeholder:text-white/30 focus:border-verdigris/70"
          type="search"
        />
      </div>

      {query.trim().length > 0 ? (
        <div className="mt-1 overflow-hidden rounded border-0.5 border-white/10 bg-charcoal/95 backdrop-blur-md">
          {error ? (
            <p className="px-3 py-2 font-body text-[12px] text-white/40">
              Search is temporarily unavailable.
            </p>
          ) : isLoading && entityResults.length === 0 ? (
            <p className="px-3 py-2 font-body text-[12px] text-white/40">Searching...</p>
          ) : entityResults.length > 0 ? (
            entityResults.map((entity, index) => (
              <button
                key={entity.id}
                className="flex w-full items-center justify-between gap-3 border-b-0.5 border-white/5 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/[0.04] data-[active=true]:bg-white/[0.07]"
                data-active={safeActiveIndex === index}
                type="button"
                onClick={() => {
                  onSelect(entity)
                  setQuery('')
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="truncate font-body text-[12px] text-white/80">{entity.name}</span>
                <EntityBadge type={entity.type} />
              </button>
            ))
          ) : (
            <p className="px-3 py-2 font-body text-[12px] text-white/40">
              No visible graph results for "{query.trim()}".
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

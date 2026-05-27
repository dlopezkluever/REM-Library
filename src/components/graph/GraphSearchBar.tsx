import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { getPublishedEntities, type EntityRow } from '@/lib/api/entities'

interface GraphSearchBarProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: (entity: EntityRow) => void
}

export const GraphSearchBar = ({ inputRef, onSelect }: GraphSearchBarProps) => {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 200)

    return () => window.clearTimeout(timer)
  }, [query])

  const { data: results = [] } = useQuery({
    queryKey: ['entities', 'published', 'search', debouncedQuery],
    queryFn: () => getPublishedEntities({ search: debouncedQuery, limit: 8 }),
    enabled: debouncedQuery.length > 0,
    staleTime: 30_000,
  })

  return (
    <div className="pointer-events-auto absolute left-1/2 top-8 z-20 w-[min(calc(100vw-2rem),520px)] -translate-x-1/2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search symbols, figures, narratives..."
          className="h-11 w-full rounded border-0.5 border-white/15 bg-charcoal/80 pl-10 pr-4 font-body text-[13px] text-white/80 outline-none backdrop-blur-sm transition-colors placeholder:text-white/30 focus:border-verdigris/70"
          type="search"
        />
      </div>

      {debouncedQuery.length > 0 ? (
        <div className="mt-1 overflow-hidden rounded border-0.5 border-white/10 bg-charcoal/95 backdrop-blur-md">
          {results.length > 0 ? (
            results.map((entity) => (
              <button
                key={entity.id}
                className="flex w-full items-center justify-between gap-3 border-b-0.5 border-white/5 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-white/[0.04]"
                type="button"
                onClick={() => {
                  onSelect(entity)
                  setQuery(entity.name)
                }}
              >
                <span className="truncate font-body text-[12px] text-white/80">{entity.name}</span>
                <EntityBadge type={entity.type} />
              </button>
            ))
          ) : (
            <p className="px-3 py-2 font-body text-[12px] text-white/40">
              No results for "{debouncedQuery}".
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}

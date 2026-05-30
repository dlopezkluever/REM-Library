import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { flattenSearchResults, hasSearchResults, type SearchResultItem } from '@/lib/searchResults'
import { cn } from '@/lib/utils'
import type { SearchResults } from '@/types/domain'

interface SearchDropdownProps {
  activeIndex: number
  error: Error | null
  isLoading: boolean
  query: string
  results: SearchResults
  variant: 'dark' | 'light'
  onActiveIndexChange: (index: number) => void
  onSelect: (item: SearchResultItem) => void
}

const stripHeadlineTags = (value: string) => value.replace(/<\/?b>/g, '')

export const SearchDropdown = ({
  activeIndex,
  error,
  isLoading,
  query,
  results,
  variant,
  onActiveIndexChange,
  onSelect,
}: SearchDropdownProps) => {
  const items = flattenSearchResults(results)
  const isDark = variant === 'dark'

  const shellClassName = cn(
    'mt-1 max-h-[min(70vh,560px)] overflow-auto rounded border-0.5 shadow-xl',
    isDark
      ? 'border-white/10 bg-charcoal/95 text-white backdrop-blur-md'
      : 'border-black/10 bg-stone text-ink'
  )

  if (error) {
    return (
      <div className={shellClassName}>
        <p className={cn('px-3 py-3 font-body text-[12px]', isDark ? 'text-white/50' : 'text-[#777]')}>
          Search is temporarily unavailable.
        </p>
      </div>
    )
  }

  if (isLoading && !hasSearchResults(results)) {
    return (
      <div className={shellClassName}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className={cn(
              'mx-3 my-3 h-4 rounded',
              isDark ? 'bg-white/[0.07]' : 'bg-black/[0.07]'
            )}
          />
        ))}
      </div>
    )
  }

  if (!hasSearchResults(results)) {
    return (
      <div className={shellClassName}>
        <p className={cn('px-3 py-3 font-body text-[12px]', isDark ? 'text-white/50' : 'text-[#777]')}>
          No results for "{query.trim()}".
        </p>
      </div>
    )
  }

  return (
    <div className={shellClassName}>
      {items.map((item, index) => {
        const showGroup = index === 0 || items[index - 1]?.groupLabel !== item.groupLabel

        return (
          <div key={`${item.result.kind}-${item.result.id}`}>
            {showGroup ? (
              <p
                className={cn(
                  'px-3 pb-1 pt-3 font-display text-[9px] uppercase tracking-label',
                  isDark ? 'text-white/35' : 'text-[#888]'
                )}
              >
                {item.groupLabel}
              </p>
            ) : null}
            <button
              className={cn(
                'flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors',
                isDark ? 'hover:bg-white/[0.05]' : 'hover:bg-black/[0.04]',
                activeIndex === index && (isDark ? 'bg-white/[0.07]' : 'bg-black/[0.06]')
              )}
              type="button"
              onClick={() => onSelect(item)}
              onMouseEnter={() => onActiveIndexChange(index)}
            >
              <span className="min-w-0">
                <span
                  className={cn(
                    'block truncate font-body text-[12px]',
                    isDark ? 'text-white/82' : 'text-ink'
                  )}
                >
                  {item.title}
                </span>
                <span
                  className={cn(
                    'mt-0.5 block line-clamp-2 font-body text-[11px]',
                    isDark ? 'text-white/42' : 'text-[#777]'
                  )}
                >
                  {stripHeadlineTags(item.result.matchedExcerpt)}
                </span>
              </span>
              <Badge className="shrink-0" variant="outline">
                {item.typeLabel}
              </Badge>
            </button>
          </div>
        )
      })}

      <Link
        className={cn(
          'block border-t-0.5 px-3 py-3 font-body text-[12px] transition-colors',
          isDark
            ? 'border-white/10 text-white/60 hover:text-white'
            : 'border-black/10 text-[#666] hover:text-ink'
        )}
        to={`/search?q=${encodeURIComponent(query.trim())}`}
      >
        See all results -&gt;
      </Link>
    </div>
  )
}

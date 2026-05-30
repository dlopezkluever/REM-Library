import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { SearchDropdown } from '@/components/search/SearchDropdown'
import { ROUTES } from '@/constants/routes'
import { useSearch } from '@/hooks/useSearch'
import { flattenSearchResults } from '@/lib/searchResults'
import { cn } from '@/lib/utils'

interface NavBarProps {
  variant: 'dark' | 'light'
}

export const NavBar = ({ variant }: NavBarProps) => {
  const location = useLocation()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const { error, isLoading, query, results, setQuery } = useSearch()
  const isDark = variant === 'dark'
  const isGraphPage = location.pathname === ROUTES.GRAPH
  const dropdownItems = flattenSearchResults(results)
  const safeActiveIndex = Math.min(activeIndex, Math.max(dropdownItems.length - 1, 0))

  const navLinkClass = cn(
    'font-body text-xs transition-opacity duration-200',
    isDark ? 'text-white/40 hover:text-white/80' : 'text-[#888] hover:text-ink'
  )

  const activeLinkClass = cn('font-body text-xs', isDark ? 'text-white/82' : 'text-ink')

  const isActive = (path: string) => location.pathname === path

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

      if (isGraphPage) {
        window.dispatchEvent(new CustomEvent('mythograph:focus-graph-search'))
        return
      }

      setSearchOpen(true)
      window.setTimeout(() => inputRef.current?.focus(), 0)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isGraphPage])

  const openSearch = () => {
    if (isGraphPage) {
      window.dispatchEvent(new CustomEvent('mythograph:focus-graph-search'))
      return
    }

    setSearchOpen(true)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setQuery('')
    setActiveIndex(0)
  }

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeSearch()
      inputRef.current?.focus()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, Math.max(dropdownItems.length - 1, 0)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      const activeItem = dropdownItems[safeActiveIndex]

      if (activeItem) {
        navigate(activeItem.route)
        closeSearch()
        return
      }

      if (query.trim()) {
        navigate(`/search?q=${encodeURIComponent(query.trim())}`)
        closeSearch()
      }
    }
  }

  return (
    <nav
      className={cn(
        'flex items-center justify-between px-[22px] h-10 shrink-0',
        isDark
          ? 'bg-charcoal border-b border-b-0.5 border-b-white/[0.07]'
          : 'bg-stone border-b border-b-0.5 border-b-black/[0.09]'
      )}
    >
      <Link
        to={ROUTES.GRAPH}
        className={cn(
          'font-display text-[13px] tracking-wordmark uppercase',
          isDark ? 'text-white/82' : 'text-ink'
        )}
      >
        Mythograph
      </Link>

      <div className="flex items-center gap-6">
        <Link
          to={ROUTES.ENCYCLOPEDIA}
          className={isActive(ROUTES.ENCYCLOPEDIA) ? activeLinkClass : navLinkClass}
          onClick={closeSearch}
        >
          Encyclopedia
        </Link>
        <Link
          to={ROUTES.SOURCES}
          className={isActive(ROUTES.SOURCES) ? activeLinkClass : navLinkClass}
          onClick={closeSearch}
        >
          Sources
        </Link>
        <div className="relative">
          <button
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded-full border border-0.5 font-body text-xs transition-opacity duration-200',
              isDark
                ? 'border-white/20 text-white/40 hover:text-white/80'
                : 'border-black/18 text-[#888] hover:text-ink'
            )}
            type="button"
            onClick={openSearch}
          >
            <Search className="h-3 w-3" />
            Search
          </button>

          {searchOpen ? (
            <div className="absolute right-0 top-8 z-50 w-[min(calc(100vw-2rem),460px)]">
              <div className="relative">
                <Search
                  className={cn(
                    'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2',
                    isDark ? 'text-white/35' : 'text-[#888]'
                  )}
                />
                <input
                  ref={inputRef}
                  className={cn(
                    'h-10 w-full rounded border-0.5 pl-10 pr-10 font-body text-[13px] outline-none transition-colors',
                    isDark
                      ? 'border-white/15 bg-charcoal/95 text-white/80 placeholder:text-white/30 focus:border-verdigris/70'
                      : 'border-black/15 bg-stone text-ink placeholder:text-[#888] focus:border-verdigris'
                  )}
                  placeholder="Search symbols, claims, sources..."
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setActiveIndex(0)
                  }}
                  onKeyDown={handleSearchKeyDown}
                />
                <button
                  aria-label="Close search"
                  className={cn(
                    'absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded transition-colors',
                    isDark ? 'text-white/40 hover:bg-white/10' : 'text-[#777] hover:bg-black/5'
                  )}
                  type="button"
                  onClick={closeSearch}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {query.trim() ? (
                <SearchDropdown
                  activeIndex={safeActiveIndex}
                  error={error}
                  isLoading={isLoading}
                  query={query}
                  results={results}
                  variant={variant}
                  onActiveIndexChange={setActiveIndex}
                  onSelect={(item) => {
                    navigate(item.route)
                    closeSearch()
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}

import { type ReactNode, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { Badge } from '@/components/ui/badge'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import { searchAll } from '@/lib/api/search'
import {
  EMPTY_SEARCH_RESULTS,
  hasSearchResults,
  stripSearchHeadlineTags,
} from '@/lib/searchResults'
import type {
  ClaimSearchResult,
  EntitySearchResult,
  EntityType,
  SearchResults,
  SourceSearchResult,
} from '@/types/domain'

const ENTITY_TYPES: EntityType[] = ['symbol', 'figure', 'narrative', 'trope', 'culture']

const queryTerms = (query: string) =>
  query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .filter(Boolean)

const HighlightedExcerpt = ({ query, text }: { query: string; text: string }) => {
  const cleanText = stripSearchHeadlineTags(text)
  const terms = queryTerms(query)

  if (terms.length === 0) {
    return <>{cleanText}</>
  }

  const regex = new RegExp(`(${terms.join('|')})`, 'gi')
  const matchRegex = new RegExp(`^(${terms.join('|')})$`, 'i')
  const parts = cleanText.split(regex)

  return (
    <>
      {parts.map((part, index) =>
        matchRegex.test(part) ? (
          <mark key={`${part}-${index}`} className="bg-ochre/25 px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  )
}

interface SectionProps {
  children: ReactNode
  count: number
  title: string
}

const ResultsSection = ({ children, count, title }: SectionProps) => {
  const [open, setOpen] = useState(true)

  return (
    <section className="border-b-0.5 border-black/10 py-5">
      <button
        className="flex w-full items-center justify-between gap-3 text-left"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-display text-[11px] uppercase tracking-label text-ink">
            {title}
          </span>
        </span>
        <Badge variant="outline">{count}</Badge>
      </button>
      {open ? <div className="mt-3 flex flex-col gap-2">{children}</div> : null}
    </section>
  )
}

const SkeletonRows = () => (
  <div className="flex flex-col gap-2">
    {Array.from({ length: 3 }).map((_, index) => (
      <div key={index} className="rounded border-0.5 border-black/8 bg-black/[0.025] p-4">
        <div className="h-4 w-1/3 rounded bg-black/10" />
        <div className="mt-3 h-3 w-4/5 rounded bg-black/8" />
      </div>
    ))}
  </div>
)

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q')?.trim() ?? ''
  const [enabledTypes, setEnabledTypes] = useState<Record<EntityType, boolean>>({
    culture: true,
    figure: true,
    narrative: true,
    symbol: true,
    trope: true,
  })
  const [minConfidence, setMinConfidence] = useState(0)
  const [maxConfidence, setMaxConfidence] = useState(1)

  const searchQuery = useQuery({
    enabled: query.length > 0,
    queryKey: ['search', query],
    queryFn: ({ signal }) => searchAll(query, { signal }),
    staleTime: 30_000,
  })

  const rawResults = searchQuery.data ?? EMPTY_SEARCH_RESULTS

  const filteredResults = useMemo<SearchResults>(() => {
    const confidenceInRange = (score: number) => score >= minConfidence && score <= maxConfidence

    return {
      claims: rawResults.claims.filter((claim) => confidenceInRange(claim.confidenceScore)),
      entities: rawResults.entities.filter(
        (entity) => enabledTypes[entity.type] && confidenceInRange(entity.confidenceScore)
      ),
      sources: rawResults.sources,
    }
  }, [enabledTypes, maxConfidence, minConfidence, rawResults])

  const clampConfidenceRange = (nextMin: number, nextMax: number) => {
    setMinConfidence(Math.min(nextMin, nextMax))
    setMaxConfidence(Math.max(nextMin, nextMax))
  }

  if (!query) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="font-display text-xl uppercase tracking-label text-ink">Search</h1>
        <p className="mt-3 font-body text-sm text-[#777]">
          Enter a term to search symbols, figures, narratives, and more.
        </p>
      </div>
    )
  }

  const loading = searchQuery.isLoading || searchQuery.isFetching
  const empty = !loading && !hasSearchResults(filteredResults)

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[220px_1fr]">
      <aside className="h-fit border-b-0.5 border-black/10 pb-5 md:border-b-0 md:border-r-0.5 md:pr-6">
        <h2 className="font-display text-[10px] uppercase tracking-label text-ink">Filters</h2>
        <div className="mt-4 flex flex-col gap-2">
          {ENTITY_TYPES.map((type) => (
            <label key={type} className="flex items-center justify-between gap-3 font-body text-sm">
              {ENTITY_LABELS[type]}
              <input
                checked={enabledTypes[type]}
                className="h-4 w-4 accent-verdigris"
                type="checkbox"
                onChange={(event) =>
                  setEnabledTypes((current) => ({ ...current, [type]: event.target.checked }))
                }
              />
            </label>
          ))}
        </div>

        <div className="mt-6">
          <p className="font-body text-sm text-[#666]">
            Confidence {minConfidence.toFixed(2)}-{maxConfidence.toFixed(2)}
          </p>
          <input
            className="mt-3 w-full"
            max={1}
            min={0}
            step={0.05}
            type="range"
            value={minConfidence}
            onChange={(event) => clampConfidenceRange(Number(event.target.value), maxConfidence)}
          />
          <input
            className="mt-1 w-full"
            max={1}
            min={0}
            step={0.05}
            type="range"
            value={maxConfidence}
            onChange={(event) => clampConfidenceRange(minConfidence, Number(event.target.value))}
          />
        </div>
      </aside>

      <main>
        <header className="mb-4">
          <h1 className="font-display text-2xl uppercase tracking-label text-ink">Search</h1>
          <p className="mt-2 font-body text-sm text-[#777]">Results for "{query}"</p>
        </header>

        {searchQuery.isError ? (
          <p className="rounded border-0.5 border-black/10 p-5 font-body text-sm text-[#777]">
            Search is temporarily unavailable.
          </p>
        ) : loading ? (
          <div className="flex flex-col gap-6">
            <SkeletonRows />
            <SkeletonRows />
          </div>
        ) : empty ? (
          <div className="py-16 text-center">
            <p className="font-display text-lg uppercase tracking-label text-ink">
              No results for "{query}"
            </p>
            <p className="mt-3 font-body text-sm text-[#777]">
              Try broader terms or check the spelling.
            </p>
          </div>
        ) : (
          <>
            <ResultsSection count={filteredResults.entities.length} title="Entities">
              {filteredResults.entities.map((entity: EntitySearchResult) => (
                <Link
                  key={entity.id}
                  className="rounded border-0.5 border-black/10 p-4 transition-colors hover:bg-black/[0.025]"
                  to={`/entity/${entity.slug}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-body text-sm text-ink">{entity.name}</h2>
                    <EntityBadge type={entity.type} />
                  </div>
                  <p className="mt-2 font-body text-sm leading-6 text-[#666]">
                    <HighlightedExcerpt query={query} text={entity.matchedExcerpt} />
                  </p>
                </Link>
              ))}
            </ResultsSection>

            <ResultsSection count={filteredResults.claims.length} title="Claims">
              {filteredResults.claims.map((claim: ClaimSearchResult) => (
                <Link
                  key={claim.id}
                  className="rounded border-0.5 border-black/10 p-4 transition-colors hover:bg-black/[0.025]"
                  to={`/claim/${claim.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-body text-sm text-ink">{claim.statement}</h2>
                    <Badge variant="outline">{claim.confidenceScore.toFixed(2)}</Badge>
                  </div>
                  <p className="mt-2 font-body text-sm leading-6 text-[#666]">
                    <HighlightedExcerpt query={query} text={claim.matchedExcerpt} />
                  </p>
                </Link>
              ))}
            </ResultsSection>

            <ResultsSection count={filteredResults.sources.length} title="Sources">
              {filteredResults.sources.map((source: SourceSearchResult) => (
                <Link
                  key={source.id}
                  className="rounded border-0.5 border-black/10 p-4 transition-colors hover:bg-black/[0.025]"
                  to={`/source/${source.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-body text-sm text-ink">{source.title}</h2>
                    <Badge variant="outline">{source.format}</Badge>
                  </div>
                  <p className="mt-2 font-body text-sm leading-6 text-[#666]">
                    <HighlightedExcerpt query={query} text={source.matchedExcerpt} />
                  </p>
                </Link>
              ))}
            </ResultsSection>
          </>
        )}
      </main>
    </div>
  )
}

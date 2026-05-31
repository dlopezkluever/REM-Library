import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Compass } from 'lucide-react'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { getPublishedExplorations } from '@/lib/api/explorations'

export default function ExplorationsPage() {
  const explorationsQuery = useQuery({
    queryKey: ['explorations', 'published'],
    queryFn: getPublishedExplorations,
    staleTime: 60_000,
  })

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8">
        <h1 className="font-display text-2xl uppercase tracking-normal text-ink">Explorations</h1>
        <p className="mt-2 max-w-2xl font-body text-sm leading-reading text-[#666]">
          Guided tours through the knowledge graph — curated paths that highlight the entities and
          connections behind a single thread of myth.
        </p>
      </header>

      {explorationsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-40 animate-pulse rounded-lg border-0.5 border-black/10 bg-white"
            />
          ))}
        </div>
      ) : null}

      {explorationsQuery.isError ? (
        <div className="rounded-lg border-0.5 border-terracotta/40 bg-white p-5">
          <p className="font-body text-sm text-terracotta-dark">Could not load explorations.</p>
        </div>
      ) : null}

      {!explorationsQuery.isLoading &&
      !explorationsQuery.isError &&
      explorationsQuery.data?.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border-0.5 border-black/10 bg-white px-6 py-16 text-center">
          <Compass className="h-7 w-7 text-[#bbb]" />
          <p className="font-body text-sm text-[#777]">
            No explorations have been published yet. Check back soon.
          </p>
        </div>
      ) : null}

      {explorationsQuery.data && explorationsQuery.data.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {explorationsQuery.data.map((exploration) => (
            <Link
              key={exploration.id}
              to={`/explorations/${exploration.id}`}
              className="group flex min-h-40 flex-col justify-between rounded-lg border-0.5 border-black/10 bg-white p-5 transition-colors hover:border-verdigris/50"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-[18px] leading-tight text-ink">
                    {exploration.title}
                  </h2>
                  {exploration.featuredType ? (
                    <EntityBadge type={exploration.featuredType} />
                  ) : null}
                </div>
                <p className="mt-3 line-clamp-3 font-body text-[12px] italic leading-meta text-[#666]">
                  {exploration.description || 'No description has been written yet.'}
                </p>
              </div>
              <div className="mt-5 flex items-center justify-between font-body text-[11px] text-[#777]">
                <span>
                  {exploration.stepCount} {exploration.stepCount === 1 ? 'step' : 'steps'}
                </span>
                <span className="inline-flex items-center gap-1 text-verdigris group-hover:text-verdigris-dark">
                  Begin tour
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}

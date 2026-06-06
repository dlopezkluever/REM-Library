import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CopyLinkButton } from '@/components/common/CopyLinkButton'
import { AddEntityDialog } from '@/components/compare/AddEntityDialog'
import { ComparisonColumn } from '@/components/compare/ComparisonColumn'
import { EntityChip } from '@/components/entity/EntityChip'
import { getComparisonEntity } from '@/lib/api/comparison'
import {
  MAX_COMPARE,
  buildCompareSearch,
  computeSharedConnections,
  parseCompareSlugs,
} from '@/lib/comparison'
import { useUiStore } from '@/stores/uiStore'
import { ROUTES } from '@/constants/routes'

export default function ComparisonPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const setComparisonSlugs = useUiStore((state) => state.setComparisonSlugs)

  const slugs = useMemo(() => parseCompareSlugs(searchParams), [searchParams])

  useEffect(() => {
    setComparisonSlugs(slugs)
  }, [slugs, setComparisonSlugs])

  useEffect(() => {
    document.title = 'Compare · Mythograph'
  }, [])

  const queries = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: ['comparison-entity', slug],
      queryFn: () => getComparisonEntity(slug),
      enabled: Boolean(slug),
      staleTime: 60_000,
    })),
  })

  const setSlugs = (next: string[]) => {
    navigate(`${ROUTES.COMPARE}${buildCompareSearch(next)}`)
  }

  const handleAdd = (slug: string) => {
    if (!slugs.includes(slug)) {
      setSlugs([...slugs, slug])
    }
  }

  const handleRemove = (slug: string) => {
    setSlugs(slugs.filter((existing) => existing !== slug))
  }

  const loadedColumns = queries.flatMap((query, index) =>
    query.data ? [{ columnIndex: index, data: query.data }] : []
  )

  const sharedConnections = computeSharedConnections(
    loadedColumns.map((column) => column.data.connections),
    loadedColumns.map((column) => column.data.entity.id)
  )
  const sharedEntityIds = new Set(sharedConnections.map((shared) => shared.entity.id))

  const isLoading = queries.some((query) => query.isLoading)
  const missingSlugs = slugs.filter((_, index) => queries[index]?.isError)

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <nav className="mb-6 font-body text-[11px] text-[#777]">
        <Link className="hover:text-ink" to={ROUTES.ENCYCLOPEDIA}>
          Encyclopedia
        </Link>
        <span className="mx-2">/</span>
        <span className="text-ink">Compare</span>
      </nav>

      <header className="flex flex-wrap items-center justify-between gap-3 border-b-0.5 border-black/10 pb-5">
        <h1 className="font-display text-[28px] leading-tight text-ink">Compare</h1>
        <div className="flex flex-wrap items-center gap-2">
          <AddEntityDialog
            onSelect={handleAdd}
            excludeSlugs={slugs}
            disabled={slugs.length >= MAX_COMPARE}
          />
          <CopyLinkButton label="Copy comparison link" />
        </div>
      </header>

      {slugs.length === 0 ? (
        <div className="py-16 text-center">
          <h2 className="font-display text-[18px] text-ink">Nothing to compare yet</h2>
          <p className="mt-3 font-body text-[13px] text-[#666]">
            Add entities with the button above, or open an entity and choose “Compare”.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
            {slugs.map((slug, index) => {
              const query = queries[index]
              if (query?.isLoading) {
                return <ColumnSkeleton key={slug} />
              }
              if (!query?.data) {
                return <MissingColumn key={slug} slug={slug} onRemove={() => handleRemove(slug)} />
              }
              return (
                <ComparisonColumn
                  key={slug}
                  data={query.data}
                  onRemove={() => handleRemove(slug)}
                  canRemove={slugs.length > 1}
                  sharedEntityIds={sharedEntityIds}
                />
              )
            })}
          </div>

          <section className="mt-8">
            <h2 className="font-display text-[16px] text-ink">Shared connections</h2>
            {loadedColumns.length < 2 ? (
              <p className="mt-3 font-body text-[13px] italic text-[#888]">
                Add at least two entities to see the connections they have in common.
              </p>
            ) : sharedConnections.length === 0 ? (
              <p className="mt-3 font-body text-[13px] italic text-[#888]">
                These entities share no documented connections.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {sharedConnections.map((shared) => (
                  <div key={shared.entity.id} className="flex flex-wrap items-center gap-3">
                    <EntityChip
                      name={shared.entity.name}
                      slug={shared.entity.slug}
                      type={shared.entity.type}
                    />
                    <span className="font-body text-[11px] text-[#777]">
                      shared by{' '}
                      {shared.columnIndices
                        .map(
                          (columnIndex) =>
                            loadedColumns.find((column) => column.columnIndex === columnIndex)?.data
                              .entity.name
                        )
                        .filter(Boolean)
                        .join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {!isLoading && missingSlugs.length > 0 ? (
            <p className="mt-6 font-body text-[11px] text-terracotta">
              Could not load: {missingSlugs.join(', ')} — these entities don't exist or aren't
              published.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

const ColumnSkeleton = () => (
  <div className="w-72 shrink-0 space-y-3 rounded-lg border-0.5 border-black/10 bg-white p-4">
    <Skeleton className="h-6 w-40" />
    <Skeleton className="h-4 w-24" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-3/4" />
  </div>
)

const MissingColumn = ({ slug, onRemove }: { slug: string; onRemove: () => void }) => (
  <div className="flex w-72 shrink-0 flex-col justify-between rounded-lg border-0.5 border-dashed border-black/20 bg-white p-4">
    <div>
      <p className="font-display text-[9px] uppercase tracking-label text-[#777]">Not found</p>
      <p className="mt-2 break-words font-body text-[13px] text-[#666]">{slug}</p>
    </div>
    <Button variant="ghost" size="sm" onClick={onRemove} className="mt-4 self-start">
      Remove
    </Button>
  </div>
)

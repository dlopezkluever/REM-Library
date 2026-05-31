import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { ExtractionReviewPanel } from '@/components/admin/ExtractionReviewPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getPendingExtractionReviewSources } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const reviewQueueQueryKey = ['admin', 'review-queue'] as const

export default function AdminReviewQueuePage() {
  const [searchParams] = useSearchParams()
  const requestedSourceId = searchParams.get('source')
  const queryClient = useQueryClient()
  const reviewQueueQuery = useQuery({
    queryKey: reviewQueueQueryKey,
    queryFn: getPendingExtractionReviewSources,
  })
  const groups = useMemo(() => reviewQueueQuery.data ?? [], [reviewQueueQuery.data])
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(requestedSourceId)

  const activeSourceId = requestedSourceId ?? expandedSourceId ?? groups[0]?.source.id ?? null
  const selectedGroup = useMemo(() => {
    return groups.find((group) => group.source.id === activeSourceId) ?? groups[0] ?? null
  }, [activeSourceId, groups])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Review Queue</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Curate pending AI extractions into draft entities and claims.
          </p>
        </div>
        <Button
          disabled={reviewQueueQuery.isFetching}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void reviewQueueQuery.refetch()}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn('h-3.5 w-3.5', reviewQueueQuery.isFetching && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      {reviewQueueQuery.error ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">Review queue could not load.</p>
        </div>
      ) : null}

      <section className="rounded border border-0.5 border-black/[0.09] bg-white">
        <div className="grid grid-cols-[minmax(0,1fr)_120px] border-b border-b-0.5 border-b-black/[0.09] px-4 py-3">
          <p className="font-display text-[8px] uppercase tracking-label text-[#777]">Source</p>
          <p className="text-right font-display text-[8px] uppercase tracking-label text-[#777]">
            Pending
          </p>
        </div>

        {reviewQueueQuery.isLoading ? (
          <div className="px-4 py-5 font-body text-sm text-[#777]">Loading review queue...</div>
        ) : null}

        {!reviewQueueQuery.isLoading && !reviewQueueQuery.error && groups.length === 0 ? (
          <div className="px-4 py-5 font-body text-sm text-[#777]">
            No extractions are awaiting review.
          </div>
        ) : null}

        {groups.map((group) => {
          const expanded = group.source.id === selectedGroup?.source.id

          return (
            <button
              key={group.source.id}
              className={cn(
                'grid w-full grid-cols-[minmax(0,1fr)_120px] items-center border-b border-b-0.5 border-b-black/[0.06] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-black/[0.03]',
                expanded && 'bg-verdigris-light/50'
              )}
              type="button"
              onClick={() => setExpandedSourceId(group.source.id)}
            >
              <div className="flex min-w-0 items-center gap-3">
                {expanded ? (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-verdigris" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#888]" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-body text-sm text-ink">{group.source.title}</p>
                  <p className="font-body text-[11px] text-[#888]">
                    {group.extractions.length} extraction chunks
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Badge>{group.extractions.length}</Badge>
              </div>
            </button>
          )
        })}
      </section>

      {selectedGroup ? (
        <ExtractionReviewPanel
          key={selectedGroup.source.id}
          group={selectedGroup}
          onReviewed={() => {
            void queryClient.invalidateQueries({ queryKey: reviewQueueQueryKey })
            void queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
            void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
            void queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
          }}
        />
      ) : null}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { ExtractionReviewPanel } from '@/components/admin/ExtractionReviewPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getPendingExtractionReviewSource,
  getPendingReviewSourceSummaries,
  type ReviewQueueSort,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const reviewQueueQueryKey = ['admin', 'review-queue', 'sources'] as const

export default function AdminReviewQueuePage() {
  const [searchParams] = useSearchParams()
  const requestedSourceId = searchParams.get('source')
  const queryClient = useQueryClient()
  const [sort, setSort] = useState<ReviewQueueSort>('oldest')
  const reviewQueueQuery = useQuery({
    queryKey: [...reviewQueueQueryKey, sort],
    queryFn: () => getPendingReviewSourceSummaries(0, sort),
  })
  const summaries = useMemo(() => reviewQueueQuery.data ?? [], [reviewQueueQuery.data])
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(requestedSourceId)

  const activeSourceId = requestedSourceId ?? expandedSourceId ?? summaries[0]?.source.id ?? null
  const selectedSummary = useMemo(() => {
    return summaries.find((group) => group.source.id === activeSourceId) ?? summaries[0] ?? null
  }, [activeSourceId, summaries])
  const selectedSourceId = selectedSummary?.source.id ?? activeSourceId
  const selectedSourceQuery = useQuery({
    enabled: Boolean(selectedSourceId),
    queryKey: ['admin', 'review-queue', 'source', selectedSourceId],
    queryFn: () => getPendingExtractionReviewSource(selectedSourceId ?? ''),
  })
  const selectedGroup = selectedSourceQuery.data ?? null

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Review Queue</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Curate pending AI extractions into draft entities and claims.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Sort review queue"
            className="h-8 rounded border border-0.5 border-black/15 bg-white px-3 font-body text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as ReviewQueueSort)
              setExpandedSourceId(null)
            }}
          >
            <option value="oldest">Oldest first</option>
            <option value="most_flagged">Most flagged</option>
            <option value="highest_net_votes">Highest net votes</option>
            <option value="newest">Newest first</option>
          </select>
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

        {!reviewQueueQuery.isLoading && !reviewQueueQuery.error && summaries.length === 0 ? (
          <div className="px-4 py-5 font-body text-sm text-[#777]">
            No extractions are awaiting review.
          </div>
        ) : null}

        {summaries.map((summary) => {
          const expanded = summary.source.id === selectedSourceId

          return (
            <button
              key={summary.source.id}
              className={cn(
                'grid w-full grid-cols-[minmax(0,1fr)_120px] items-center border-b border-b-0.5 border-b-black/[0.06] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-black/[0.03]',
                expanded && 'bg-verdigris-light/50'
              )}
              type="button"
              onClick={() => setExpandedSourceId(summary.source.id)}
            >
              <div className="flex min-w-0 items-center gap-3">
                {expanded ? (
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-verdigris" />
                ) : (
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-[#888]" />
                )}
                <div className="min-w-0">
                  <p className="truncate font-body text-sm text-ink">{summary.source.title}</p>
                  <p className="font-body text-[11px] text-[#888]">
                    {summary.pendingExtractionCount} extraction chunks
                    {summary.validationFailedCount > 0
                      ? ` - ${summary.validationFailedCount} failed validation`
                      : ''}
                    {summary.flagCount > 0 ? ` - ${summary.flagCount} flags` : ''}
                    {summary.communityScore !== 0 ? ` - score ${summary.communityScore}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Badge>{summary.pendingItemCount + summary.validationFailedCount}</Badge>
              </div>
            </button>
          )
        })}
      </section>

      {selectedSourceQuery.isLoading ? (
        <div className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
          <p className="font-body text-sm text-[#777]">Loading selected source...</p>
        </div>
      ) : null}

      {selectedSourceQuery.error ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">
            Selected source review items could not load.
          </p>
        </div>
      ) : null}

      {selectedGroup ? (
        <ExtractionReviewPanel
          key={selectedGroup.source.id}
          group={selectedGroup}
          onReviewed={() => {
            void queryClient.invalidateQueries({ queryKey: reviewQueueQueryKey })
            void queryClient.invalidateQueries({
              queryKey: ['admin', 'review-queue', 'source', selectedGroup.source.id],
            })
            void queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
            void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
            void queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
          }}
        />
      ) : null}
    </div>
  )
}

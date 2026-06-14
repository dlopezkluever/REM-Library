import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Flag, RefreshCw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  dismissFlag,
  getOpenFlags,
  resolveFlag,
  type AdminFlagModerationRow,
} from '@/lib/api/admin'
import type { FlagTargetType } from '@/lib/api/community'
import { formatEnumLabel, truncateText } from '@/lib/format'
import { cn } from '@/lib/utils'

const adminFlagsQueryKey = ['admin', 'flags'] as const

const statusClassNames: Record<string, string> = {
  dismissed: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
  open: 'border-iris/30 bg-iris-light text-iris-dark',
  resolved: 'border-verdigris bg-verdigris-light text-verdigris-dark',
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Flag moderation failed.'

const getTargetUrl = (flag: AdminFlagModerationRow) => {
  if (flag.target_type === 'entity') {
    return flag.targetEntity?.slug ? `/entity/${flag.targetEntity.slug}` : '/admin/entities'
  }

  if (flag.target_type === 'claim') {
    return `/claim/${flag.target_id}`
  }

  if (flag.target_type === 'source') {
    return `/admin/sources/${flag.target_id}`
  }

  return `/admin/comments?status=all`
}

const getTargetLabel = (flag: AdminFlagModerationRow) => {
  if (flag.target_type === 'entity') {
    return flag.targetEntity?.name ?? flag.target_id
  }

  if (flag.target_type === 'claim') {
    return flag.targetClaim?.statement ?? flag.target_id
  }

  if (flag.target_type === 'source') {
    return flag.targetSource?.title ?? flag.target_id
  }

  return flag.target_id
}

export default function AdminFlagQueuePage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<AdminFlagModerationRow['status'] | 'all'>(
    'open'
  )
  const [targetTypeFilter, setTargetTypeFilter] = useState<FlagTargetType | 'all'>('all')
  const flagsQuery = useQuery({
    queryKey: [...adminFlagsQueryKey, page, statusFilter, targetTypeFilter],
    queryFn: () =>
      getOpenFlags(page, {
        status: statusFilter,
        targetType: targetTypeFilter,
      }),
  })
  const flags = flagsQuery.data?.flags ?? []
  const totalCount = flagsQuery.data?.totalCount ?? 0
  const pageSize = flagsQuery.data?.pageSize ?? 50
  const pageCount = Math.max(Math.ceil(totalCount / pageSize), 1)

  const invalidateFlags = async (flag: AdminFlagModerationRow) => {
    await queryClient.invalidateQueries({ queryKey: adminFlagsQueryKey })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'review-queue'] })

    if (flag.target_type === 'claim') {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
    } else if (flag.target_type === 'entity') {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
    } else if (flag.target_type === 'source') {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    } else if (flag.target_type === 'comment') {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] })
    }
  }

  const moderateMutation = useMutation({
    mutationFn: ({
      action,
      flag,
    }: {
      action: 'dismiss' | 'resolve'
      flag: AdminFlagModerationRow
    }) => (action === 'resolve' ? resolveFlag(flag.id) : dismissFlag(flag.id)),
    onSuccess: async (_updatedFlag, variables) => {
      await invalidateFlags(variables.flag)
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Flags</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Review community reports from claims, entities, sources, and comments.
          </p>
        </div>
        <Button
          disabled={flagsQuery.isFetching}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void flagsQuery.refetch()}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn('h-3.5 w-3.5', flagsQuery.isFetching && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      {moderateMutation.error ? (
        <div className="rounded border border-0.5 border-amber-300/60 bg-amber-50 p-4">
          <p className="font-body text-sm text-amber-900">
            {getErrorMessage(moderateMutation.error)}
          </p>
        </div>
      ) : null}

      <section className="rounded border border-0.5 border-black/[0.09] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <select
            aria-label="Filter by status"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as AdminFlagModerationRow['status'] | 'all')
              setPage(0)
            }}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
            <option value="all">All statuses</option>
          </select>
          <select
            aria-label="Filter by target type"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={targetTypeFilter}
            onChange={(event) => {
              setTargetTypeFilter(event.target.value as FlagTargetType | 'all')
              setPage(0)
            }}
          >
            <option value="all">All target types</option>
            <option value="entity">Entities</option>
            <option value="claim">Claims</option>
            <option value="source">Sources</option>
            <option value="comment">Comments</option>
          </select>
        </div>
      </section>

      <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Target</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flagsQuery.isLoading ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={6}>
                  Loading flags...
                </TableCell>
              </TableRow>
            ) : null}
            {flagsQuery.error ? (
              <TableRow>
                <TableCell className="font-body text-sm text-terracotta-dark" colSpan={6}>
                  Flags could not load.
                </TableCell>
              </TableRow>
            ) : null}
            {!flagsQuery.isLoading && !flagsQuery.error && flags.length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={6}>
                  No flags match this view.
                </TableCell>
              </TableRow>
            ) : null}
            {flags.map((flag) => {
              const reporterLabel =
                flag.reporter?.display_name || flag.reporter?.email || 'Unknown reporter'
              const updating =
                moderateMutation.isPending && moderateMutation.variables?.flag.id === flag.id

              return (
                <TableRow key={flag.id}>
                  <TableCell className="max-w-[260px]">
                    <Link
                      className="inline-flex items-center gap-1.5 font-body text-sm text-verdigris hover:text-verdigris-dark"
                      to={getTargetUrl(flag)}
                    >
                      <Flag aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="truncate">{truncateText(getTargetLabel(flag), 80)}</span>
                    </Link>
                    <p className="mt-1 font-body text-[11px] text-[#888]">{flag.target_type}</p>
                  </TableCell>
                  <TableCell className="font-body text-sm text-ink">{reporterLabel}</TableCell>
                  <TableCell>
                    <Badge className="border-terracotta/25 bg-terracotta-light text-terracotta-dark">
                      {formatEnumLabel(flag.reason)}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[320px] font-body text-sm text-[#555]">
                    {flag.notes ? truncateText(flag.notes, 120) : 'None'}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusClassNames[flag.status] ?? ''}>{flag.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        disabled={updating || flag.status !== 'open'}
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => moderateMutation.mutate({ action: 'dismiss', flag })}
                      >
                        <X aria-hidden="true" className="h-3.5 w-3.5" />
                        Dismiss
                      </Button>
                      <Button
                        disabled={updating || flag.status !== 'open'}
                        size="sm"
                        type="button"
                        onClick={() => moderateMutation.mutate({ action: 'resolve', flag })}
                      >
                        <Check aria-hidden="true" className="h-3.5 w-3.5" />
                        Resolve
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-xs text-[#777]">
          {totalCount === 0
            ? 'No matching flags'
            : `Page ${page + 1} of ${pageCount} - ${totalCount} flags`}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={page === 0 || flagsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setPage((current) => Math.max(current - 1, 0))}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button
            disabled={page >= pageCount - 1 || flagsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => setPage((current) => current + 1)}
          >
            Next
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getAdminClaimsPage,
  publishAdminClaims,
  updateAdminClaimStatus,
  type AdminClaimListRow,
  type ContentStatus,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const adminClaimsQueryKey = ['admin', 'claims'] as const

const statusClassNames: Record<ContentStatus, string> = {
  archived: 'border-black/15 bg-stone text-[#777]',
  disputed: 'border-terracotta/30 bg-terracotta-light text-terracotta-dark',
  draft: 'border-iris/30 bg-iris-light text-iris-dark',
  published: 'border-verdigris bg-verdigris-light text-verdigris-dark',
}

const getMutationError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Claim update failed.'
}

export default function AdminClaimManagerPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all')
  const [selectedClaimIds, setSelectedClaimIds] = useState<string[]>([])

  const claimsQuery = useQuery({
    queryKey: [...adminClaimsQueryKey, page, search, statusFilter],
    queryFn: () =>
      getAdminClaimsPage({
        page,
        search,
        status: statusFilter === 'all' ? null : statusFilter,
      }),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ claim, status }: { claim: AdminClaimListRow; status: ContentStatus }) =>
      updateAdminClaimStatus(claim.id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminClaimsQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
    },
  })

  const bulkPublishMutation = useMutation({
    mutationFn: publishAdminClaims,
    onSuccess: async () => {
      setSelectedClaimIds([])
      await queryClient.invalidateQueries({ queryKey: adminClaimsQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
    },
  })

  const claimPage = claimsQuery.data
  const claims = claimPage?.claims ?? []
  const totalCount = claimPage?.totalCount ?? 0
  const pageSize = claimPage?.pageSize ?? 50
  const pageCount = Math.max(Math.ceil(totalCount / pageSize), 1)
  const selectedSet = useMemo(() => new Set(selectedClaimIds), [selectedClaimIds])
  const allVisibleSelected = claims.length > 0 && claims.every((claim) => selectedSet.has(claim.id))
  const actionError = toggleStatusMutation.error ?? bulkPublishMutation.error

  const toggleSelected = (claimId: string) => {
    setSelectedClaimIds((current) =>
      current.includes(claimId)
        ? current.filter((selectedId) => selectedId !== claimId)
        : [...current, claimId]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Claims</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Review draft interpretive claims and control graph publication state.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={claimsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void claimsQuery.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', claimsQuery.isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
          <Button
            disabled={selectedClaimIds.length === 0 || bulkPublishMutation.isPending}
            size="sm"
            type="button"
            onClick={() => bulkPublishMutation.mutate(selectedClaimIds)}
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Publish selected
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">{getMutationError(actionError)}</p>
        </div>
      ) : null}

      <section className="rounded border border-0.5 border-black/[0.09] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]"
            />
            <Input
              className="pl-9"
              placeholder="Search claims"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
                setSelectedClaimIds([])
              }}
            />
          </div>
          <select
            aria-label="Filter by status"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as ContentStatus | 'all')
              setPage(0)
              setSelectedClaimIds([])
            }}
          >
            <option value="all">All active statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="disputed">Disputed</option>
          </select>
        </div>
      </section>

      <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input
                  aria-label="Select all claims"
                  checked={allVisibleSelected}
                  className="h-4 w-4 accent-verdigris"
                  type="checkbox"
                  onChange={(event) =>
                    setSelectedClaimIds(event.target.checked ? claims.map((claim) => claim.id) : [])
                  }
                />
              </TableHead>
              <TableHead>Statement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Entities</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead className="text-right">Publication</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claimsQuery.isLoading ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  Loading claims...
                </TableCell>
              </TableRow>
            ) : null}

            {claimsQuery.error ? (
              <TableRow>
                <TableCell className="font-body text-sm text-terracotta-dark" colSpan={7}>
                  Claims could not load.
                </TableCell>
              </TableRow>
            ) : null}

            {!claimsQuery.isLoading && !claimsQuery.error && claims.length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  No claims match this view.
                </TableCell>
              </TableRow>
            ) : null}

            {claims.map((claim) => {
              const isSelected = selectedSet.has(claim.id)
              const isPublished = claim.status === 'published'
              const nextStatus: ContentStatus = isPublished ? 'draft' : 'published'
              const updating =
                toggleStatusMutation.isPending &&
                toggleStatusMutation.variables?.claim.id === claim.id

              return (
                <TableRow key={claim.id}>
                  <TableCell>
                    <input
                      aria-label={`Select ${claim.statement}`}
                      checked={isSelected}
                      className="h-4 w-4 accent-verdigris"
                      type="checkbox"
                      onChange={() => toggleSelected(claim.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="line-clamp-2 max-w-[420px] font-body text-sm text-ink">
                      {claim.statement}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusClassNames[claim.status]}>{claim.status}</Badge>
                  </TableCell>
                  <TableCell className="font-body text-sm text-ink">
                    {(claim.confidence_override ?? claim.confidence_score).toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate font-body text-sm text-[#777]">
                    {claim.entityNames.length > 0 ? claim.entityNames.join(', ') : 'None'}
                  </TableCell>
                  <TableCell className="font-body text-sm text-ink">
                    {claim.evidenceCount}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        disabled={updating || claim.status === 'disputed'}
                        size="sm"
                        type="button"
                        variant={isPublished ? 'outline' : 'default'}
                        onClick={() => toggleStatusMutation.mutate({ claim, status: nextStatus })}
                      >
                        {isPublished ? 'Set draft' : 'Publish'}
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
            ? 'No matching claims'
            : `Page ${page + 1} of ${pageCount} - ${totalCount} claims`}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={page === 0 || claimsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => Math.max(current - 1, 0))
              setSelectedClaimIds([])
            }}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button
            disabled={page >= pageCount - 1 || claimsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => current + 1)
              setSelectedClaimIds([])
            }}
          >
            Next
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

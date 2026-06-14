import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, MessageSquare, RefreshCw, X } from 'lucide-react'
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
  approveComment,
  getPendingComments,
  rejectComment,
  requestCommentClarification,
  type AdminCommentModerationRow,
} from '@/lib/api/admin'
import type { CommunityTargetType } from '@/lib/api/community'
import { truncateText } from '@/lib/format'
import { cn } from '@/lib/utils'

const adminCommentsQueryKey = ['admin', 'comments'] as const
const commentStatusFilters = ['pending', 'needs_clarification', 'approved', 'rejected', 'all']
const targetTypeFilters = ['entity', 'claim', 'source']

const statusClassNames: Record<string, string> = {
  approved: 'border-verdigris bg-verdigris-light text-verdigris-dark',
  needs_clarification: 'border-amber-300 bg-amber-50 text-amber-800',
  pending: 'border-iris/30 bg-iris-light text-iris-dark',
  rejected: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
}

const getTargetUrl = (comment: AdminCommentModerationRow) => {
  if (comment.target_type === 'entity') {
    return comment.targetEntity?.slug ? `/entity/${comment.targetEntity.slug}` : '/admin/entities'
  }

  if (comment.target_type === 'claim') {
    return `/claim/${comment.target_id}`
  }

  return `/admin/sources/${comment.target_id}`
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Comment moderation failed.'

const getStatusFilter = (value: string | null): AdminCommentModerationRow['status'] | 'all' =>
  commentStatusFilters.includes(value ?? '')
    ? (value as AdminCommentModerationRow['status'] | 'all')
    : 'pending'

const getTargetTypeFilter = (value: string | null): CommunityTargetType | 'all' =>
  targetTypeFilters.includes(value ?? '') ? (value as CommunityTargetType) : 'all'

export default function AdminCommentQueuePage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status')
  const targetTypeParam = searchParams.get('target_type')
  const targetIdParam = searchParams.get('target_id')?.trim() ?? ''
  const [page, setPage] = useState(0)
  const statusFilter = getStatusFilter(statusParam)
  const targetTypeFilter = getTargetTypeFilter(targetTypeParam)
  const targetIdFilter = targetIdParam
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([])
  const [clarifyingComment, setClarifyingComment] = useState<AdminCommentModerationRow | null>(null)
  const [clarificationNote, setClarificationNote] = useState('')
  const [actionResult, setActionResult] = useState<string | null>(null)

  const updateFilters = ({
    status,
    targetId,
    targetType,
  }: {
    status?: AdminCommentModerationRow['status'] | 'all'
    targetId?: string
    targetType?: CommunityTargetType | 'all'
  }) => {
    const nextParams = new URLSearchParams(searchParams)

    if (status !== undefined) {
      nextParams.set('status', status)
    }

    if (targetType !== undefined) {
      if (targetType === 'all') {
        nextParams.delete('target_type')
      } else {
        nextParams.set('target_type', targetType)
      }
    }

    if (targetId !== undefined) {
      const trimmedTargetId = targetId.trim()

      if (trimmedTargetId) {
        nextParams.set('target_id', trimmedTargetId)
      } else {
        nextParams.delete('target_id')
      }
    }

    setSearchParams(nextParams)
    setPage(0)
    setSelectedCommentIds([])
  }

  const commentsQuery = useQuery({
    queryKey: [...adminCommentsQueryKey, page, statusFilter, targetTypeFilter, targetIdFilter],
    queryFn: () =>
      getPendingComments(page, {
        status: statusFilter,
        targetId: targetIdFilter,
        targetType: targetTypeFilter,
      }),
  })

  const invalidateComments = async () => {
    await queryClient.invalidateQueries({ queryKey: adminCommentsQueryKey })
    await queryClient.invalidateQueries({ queryKey: ['comments'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
  }

  const actionMutation = useMutation({
    mutationFn: async ({
      action,
      commentIds,
      note,
    }: {
      action: 'approve' | 'clarify' | 'reject'
      commentIds: string[]
      note?: string
    }) => {
      const results = await Promise.allSettled(
        commentIds.map(async (commentId) => {
          if (action === 'approve') {
            await approveComment(commentId)
          } else if (action === 'reject') {
            await rejectComment(commentId)
          } else {
            await requestCommentClarification(commentId, note ?? '')
          }
          return commentId
        })
      )

      return {
        failed: results.flatMap((result, index) =>
          result.status === 'rejected' ? [commentIds[index]] : []
        ),
        succeeded: results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : []
        ),
      }
    },
    onMutate: () => {
      setActionResult(null)
    },
    onSuccess: async ({ failed, succeeded }) => {
      setSelectedCommentIds(failed)
      setClarifyingComment(null)
      setClarificationNote('')
      await invalidateComments()

      if (failed.length > 0) {
        setActionResult(
          `${succeeded.length} comment${succeeded.length === 1 ? '' : 's'} processed; ${failed.length} failed and remain selected.`
        )
      }
    },
  })

  const pageData = commentsQuery.data
  const comments = pageData?.comments ?? []
  const totalCount = pageData?.totalCount ?? 0
  const pageSize = pageData?.pageSize ?? 50
  const pageCount = Math.max(Math.ceil(totalCount / pageSize), 1)
  const selectedSet = useMemo(() => new Set(selectedCommentIds), [selectedCommentIds])
  const allVisibleSelected =
    comments.length > 0 && comments.every((comment) => selectedSet.has(comment.id))

  const toggleSelected = (commentId: string) => {
    setSelectedCommentIds((current) =>
      current.includes(commentId)
        ? current.filter((selectedId) => selectedId !== commentId)
        : [...current, commentId]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Comments</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Moderate community notes before they become public.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={commentsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void commentsQuery.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', commentsQuery.isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
          <Button
            disabled={selectedCommentIds.length === 0 || actionMutation.isPending}
            size="sm"
            type="button"
            onClick={() =>
              actionMutation.mutate({ action: 'approve', commentIds: selectedCommentIds })
            }
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Approve selected
          </Button>
          <Button
            disabled={selectedCommentIds.length === 0 || actionMutation.isPending}
            size="sm"
            type="button"
            variant="destructive"
            onClick={() =>
              actionMutation.mutate({ action: 'reject', commentIds: selectedCommentIds })
            }
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
            Reject selected
          </Button>
        </div>
      </div>

      {actionMutation.error || actionResult ? (
        <div className="rounded border border-0.5 border-amber-300/60 bg-amber-50 p-4">
          <p className="font-body text-sm text-amber-900">
            {actionResult ?? getErrorMessage(actionMutation.error)}
          </p>
        </div>
      ) : null}

      <section className="rounded border border-0.5 border-black/[0.09] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            aria-label="Filter by status"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={statusFilter}
            onChange={(event) => {
              updateFilters({ status: getStatusFilter(event.target.value) })
            }}
          >
            <option value="pending">Pending</option>
            <option value="needs_clarification">Needs clarification</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All statuses</option>
          </select>
          <select
            aria-label="Filter by target type"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={targetTypeFilter}
            onChange={(event) => {
              updateFilters({
                targetType: getTargetTypeFilter(event.target.value),
              })
            }}
          >
            <option value="all">All target types</option>
            <option value="entity">Entities</option>
            <option value="claim">Claims</option>
            <option value="source">Sources</option>
          </select>
          <input
            aria-label="Filter by target ID"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            placeholder="Target ID"
            value={targetIdFilter}
            onChange={(event) => {
              updateFilters({ targetId: event.target.value })
            }}
          />
          <Button
            disabled={!targetIdFilter}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              updateFilters({ targetId: '' })
            }}
          >
            Clear target
          </Button>
        </div>
      </section>

      <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input
                  aria-label="Select all comments"
                  checked={allVisibleSelected}
                  className="h-4 w-4 accent-verdigris"
                  type="checkbox"
                  onChange={(event) =>
                    setSelectedCommentIds(
                      event.target.checked ? comments.map((comment) => comment.id) : []
                    )
                  }
                />
              </TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Author</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {commentsQuery.isLoading ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  Loading comments...
                </TableCell>
              </TableRow>
            ) : null}
            {commentsQuery.error ? (
              <TableRow>
                <TableCell className="font-body text-sm text-terracotta-dark" colSpan={7}>
                  Comments could not load.
                </TableCell>
              </TableRow>
            ) : null}
            {!commentsQuery.isLoading && !commentsQuery.error && comments.length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  No comments match this view.
                </TableCell>
              </TableRow>
            ) : null}
            {comments.map((comment) => {
              const selected = selectedSet.has(comment.id)
              const authorLabel =
                comment.author?.display_name || comment.author?.email || 'Unknown author'
              const updating =
                actionMutation.isPending &&
                actionMutation.variables?.commentIds.includes(comment.id)

              return (
                <TableRow key={comment.id}>
                  <TableCell>
                    <input
                      aria-label={`Select comment from ${authorLabel}`}
                      checked={selected}
                      className="h-4 w-4 accent-verdigris"
                      type="checkbox"
                      onChange={() => toggleSelected(comment.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      className="inline-flex items-center gap-1.5 font-body text-sm text-verdigris hover:text-verdigris-dark"
                      to={getTargetUrl(comment)}
                    >
                      <MessageSquare aria-hidden="true" className="h-3.5 w-3.5" />
                      {comment.target_type}
                    </Link>
                  </TableCell>
                  <TableCell className="font-body text-sm text-ink">{authorLabel}</TableCell>
                  <TableCell className="font-body text-sm text-[#777]">
                    {new Date(comment.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="max-w-[320px] font-body text-sm text-[#555]">
                    {truncateText(comment.body, 120)}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusClassNames[comment.status] ?? ''}>
                      {comment.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        disabled={updating}
                        size="sm"
                        type="button"
                        onClick={() =>
                          actionMutation.mutate({ action: 'approve', commentIds: [comment.id] })
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        disabled={updating}
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => setClarifyingComment(comment)}
                      >
                        Clarify
                      </Button>
                      <Button
                        disabled={updating}
                        size="sm"
                        type="button"
                        variant="destructive"
                        onClick={() =>
                          actionMutation.mutate({ action: 'reject', commentIds: [comment.id] })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {clarifyingComment ? (
        <section className="rounded border border-0.5 border-amber-300/60 bg-amber-50 p-4">
          <p className="mb-3 font-body text-sm text-amber-900">
            Request clarification for: {truncateText(clarifyingComment.body, 120)}
          </p>
          <textarea
            aria-label="Clarification note"
            className="min-h-28 w-full resize-y rounded border border-0.5 border-black/15 bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            maxLength={1000}
            placeholder="What should the author clarify?"
            value={clarificationNote}
            onChange={(event) => setClarificationNote(event.target.value)}
          />
          <p className="mt-1 font-body text-xs text-amber-800">{clarificationNote.length}/1000</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                setClarifyingComment(null)
                setClarificationNote('')
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={actionMutation.isPending || !clarificationNote.trim()}
              size="sm"
              type="button"
              onClick={() =>
                actionMutation.mutate({
                  action: 'clarify',
                  commentIds: [clarifyingComment.id],
                  note: clarificationNote,
                })
              }
            >
              Send request
            </Button>
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-xs text-[#777]">
          {totalCount === 0
            ? 'No matching comments'
            : `Page ${page + 1} of ${pageCount} - ${totalCount} comments`}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={page === 0 || commentsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => Math.max(current - 1, 0))
              setSelectedCommentIds([])
            }}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button
            disabled={page >= pageCount - 1 || commentsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => current + 1)
              setSelectedCommentIds([])
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

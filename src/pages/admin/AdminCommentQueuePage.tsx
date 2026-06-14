import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, MessageSquare, RefreshCw, X } from 'lucide-react'
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

const statusClassNames: Record<string, string> = {
  approved: 'border-verdigris bg-verdigris-light text-verdigris-dark',
  needs_clarification: 'border-amber-300 bg-amber-50 text-amber-800',
  pending: 'border-iris/30 bg-iris-light text-iris-dark',
  rejected: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
}

const getTargetUrl = (comment: AdminCommentModerationRow) => {
  if (comment.target_type === 'entity') {
    return `/admin/entities?search=${comment.target_id}`
  }

  if (comment.target_type === 'claim') {
    return `/admin/claims?search=${comment.target_id}`
  }

  return `/admin/sources/${comment.target_id}`
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Comment moderation failed.'

export default function AdminCommentQueuePage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const [targetTypeFilter, setTargetTypeFilter] = useState<CommunityTargetType | 'all'>('all')
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([])
  const [clarifyingComment, setClarifyingComment] = useState<AdminCommentModerationRow | null>(null)
  const [clarificationNote, setClarificationNote] = useState('')
  const commentsQuery = useQuery({
    queryKey: [...adminCommentsQueryKey, page, statusFilter, targetTypeFilter],
    queryFn: () =>
      getPendingComments(page, {
        status: statusFilter as AdminCommentModerationRow['status'] | 'all',
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
      for (const commentId of commentIds) {
        if (action === 'approve') {
          await approveComment(commentId)
        } else if (action === 'reject') {
          await rejectComment(commentId)
        } else {
          await requestCommentClarification(commentId, note ?? '')
        }
      }
    },
    onSuccess: async () => {
      setSelectedCommentIds([])
      setClarifyingComment(null)
      setClarificationNote('')
      await invalidateComments()
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

      {actionMutation.error ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">
            {getErrorMessage(actionMutation.error)}
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
              setStatusFilter(event.target.value)
              setPage(0)
              setSelectedCommentIds([])
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
              setTargetTypeFilter(event.target.value as CommunityTargetType | 'all')
              setPage(0)
              setSelectedCommentIds([])
            }}
          >
            <option value="all">All target types</option>
            <option value="entity">Entities</option>
            <option value="claim">Claims</option>
            <option value="source">Sources</option>
          </select>
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
          <Input
            placeholder="What should the author clarify?"
            value={clarificationNote}
            onChange={(event) => setClarificationNote(event.target.value)}
          />
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

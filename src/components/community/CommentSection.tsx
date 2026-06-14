import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, MessageSquare } from 'lucide-react'
import { CommentForm } from '@/components/community/CommentForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  getApprovedComments,
  getOwnCommentsForTarget,
  MAX_COMMENT_LENGTH,
  MIN_COMMENT_LENGTH,
  type ApprovedComment,
  type CommentRow,
  type CommunityTargetType,
  updateOwnPendingComment,
} from '@/lib/api/community'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface CommentSectionProps {
  targetId: string
  targetType: CommunityTargetType
}

const contributorRoles = new Set(['contributor', 'editor', 'super_admin'])
const adminRoles = new Set(['editor', 'super_admin'])

const CommentCard = ({
  comment,
  depth = 0,
  onReply,
}: {
  comment: ApprovedComment
  depth?: number
  onReply?: (comment: ApprovedComment) => void
}) => (
  <div className={cn('rounded border-0.5 border-black/10 bg-white p-4', depth > 0 && 'ml-6')}>
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <p className="font-body text-sm font-semibold text-ink">
        {comment.author_display_name ?? 'Community member'}
      </p>
      {adminRoles.has(comment.author_role) ? (
        <Badge className="border-verdigris/40 bg-verdigris-light text-verdigris-dark">Admin</Badge>
      ) : null}
      <span className="font-body text-xs text-[#888]">
        {new Date(comment.created_at).toLocaleDateString()}
      </span>
    </div>
    <p className="whitespace-pre-line font-body text-sm leading-meta text-[#444]">{comment.body}</p>
    {depth === 0 && onReply ? (
      <button
        className="mt-3 font-body text-xs text-verdigris hover:text-verdigris-dark"
        type="button"
        onClick={() => onReply(comment)}
      >
        Reply
      </button>
    ) : null}
  </div>
)

const getStatusBadge = (status: CommentRow['status']) => {
  if (status === 'needs_clarification') {
    return {
      className: 'border-amber-300 bg-amber-100 text-amber-800',
      label: 'Needs clarification',
    }
  }

  if (status === 'rejected') {
    return {
      className: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
      label: 'Rejected',
    }
  }

  return {
    className: 'border-iris/30 bg-iris-light text-iris-dark',
    label: 'Awaiting review',
  }
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Comment could not be updated.'

const OwnCommentCard = ({
  comment,
  depth = 0,
  onUpdated,
}: {
  comment: CommentRow
  depth?: number
  onUpdated: (comment: CommentRow) => void
}) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const trimmedLength = draft.trim().length
  const badge = getStatusBadge(comment.status)
  const updateMutation = useMutation({
    mutationFn: () => updateOwnPendingComment(comment.id, draft),
    onSuccess: (updatedComment) => {
      setEditing(false)
      setDraft(updatedComment.body)
      onUpdated(updatedComment)
    },
  })

  return (
    <div
      className={cn('rounded border-0.5 border-amber-300/70 bg-amber-50 p-4', depth > 0 && 'ml-6')}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="font-body text-sm font-semibold text-ink">You</p>
        <Badge className={badge.className}>{badge.label}</Badge>
        <span className="font-body text-xs text-[#888]">
          {new Date(comment.created_at).toLocaleDateString()}
        </span>
      </div>

      {editing ? (
        <div className="grid gap-3">
          <textarea
            aria-label="Revise community note"
            className="min-h-28 w-full resize-y rounded border border-0.5 border-black/15 bg-white px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            maxLength={MAX_COMMENT_LENGTH}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-body text-xs text-[#777]">
              {draft.length}/{MAX_COMMENT_LENGTH}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft(comment.body)
                  setEditing(false)
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  updateMutation.isPending ||
                  trimmedLength < MIN_COMMENT_LENGTH ||
                  trimmedLength > MAX_COMMENT_LENGTH
                }
                size="sm"
                type="button"
                onClick={() => updateMutation.mutate()}
              >
                Resubmit
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-line font-body text-sm leading-meta text-[#444]">
          {comment.body}
        </p>
      )}

      {comment.reviewer_note ? (
        <p className="mt-3 rounded border-0.5 border-amber-300/70 bg-white px-3 py-2 font-body text-xs text-amber-800">
          Admin requested clarification: {comment.reviewer_note}
        </p>
      ) : null}

      {comment.status === 'needs_clarification' && !editing ? (
        <Button
          className="mt-3"
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setEditing(true)}
        >
          Revise note
        </Button>
      ) : null}

      {updateMutation.error ? (
        <p className="mt-3 font-body text-sm text-terracotta-dark">
          {getErrorMessage(updateMutation.error)}
        </p>
      ) : null}
    </div>
  )
}

export const CommentSection = ({ targetId, targetType }: CommentSectionProps) => {
  const queryClient = useQueryClient()
  const { role, user } = useAuth()
  const [replyTarget, setReplyTarget] = useState<ApprovedComment | null>(null)
  const [expanded, setExpanded] = useState(true)
  const canComment = Boolean(user && role && contributorRoles.has(role))
  const approvedQueryKey = ['comments', targetType, targetId, 'approved'] as const
  const ownQueryKey = ['comments', targetType, targetId, 'own'] as const

  const approvedQuery = useQuery({
    queryKey: approvedQueryKey,
    queryFn: () => getApprovedComments(targetType, targetId),
    staleTime: 60_000,
  })

  const ownQuery = useQuery({
    enabled: Boolean(user),
    queryKey: ownQueryKey,
    queryFn: () => getOwnCommentsForTarget(targetType, targetId),
    staleTime: 15_000,
  })

  const approvedComments = useMemo(() => approvedQuery.data ?? [], [approvedQuery.data])
  const ownComments = useMemo(
    () => (ownQuery.data ?? []).filter((comment) => comment.status !== 'approved'),
    [ownQuery.data]
  )
  const grouped = useMemo(() => {
    const repliesByParent = new Map<string, ApprovedComment[]>()
    const topLevel: ApprovedComment[] = []
    const approvedIds = new Set(approvedComments.map((comment) => comment.id))
    const ownRepliesByParent = new Map<string, CommentRow[]>()
    const ownFallbackComments: CommentRow[] = []

    approvedComments.forEach((comment) => {
      if (comment.parent_id) {
        const replies = repliesByParent.get(comment.parent_id) ?? []
        replies.push(comment)
        repliesByParent.set(comment.parent_id, replies)
      } else {
        topLevel.push(comment)
      }
    })

    ownComments.forEach((comment) => {
      if (comment.parent_id && approvedIds.has(comment.parent_id)) {
        const replies = ownRepliesByParent.get(comment.parent_id) ?? []
        replies.push(comment)
        ownRepliesByParent.set(comment.parent_id, replies)
      } else {
        ownFallbackComments.push(comment)
      }
    })

    return { ownFallbackComments, ownRepliesByParent, repliesByParent, topLevel }
  }, [approvedComments, ownComments])

  const handleSubmitted = (comment: CommentRow) => {
    queryClient.setQueryData<CommentRow[]>(ownQueryKey, (current = []) => [...current, comment])
    void queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] })
  }

  const handleOwnCommentUpdated = (comment: CommentRow) => {
    queryClient.setQueryData<CommentRow[]>(ownQueryKey, (current = []) =>
      current.map((currentComment) => (currentComment.id === comment.id ? comment : currentComment))
    )
    void queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] })
  }

  return (
    <section className="border-t-0.5 border-black/10 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          className="inline-flex items-center gap-2 font-display text-[11px] uppercase tracking-label text-ink"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <ChevronDown aria-hidden="true" className="h-4 w-4 text-verdigris" />
          ) : (
            <ChevronRight aria-hidden="true" className="h-4 w-4 text-verdigris" />
          )}
          <MessageSquare aria-hidden="true" className="h-4 w-4 text-verdigris" />
          Community Notes
          <Badge>{approvedComments.length}</Badge>
        </button>
      </div>

      {expanded ? (
        <>
          {approvedQuery.isLoading ? (
            <p className="font-body text-sm text-[#777]">Loading community notes...</p>
          ) : null}

          {approvedQuery.error ? (
            <p className="font-body text-sm text-terracotta-dark">
              Community notes could not load.
            </p>
          ) : null}

          {grouped.topLevel.length > 0 ? (
            <div className="grid gap-3">
              {grouped.topLevel.map((comment) => (
                <div key={comment.id} className="grid gap-2">
                  <CommentCard
                    comment={comment}
                    onReply={canComment ? setReplyTarget : undefined}
                  />
                  {(grouped.repliesByParent.get(comment.id) ?? []).map((reply) => (
                    <CommentCard key={reply.id} comment={reply} depth={1} />
                  ))}
                  {(grouped.ownRepliesByParent.get(comment.id) ?? []).map((reply) => (
                    <OwnCommentCard
                      key={reply.id}
                      comment={reply}
                      depth={1}
                      onUpdated={handleOwnCommentUpdated}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : !approvedQuery.isLoading ? (
            <p className="font-body text-sm text-[#777]">No community notes yet.</p>
          ) : null}

          {grouped.ownFallbackComments.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {grouped.ownFallbackComments.map((comment) => (
                <OwnCommentCard
                  key={comment.id}
                  comment={comment}
                  onUpdated={handleOwnCommentUpdated}
                />
              ))}
            </div>
          ) : null}

          {canComment ? (
            <div className="mt-4">
              <CommentForm
                parentAuthorName={replyTarget?.author_display_name}
                parentId={replyTarget?.id ?? null}
                targetId={targetId}
                targetType={targetType}
                onCancelReply={() => setReplyTarget(null)}
                onSubmitted={handleSubmitted}
              />
            </div>
          ) : user ? null : (
            <p className="mt-4 font-body text-sm text-[#777]">
              Sign in to submit a community note.
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}

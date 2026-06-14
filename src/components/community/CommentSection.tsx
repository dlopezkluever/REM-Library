import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { CommentForm } from '@/components/community/CommentForm'
import { Badge } from '@/components/ui/badge'
import {
  getApprovedComments,
  getOwnCommentsForTarget,
  type ApprovedComment,
  type CommentRow,
  type CommunityTargetType,
} from '@/lib/api/community'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface CommentSectionProps {
  targetId: string
  targetType: CommunityTargetType
}

const contributorRoles = new Set(['contributor', 'viewer', 'editor', 'super_admin'])
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
        <Badge className="border-verdigris/40 bg-verdigris-light text-verdigris-dark">
          Admin
        </Badge>
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

const OwnCommentCard = ({ comment }: { comment: CommentRow }) => (
  <div className="rounded border-0.5 border-amber-300/70 bg-amber-50 p-4">
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <p className="font-body text-sm font-semibold text-ink">You</p>
      <Badge className="border-amber-300 bg-amber-100 text-amber-800">
        {comment.status === 'needs_clarification' ? 'Needs clarification' : 'Awaiting review'}
      </Badge>
      <span className="font-body text-xs text-[#888]">
        {new Date(comment.created_at).toLocaleDateString()}
      </span>
    </div>
    <p className="whitespace-pre-line font-body text-sm leading-meta text-[#444]">{comment.body}</p>
    {comment.reviewer_note ? (
      <p className="mt-3 rounded border-0.5 border-amber-300/70 bg-white px-3 py-2 font-body text-xs text-amber-800">
        Admin requested clarification: {comment.reviewer_note}
      </p>
    ) : null}
  </div>
)

export const CommentSection = ({ targetId, targetType }: CommentSectionProps) => {
  const queryClient = useQueryClient()
  const { role, user } = useAuth()
  const [replyTarget, setReplyTarget] = useState<ApprovedComment | null>(null)
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

    approvedComments.forEach((comment) => {
      if (comment.parent_id) {
        const replies = repliesByParent.get(comment.parent_id) ?? []
        replies.push(comment)
        repliesByParent.set(comment.parent_id, replies)
      } else {
        topLevel.push(comment)
      }
    })

    return { repliesByParent, topLevel }
  }, [approvedComments])

  const handleSubmitted = (comment: CommentRow) => {
    queryClient.setQueryData<CommentRow[]>(ownQueryKey, (current = []) => [...current, comment])
    void queryClient.invalidateQueries({ queryKey: ['admin', 'comments'] })
  }

  if (!user && approvedComments.length === 0 && !approvedQuery.isLoading) {
    return null
  }

  return (
    <section className="border-t-0.5 border-black/10 py-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 font-display text-[11px] uppercase tracking-label text-ink">
          <MessageSquare aria-hidden="true" className="h-4 w-4 text-verdigris" />
          Community Notes ({approvedComments.length})
        </h2>
      </div>

      {approvedQuery.isLoading ? (
        <p className="font-body text-sm text-[#777]">Loading community notes...</p>
      ) : null}

      {approvedQuery.error ? (
        <p className="font-body text-sm text-terracotta-dark">Community notes could not load.</p>
      ) : null}

      {grouped.topLevel.length > 0 ? (
        <div className="grid gap-3">
          {grouped.topLevel.map((comment) => (
            <div key={comment.id} className="grid gap-2">
              <CommentCard comment={comment} onReply={canComment ? setReplyTarget : undefined} />
              {(grouped.repliesByParent.get(comment.id) ?? []).map((reply) => (
                <CommentCard key={reply.id} comment={reply} depth={1} />
              ))}
            </div>
          ))}
        </div>
      ) : !approvedQuery.isLoading ? (
        <p className="font-body text-sm text-[#777]">No approved community notes yet.</p>
      ) : null}

      {ownComments.length > 0 ? (
        <div className="mt-4 grid gap-3">
          {ownComments.map((comment) => (
            <OwnCommentCard key={comment.id} comment={comment} />
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
        <p className="mt-4 font-body text-sm text-[#777]">Sign in to submit a community note.</p>
      )}
    </section>
  )
}

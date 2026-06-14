import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  MAX_COMMENT_LENGTH,
  MIN_COMMENT_LENGTH,
  submitComment,
  type CommentRow,
  type CommunityTargetType,
} from '@/lib/api/community'

interface CommentFormProps {
  parentAuthorName?: string | null
  parentId?: string | null
  targetId: string
  targetType: CommunityTargetType
  onSubmitted: (comment: CommentRow) => void
  onCancelReply?: () => void
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Comment could not be submitted.'

export const CommentForm = ({
  parentAuthorName,
  parentId = null,
  targetId,
  targetType,
  onSubmitted,
  onCancelReply,
}: CommentFormProps) => {
  const [body, setBody] = useState('')
  const trimmedLength = body.trim().length
  const submitMutation = useMutation({
    mutationFn: () => submitComment({ body, parentId, targetId, targetType }),
    onSuccess: (comment) => {
      setBody('')
      onSubmitted(comment)
      onCancelReply?.()
    },
  })

  return (
    <form
      className="rounded border-0.5 border-black/10 bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault()
        submitMutation.mutate()
      }}
    >
      {parentId ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-body text-xs text-[#666]">
            Reply to {parentAuthorName || 'this note'}
          </p>
          <Button size="sm" type="button" variant="ghost" onClick={onCancelReply}>
            Cancel
          </Button>
        </div>
      ) : null}
      <textarea
        aria-label="Community note"
        className="min-h-28 w-full resize-y rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Add a community note"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-xs text-[#777]">
          {body.length}/{MAX_COMMENT_LENGTH}
        </p>
        <Button
          disabled={
            submitMutation.isPending ||
            trimmedLength < MIN_COMMENT_LENGTH ||
            trimmedLength > MAX_COMMENT_LENGTH
          }
          size="sm"
          type="submit"
        >
          Submit for review
        </Button>
      </div>
      {submitMutation.error ? (
        <p className="mt-3 font-body text-sm text-terracotta-dark">
          {getErrorMessage(submitMutation.error)}
        </p>
      ) : null}
    </form>
  )
}

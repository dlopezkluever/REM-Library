import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import {
  castVote,
  getCommunityScore,
  getUserVote,
  removeVote,
  type CommunityScore,
  type CommunityTargetType,
  type VoteValue,
} from '@/lib/api/community'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface VoteWidgetProps {
  compact?: boolean
  targetId: string
  targetType: CommunityTargetType
}

const emptyScore: CommunityScore = {
  community_score: 0,
  downvote_count: 0,
  total_votes: 0,
  upvote_count: 0,
}

const getNextScore = (
  score: CommunityScore,
  previousVote: VoteValue | null,
  nextVote: VoteValue | null
): CommunityScore => {
  let next = { ...score }

  if (previousVote === 1) {
    next = {
      ...next,
      community_score: next.community_score - 1,
      total_votes: Math.max(0, next.total_votes - 1),
      upvote_count: Math.max(0, next.upvote_count - 1),
    }
  }

  if (previousVote === -1) {
    next = {
      ...next,
      community_score: next.community_score + 1,
      downvote_count: Math.max(0, next.downvote_count - 1),
      total_votes: Math.max(0, next.total_votes - 1),
    }
  }

  if (nextVote === 1) {
    next = {
      ...next,
      community_score: next.community_score + 1,
      total_votes: next.total_votes + 1,
      upvote_count: next.upvote_count + 1,
    }
  }

  if (nextVote === -1) {
    next = {
      ...next,
      community_score: next.community_score - 1,
      downvote_count: next.downvote_count + 1,
      total_votes: next.total_votes + 1,
    }
  }

  return next
}

export const VoteWidget = ({ compact = false, targetId, targetType }: VoteWidgetProps) => {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const scoreQueryKey = ['community-score', targetType, targetId] as const
  const voteQueryKey = ['user-vote', targetType, targetId] as const
  const scoreQuery = useQuery({
    queryKey: scoreQueryKey,
    queryFn: () => getCommunityScore(targetType, targetId),
    staleTime: 30_000,
  })
  const voteQuery = useQuery({
    enabled: Boolean(user),
    queryKey: voteQueryKey,
    queryFn: () => getUserVote(targetType, targetId),
    staleTime: 30_000,
  })
  const [optimisticScore, setOptimisticScore] = useState<CommunityScore | null>(null)
  const [optimisticVote, setOptimisticVote] = useState<VoteValue | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const score = optimisticScore ?? scoreQuery.data ?? emptyScore
  const vote = optimisticVote !== undefined ? optimisticVote : voteQuery.data ?? null

  const voteMutation = useMutation({
    mutationFn: async (nextVote: VoteValue | null) => {
      if (nextVote === null) {
        await removeVote(targetType, targetId)
      } else {
        await castVote(targetType, targetId, nextVote)
      }
    },
    onError: (mutationError, _nextVote, context: { previousScore: CommunityScore; previousVote: VoteValue | null } | undefined) => {
      setOptimisticScore(context?.previousScore ?? null)
      setOptimisticVote(context?.previousVote)
      setError(mutationError instanceof Error ? mutationError.message : 'Vote could not be saved.')
    },
    onMutate: async (nextVote) => {
      setError(null)
      await queryClient.cancelQueries({ queryKey: scoreQueryKey })
      await queryClient.cancelQueries({ queryKey: voteQueryKey })
      const previousScore = score
      const previousVote = vote
      setOptimisticScore(getNextScore(score, vote, nextVote))
      setOptimisticVote(nextVote)

      return { previousScore, previousVote }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: scoreQueryKey })
      await queryClient.invalidateQueries({ queryKey: voteQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
      setOptimisticScore(null)
      setOptimisticVote(undefined)
    },
  })

  const handleVote = (value: VoteValue) => {
    if (!user) {
      return
    }

    voteMutation.mutate(vote === value ? null : value)
  }

  if (compact) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded border-0.5 border-black/10 bg-white px-2 py-1 font-body text-xs text-[#666]">
        <ThumbsUp aria-hidden="true" className="h-3 w-3 text-verdigris" />
        Community {score.community_score}
      </div>
    )
  }

  return (
    <div>
      <div className="inline-flex items-center overflow-hidden rounded border-0.5 border-black/10 bg-white">
        <button
          aria-label="Upvote"
          className={cn(
            'inline-flex h-9 items-center gap-1.5 border-r-0.5 border-black/10 px-3 font-body text-xs transition-colors',
            vote === 1 ? 'bg-verdigris-light text-verdigris-dark' : 'text-[#666] hover:text-ink'
          )}
          disabled={!user || voteMutation.isPending}
          title={!user ? 'Sign in to vote' : undefined}
          type="button"
          onClick={() => handleVote(1)}
        >
          <ThumbsUp aria-hidden="true" className="h-3.5 w-3.5" />
          {score.upvote_count}
        </button>
        <div className="min-w-14 px-3 text-center font-display text-[10px] uppercase tracking-label text-ink">
          {score.community_score}
        </div>
        <button
          aria-label="Downvote"
          className={cn(
            'inline-flex h-9 items-center gap-1.5 border-l-0.5 border-black/10 px-3 font-body text-xs transition-colors',
            vote === -1 ? 'bg-terracotta-light text-terracotta-dark' : 'text-[#666] hover:text-ink'
          )}
          disabled={!user || voteMutation.isPending}
          title={!user ? 'Sign in to vote' : undefined}
          type="button"
          onClick={() => handleVote(-1)}
        >
          <ThumbsDown aria-hidden="true" className="h-3.5 w-3.5" />
          {score.downvote_count}
        </button>
      </div>
      {scoreQuery.isError ? (
        <p className="mt-2 font-body text-xs text-terracotta-dark">Community score unavailable.</p>
      ) : null}
      {error ? <p className="mt-2 font-body text-xs text-terracotta-dark">{error}</p> : null}
    </div>
  )
}

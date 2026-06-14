import { supabase } from '@/lib/supabase/client'
import type { Enums, Tables, TablesInsert } from '@/types/database'

// Targets that accept comments and votes. Flags additionally accept 'comment'.
export type CommunityTargetType = 'entity' | 'claim' | 'source'
export type FlagTargetType = CommunityTargetType | 'comment'

export type CommentRow = Tables<'comments'>
export type ContentVoteRow = Tables<'content_votes'>
export type ContentFlagRow = Tables<'content_flags'>

export type FlagReason =
  | 'factually_incorrect'
  | 'spam'
  | 'inappropriate'
  | 'duplicate'
  | 'needs_source'
  | 'other'

export type VoteValue = 1 | -1

// An approved comment enriched with its author's public display name and role.
export interface ApprovedComment {
  author_display_name: string | null
  author_id: string
  author_role: Enums<'admin_role'>
  body: string
  created_at: string
  id: string
  parent_id: string | null
  target_id: string
  target_type: string
  updated_at: string
}

export interface CommunityScore {
  community_score: number
  downvote_count: number
  total_votes: number
  upvote_count: number
}

export interface SubmitCommentInput {
  body: string
  parentId?: string | null
  targetId: string
  targetType: CommunityTargetType
}

export const MAX_COMMENT_LENGTH = 2000
export const MIN_COMMENT_LENGTH = 10
// Risk R2: cap how many comments a single user can leave awaiting moderation.
export const MAX_PENDING_COMMENTS = 5
const PENDING_COMMENT_STATUSES = ['pending', 'needs_clarification'] as const
export const PENDING_COMMENT_LIMIT_MESSAGE = `You have ${MAX_PENDING_COMMENTS} comments awaiting review or clarification. Please resolve clarification requests or wait for moderation before adding more.`

export const FLAG_REASONS: { label: string; value: FlagReason }[] = [
  { label: 'Factually incorrect', value: 'factually_incorrect' },
  { label: 'Spam', value: 'spam' },
  { label: 'Inappropriate', value: 'inappropriate' },
  { label: 'Duplicate', value: 'duplicate' },
  { label: 'Needs a source', value: 'needs_source' },
  { label: 'Other', value: 'other' },
]

const requireUser = async () => {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new Error('Sign in to continue.')
  }

  return data.user
}

const EMPTY_SCORE: CommunityScore = {
  community_score: 0,
  downvote_count: 0,
  total_votes: 0,
  upvote_count: 0,
}

const getErrorMessage = (error: unknown) =>
  error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
    ? error.message
    : null

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

// Approved comments for a target, including author display name (via a definer
// RPC because profiles RLS hides other users' rows from the public).
export const getApprovedComments = async (
  targetType: CommunityTargetType,
  targetId: string
): Promise<ApprovedComment[]> => {
  const { data, error } = await supabase.rpc('get_approved_comments', {
    p_target_id: targetId,
    p_target_type: targetType,
  })

  if (error) {
    throw error
  }

  return data ?? []
}

// The signed-in user's own comments on a target (any status), so they can see
// their pending submissions and any clarification requests from admins.
export const getOwnCommentsForTarget = async (
  targetType: CommunityTargetType,
  targetId: string
): Promise<CommentRow[]> => {
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return []
  }

  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('author_id', userData.user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return data
}

export const getMyPendingCommentCount = async (): Promise<number> => {
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return 0
  }

  const { count, error } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', userData.user.id)
    .in('status', [...PENDING_COMMENT_STATUSES])

  if (error) {
    throw error
  }

  return count ?? 0
}

export const submitComment = async (input: SubmitCommentInput): Promise<CommentRow> => {
  const user = await requireUser()

  if (!user.email_confirmed_at) {
    throw new Error('Verify your email address before commenting.')
  }

  const body = input.body.trim()

  if (body.length < MIN_COMMENT_LENGTH) {
    throw new Error(`Comments must be at least ${MIN_COMMENT_LENGTH} characters.`)
  }

  if (body.length > MAX_COMMENT_LENGTH) {
    throw new Error(`Comments are limited to ${MAX_COMMENT_LENGTH} characters.`)
  }

  const pendingCount = await getMyPendingCommentCount()

  if (pendingCount >= MAX_PENDING_COMMENTS) {
    throw new Error(PENDING_COMMENT_LIMIT_MESSAGE)
  }

  if (input.parentId) {
    const { data: parent, error: parentError } = await supabase
      .from('comments')
      .select('parent_id, target_id, target_type')
      .eq('id', input.parentId)
      .single()

    if (parentError) {
      throw parentError
    }

    if (parent.parent_id) {
      throw new Error('Replies cannot be nested more than one level.')
    }

    if (parent.target_id !== input.targetId || parent.target_type !== input.targetType) {
      throw new Error('Reply target must match the parent comment.')
    }
  }

  const row: TablesInsert<'comments'> = {
    author_id: user.id,
    body,
    parent_id: input.parentId ?? null,
    status: 'pending',
    target_id: input.targetId,
    target_type: input.targetType,
  }

  const { data, error } = await supabase.from('comments').insert(row).select('*').single()

  if (error) {
    if (getErrorMessage(error)?.includes('comments awaiting review or clarification')) {
      throw new Error(PENDING_COMMENT_LIMIT_MESSAGE)
    }

    throw error
  }

  return data
}

export const updateOwnPendingComment = async (
  commentId: string,
  body: string
): Promise<CommentRow> => {
  await requireUser()
  const trimmed = body.trim()

  if (trimmed.length < MIN_COMMENT_LENGTH || trimmed.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comments must be between ${MIN_COMMENT_LENGTH} and ${MAX_COMMENT_LENGTH} characters.`
    )
  }

  const { data, error } = await supabase.rpc('update_own_comment_body', {
    p_body: trimmed,
    p_comment_id: commentId,
  })

  if (error) {
    throw error
  }

  return data
}

// ---------------------------------------------------------------------------
// Votes
// ---------------------------------------------------------------------------

export const getCommunityScore = async (
  targetType: CommunityTargetType,
  targetId: string
): Promise<CommunityScore> => {
  const { data, error } = await supabase
    .from('community_scores')
    .select('community_score, upvote_count, downvote_count, total_votes')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return { ...EMPTY_SCORE }
  }

  return {
    community_score: data.community_score ?? 0,
    downvote_count: data.downvote_count ?? 0,
    total_votes: data.total_votes ?? 0,
    upvote_count: data.upvote_count ?? 0,
  }
}

export const getUserVote = async (
  targetType: CommunityTargetType,
  targetId: string
): Promise<VoteValue | null> => {
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return null
  }

  const { data, error } = await supabase
    .from('content_votes')
    .select('value')
    .eq('user_id', userData.user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return (data?.value as VoteValue | undefined) ?? null
}

export const castVote = async (
  targetType: CommunityTargetType,
  targetId: string,
  value: VoteValue
): Promise<void> => {
  const user = await requireUser()

  const { error } = await supabase.from('content_votes').upsert(
    {
      target_id: targetId,
      target_type: targetType,
      user_id: user.id,
      value,
    },
    { onConflict: 'user_id,target_type,target_id' }
  )

  if (error) {
    throw error
  }
}

export const removeVote = async (
  targetType: CommunityTargetType,
  targetId: string
): Promise<void> => {
  const user = await requireUser()

  const { error } = await supabase
    .from('content_votes')
    .delete()
    .eq('user_id', user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)

  if (error) {
    throw error
  }
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

export const submitFlag = async (
  targetType: FlagTargetType,
  targetId: string,
  reason: FlagReason,
  notes?: string | null
): Promise<ContentFlagRow> => {
  const user = await requireUser()
  const trimmedNotes = notes?.trim() || null

  if (trimmedNotes && trimmedNotes.length > 500) {
    throw new Error('Flag notes are limited to 500 characters.')
  }

  const row: TablesInsert<'content_flags'> = {
    notes: trimmedNotes,
    reason,
    reporter_id: user.id,
    status: 'open',
    target_id: targetId,
    target_type: targetType,
  }

  const { data, error } = await supabase.from('content_flags').insert(row).select('*').single()

  if (error) {
    throw error
  }

  return data
}

export const getUserFlag = async (
  targetType: FlagTargetType,
  targetId: string
): Promise<ContentFlagRow | null> => {
  const { data: userData } = await supabase.auth.getUser()

  if (!userData.user) {
    return null
  }

  const { data, error } = await supabase
    .from('content_flags')
    .select('*')
    .eq('reporter_id', userData.user.id)
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .eq('status', 'open')
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

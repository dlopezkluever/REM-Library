import { supabase } from '@/lib/supabase/client'
import type { Enums, Tables, TablesInsert } from '@/types/database'

export type SuggestionType = Enums<'suggestion_type'>
export type SuggestionRow = Tables<'suggestions'>

export interface SubmitSuggestionInput {
  reason?: string | null
  suggestionText: string
  targetClaimId?: string | null
  targetEntityId?: string | null
  type: SuggestionType
}

export const submitSuggestion = async (input: SubmitSuggestionInput): Promise<SuggestionRow> => {
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    throw new Error('Sign in to submit a suggestion.')
  }

  if (!userData.user.email_confirmed_at) {
    throw new Error('Verify your email address before submitting suggestions.')
  }

  const suggestionText = input.suggestionText.trim()

  if (!suggestionText) {
    throw new Error('Suggestion text is required.')
  }

  if (suggestionText.length > 1000) {
    throw new Error('Suggestions are limited to 1000 characters.')
  }

  const row: TablesInsert<'suggestions'> = {
    reason: input.reason?.trim() || null,
    status: 'pending',
    submitter_id: userData.user.id,
    suggestion_text: suggestionText,
    target_claim_id: input.targetClaimId ?? null,
    target_entity_id: input.targetEntityId ?? null,
    type: input.type,
  }

  const { data, error } = await supabase.from('suggestions').insert(row).select('*').single()

  if (error) {
    throw error
  }

  return data
}

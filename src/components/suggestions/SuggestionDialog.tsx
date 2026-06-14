import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ROUTES } from '@/constants/routes'
import { getErrorMessage } from '@/lib/format'
import { useAuth } from '@/hooks/useAuth'
import { submitSuggestion, type SuggestionType } from '@/lib/api/suggestions'

interface SuggestionDialogProps {
  open: boolean
  reasonLabel?: string
  suggestionLabel: string
  targetClaimId?: string
  targetEntityId?: string
  targetLabel: string
  title: string
  type: SuggestionType
  onOpenChange: (open: boolean) => void
}

export const SuggestionDialog = ({
  open,
  reasonLabel = 'Context',
  suggestionLabel,
  targetClaimId,
  targetEntityId,
  targetLabel,
  title,
  type,
  onOpenChange,
}: SuggestionDialogProps) => {
  const { user } = useAuth()
  const [suggestionText, setSuggestionText] = useState('')
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      submitSuggestion({
        reason,
        suggestionText,
        targetClaimId,
        targetEntityId,
        type,
      }),
    onSuccess: () => {
      setSuggestionText('')
      setReason('')
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{targetLabel}</DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="mt-4 rounded border border-0.5 border-black/10 bg-stone p-4">
            <p className="font-body text-sm text-[#666]">Sign in before submitting suggestions.</p>
            <Link className="mt-3 inline-flex font-body text-sm text-verdigris" to={ROUTES.REGISTER}>
              Create account
            </Link>
          </div>
        ) : !user.email_confirmed_at ? (
          <p className="mt-4 rounded border border-amber-300/70 bg-amber-50 p-3 font-body text-sm text-amber-900">
            Verify your email address before submitting suggestions.
          </p>
        ) : mutation.isSuccess ? (
          <div className="mt-4 space-y-4">
            <p className="rounded border border-verdigris/30 bg-verdigris-light p-3 font-body text-sm text-verdigris-dark">
              Suggestion submitted for review.
            </p>
            <div className="flex justify-end">
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block font-body text-sm text-ink">{suggestionLabel}</span>
              <textarea
                required
                className="min-h-28 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                maxLength={1000}
                value={suggestionText}
                onChange={(event) => setSuggestionText(event.target.value)}
              />
              <span className="mt-1 block text-right font-body text-xs text-[#888]">
                {suggestionText.length}/1000
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-body text-sm text-ink">{reasonLabel}</span>
              <textarea
                className="min-h-20 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {mutation.error ? (
              <p className="font-body text-sm text-terracotta-dark">
                {getErrorMessage(mutation.error)}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={mutation.isPending} type="submit">
                {mutation.isPending ? 'Submitting' : 'Submit'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

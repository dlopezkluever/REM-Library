import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FLAG_REASONS,
  getUserFlag,
  submitFlag,
  type FlagReason,
  type FlagTargetType,
} from '@/lib/api/community'
import { canContributeToCommunity } from '@/lib/communityRoles'
import { useAuth } from '@/hooks/useAuth'

interface FlagButtonProps {
  targetId: string
  targetType: FlagTargetType
}

const getFlagError = (error: unknown) => {
  if (error instanceof Error) {
    if (error.message.includes('duplicate key')) {
      return 'You have already flagged this item.'
    }

    return error.message
  }

  return 'Flag could not be submitted.'
}

const getTargetAdminQueryKeys = (targetType: FlagTargetType) => {
  if (targetType === 'claim') {
    return [['admin', 'claims'] as const]
  }

  if (targetType === 'entity') {
    return [['admin', 'entities'] as const]
  }

  if (targetType === 'source') {
    return [['admin', 'source-list'] as const, ['admin', 'sources'] as const]
  }

  return [['admin', 'comments'] as const]
}

export const FlagButton = ({ targetId, targetType }: FlagButtonProps) => {
  const { role, user } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<FlagReason>('factually_incorrect')
  const [notes, setNotes] = useState('')
  const flagQueryKey = ['user-flag', targetType, targetId] as const
  const flagQuery = useQuery({
    enabled: Boolean(user),
    queryKey: flagQueryKey,
    queryFn: () => getUserFlag(targetType, targetId),
    staleTime: 30_000,
  })
  const [submittedFlag, setSubmittedFlag] = useState(false)
  const flagged = submittedFlag || Boolean(flagQuery.data)

  const flagMutation = useMutation({
    mutationFn: () => submitFlag(targetType, targetId, reason, notes),
    onError: (error) => {
      if (error instanceof Error && error.message.includes('duplicate key')) {
        setSubmittedFlag(true)
      }
    },
    onSuccess: async () => {
      setSubmittedFlag(true)
      setOpen(false)
      setReason('factually_incorrect')
      setNotes('')
      await queryClient.invalidateQueries({ queryKey: flagQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'review-queue'] })
      await Promise.all(
        getTargetAdminQueryKeys(targetType).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      )
    },
  })

  if (!user || !canContributeToCommunity(role)) {
    return null
  }

  return (
    <>
      <Button
        disabled={flagged || flagMutation.isPending || flagQuery.isLoading}
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <Flag aria-hidden="true" className="h-3.5 w-3.5" />
        {flagged ? 'Flagged' : 'Flag'}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)

          if (!nextOpen && !flagMutation.isSuccess) {
            setReason('factually_incorrect')
            setNotes('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag Content</DialogTitle>
            <DialogDescription>
              Send this item to moderators with a reason and optional context.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
                Reason
              </span>
              <select
                className="h-10 w-full rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                value={reason}
                onChange={(event) => setReason(event.target.value as FlagReason)}
              >
                {FLAG_REASONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
                Notes
              </span>
              <textarea
                className="min-h-24 w-full resize-y rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
              <span className="mt-1 block font-body text-xs text-[#777]">{notes.length}/500</span>
            </label>
            {flagMutation.error ? (
              <p className="font-body text-sm text-terracotta-dark">
                {getFlagError(flagMutation.error)}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button size="sm" type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={flagMutation.isPending || notes.length > 500}
                size="sm"
                type="button"
                onClick={() => flagMutation.mutate()}
              >
                Submit flag
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

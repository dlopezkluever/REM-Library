import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Flag } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  dismissFlag,
  getOpenFlagsForTarget,
  resolveFlag,
  type AdminFlagModerationRow,
} from '@/lib/api/admin'
import type { FlagTargetType } from '@/lib/api/community'

interface FlagDetailPanelProps {
  open: boolean
  targetId: string | null
  targetLabel: string
  targetType: FlagTargetType
  onOpenChange: (open: boolean) => void
}

const reasonLabel = (reason: string) => reason.replace(/_/g, ' ')
const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Flag moderation failed.'

export const FlagDetailPanel = ({
  open,
  targetId,
  targetLabel,
  targetType,
  onOpenChange,
}: FlagDetailPanelProps) => {
  const queryClient = useQueryClient()
  const flagsQuery = useQuery({
    enabled: open && Boolean(targetId),
    queryKey: ['admin', 'flags', targetType, targetId],
    queryFn: () => getOpenFlagsForTarget(targetType, targetId ?? ''),
  })
  const flags = flagsQuery.data ?? []
  const moderateMutation = useMutation({
    mutationFn: ({
      action,
      flag,
    }: {
      action: 'dismiss' | 'resolve'
      flag: AdminFlagModerationRow
    }) => (action === 'resolve' ? resolveFlag(flag.id) : dismissFlag(flag.id)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] })
      await queryClient.invalidateQueries({
        queryKey: ['admin', targetType === 'claim' ? 'claims' : 'entities'],
      })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'review-queue'] })
    },
  })
  const pendingFlagId = moderateMutation.isPending ? moderateMutation.variables?.flag.id : null
  const failedFlagId = moderateMutation.isError ? moderateMutation.variables?.flag.id : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[min(92vw,440px)] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Flag aria-hidden="true" className="h-4 w-4 text-terracotta" />
            Open Flags
          </SheetTitle>
          <SheetDescription className="pr-8">{targetLabel}</SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
          {flagsQuery.isLoading ? (
            <p className="font-body text-sm text-[#777]">Loading flags...</p>
          ) : null}
          {flagsQuery.error ? (
            <p className="font-body text-sm text-terracotta-dark">Flags could not load.</p>
          ) : null}
          {!flagsQuery.isLoading && !flagsQuery.error && flags.length === 0 ? (
            <p className="font-body text-sm text-[#777]">No open flags for this item.</p>
          ) : null}
          {flags.map((flag) => (
            <div key={flag.id} className="rounded border-0.5 border-black/10 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className="border-terracotta/25 bg-terracotta-light text-terracotta-dark">
                  {reasonLabel(flag.reason)}
                </Badge>
                <span className="font-body text-xs text-[#777]">
                  {new Date(flag.created_at).toLocaleString()}
                </span>
              </div>
              <p className="font-body text-sm text-ink">
                {flag.reporter?.display_name || flag.reporter?.email || 'Unknown reporter'}
              </p>
              {flag.notes ? (
                <p className="mt-2 whitespace-pre-line font-body text-sm leading-meta text-[#555]">
                  {flag.notes}
                </p>
              ) : null}
              {failedFlagId === flag.id ? (
                <p className="mt-3 font-body text-sm text-terracotta-dark">
                  {getErrorMessage(moderateMutation.error)}
                </p>
              ) : null}
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  disabled={pendingFlagId === flag.id}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => moderateMutation.mutate({ action: 'dismiss', flag })}
                >
                  Dismiss
                </Button>
                <Button
                  disabled={pendingFlagId === flag.id}
                  size="sm"
                  type="button"
                  onClick={() => moderateMutation.mutate({ action: 'resolve', flag })}
                >
                  Resolve
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}

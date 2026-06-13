import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, HelpCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  approveSuggestion,
  getAdminSuggestions,
  rejectSuggestion,
  requestSuggestionClarification,
  type AdminSuggestionRow,
} from '@/lib/api/admin'

const PAGE_SIZE = 50

type ActionType = 'approve' | 'reject' | 'clarify'

interface PendingAction {
  type: ActionType
  suggestion: AdminSuggestionRow
}

const typeLabels: Record<AdminSuggestionRow['type'], string> = {
  claim_correction: 'Claim correction',
  flag_claim: 'Flag claim',
  flag_entity: 'Flag entity',
  new_claim: 'New claim',
}

const statusClasses: Record<AdminSuggestionRow['status'], string> = {
  approved: 'border-verdigris/40 bg-verdigris-light text-verdigris-dark',
  clarification_requested: 'border-amber-300/70 bg-amber-50 text-amber-800',
  pending: 'border-iris/30 bg-iris-light text-iris-dark',
  rejected: 'border-terracotta/30 bg-terracotta-light text-terracotta-dark',
}

const actionLabels: Record<ActionType, string> = {
  approve: 'Approve',
  clarify: 'Request clarification',
  reject: 'Reject',
}

const actionDescriptions: Record<ActionType, (s: AdminSuggestionRow) => string> = {
  approve: (s) =>
    s.type === 'new_claim' || s.type === 'claim_correction'
      ? 'This will create a new draft claim in the system.'
      : 'This will mark the target as disputed.',
  clarify: () => 'This will ask the contributor for more information.',
  reject: () => 'This suggestion will be rejected and closed.',
}

const isTerminal = (status: AdminSuggestionRow['status']) =>
  status === 'approved' || status === 'rejected'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Suggestion action failed.'

export default function AdminSuggestionManagerPage() {
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState<AdminSuggestionRow['status'] | ''>('')
  const [typeFilter, setTypeFilter] = useState<AdminSuggestionRow['type'] | ''>('')
  const [page, setPage] = useState(0)

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [dialogNote, setDialogNote] = useState('')

  const suggestionsQueryKey = ['admin', 'suggestions', { status: statusFilter, type: typeFilter, page }] as const

  const suggestionsQuery = useQuery({
    queryKey: suggestionsQueryKey,
    queryFn: () =>
      getAdminSuggestions({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'suggestions'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
  }

  const onActionSuccess = () => {
    setPendingAction(null)
    setDialogNote('')
    void invalidate()
  }

  const approveMutation = useMutation({
    mutationFn: (suggestionId: string) => approveSuggestion(suggestionId, dialogNote || null),
    onSuccess: onActionSuccess,
  })
  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) => rejectSuggestion(suggestionId, dialogNote || null),
    onSuccess: onActionSuccess,
  })
  const clarifyMutation = useMutation({
    mutationFn: (suggestionId: string) =>
      requestSuggestionClarification(suggestionId, dialogNote || null),
    onSuccess: onActionSuccess,
  })

  const activeMutation = approveMutation.isPending || rejectMutation.isPending || clarifyMutation.isPending
  const mutationError = approveMutation.error ?? rejectMutation.error ?? clarifyMutation.error

  const handleConfirm = () => {
    if (!pendingAction) return
    const { type, suggestion } = pendingAction
    if (type === 'approve') approveMutation.mutate(suggestion.id)
    else if (type === 'reject') rejectMutation.mutate(suggestion.id)
    else clarifyMutation.mutate(suggestion.id)
  }

  const openDialog = (type: ActionType, suggestion: AdminSuggestionRow) => {
    setPendingAction({ type, suggestion })
    setDialogNote('')
    // Reset mutation state so stale errors don't show
    approveMutation.reset()
    rejectMutation.reset()
    clarifyMutation.reset()
  }

  const rows = suggestionsQuery.data ?? []
  const hasNextPage = rows.length === PAGE_SIZE

  const selectClass =
    'rounded border border-0.5 border-black/15 bg-white px-2 py-1.5 font-body text-xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl uppercase text-ink">Suggestions</h1>
        <p className="mt-1 font-body text-sm text-[#777]">
          Review contributor proposals before any draft content enters the graph.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          className={selectClass}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as AdminSuggestionRow['status'] | '')
            setPage(0)
          }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="clarification_requested">Clarification requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        <select
          className={selectClass}
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as AdminSuggestionRow['type'] | '')
            setPage(0)
          }}
        >
          <option value="">All types</option>
          <option value="new_claim">New claim</option>
          <option value="claim_correction">Claim correction</option>
          <option value="flag_claim">Flag claim</option>
          <option value="flag_entity">Flag entity</option>
        </select>
      </div>

      {mutationError ? (
        <p className="rounded border border-terracotta/30 bg-terracotta-light p-3 font-body text-sm text-terracotta-dark">
          {getErrorMessage(mutationError)}
        </p>
      ) : null}

      <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Submitter</TableHead>
              <TableHead>Suggestion</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestionsQuery.isLoading ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={6}>
                  Loading suggestions...
                </TableCell>
              </TableRow>
            ) : null}
            {suggestionsQuery.error ? (
              <TableRow>
                <TableCell className="font-body text-sm text-terracotta-dark" colSpan={6}>
                  Suggestions could not load.
                </TableCell>
              </TableRow>
            ) : null}
            {!suggestionsQuery.isLoading && !suggestionsQuery.error && rows.length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={6}>
                  No suggestions found.
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((suggestion) => (
              <TableRow key={suggestion.id}>
                <TableCell>
                  <Badge variant="outline">{typeLabels[suggestion.type]}</Badge>
                </TableCell>
                <TableCell className="max-w-[220px] font-body text-sm text-ink">
                  {suggestion.targetEntity ? (
                    <Link className="text-verdigris" to={`/entity/${suggestion.targetEntity.slug}`}>
                      {suggestion.targetEntity.name}
                    </Link>
                  ) : suggestion.targetClaim ? (
                    <Link className="text-verdigris" to={`/claim/${suggestion.targetClaim.id}`}>
                      {suggestion.targetClaim.statement}
                    </Link>
                  ) : (
                    'Unknown target'
                  )}
                </TableCell>
                <TableCell className="font-body text-sm text-[#777]">
                  {suggestion.submitter?.display_name ??
                    suggestion.submitter?.email ??
                    suggestion.submitter_id}
                </TableCell>
                <TableCell className="max-w-[320px] font-body text-sm leading-meta text-ink">
                  <p>{suggestion.suggestion_text}</p>
                  {suggestion.reason ? (
                    <p className="mt-2 text-xs text-[#777]">{suggestion.reason}</p>
                  ) : null}
                  {suggestion.created_claim_id ? (
                    <Link
                      className="mt-2 inline-flex text-xs text-verdigris"
                      to={`/admin/claims?search=${suggestion.created_claim_id}`}
                    >
                      View created draft
                    </Link>
                  ) : null}
                </TableCell>
                <TableCell>
                  <Badge className={statusClasses[suggestion.status]}>{suggestion.status}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      disabled={suggestion.status === 'approved' || activeMutation}
                      size="sm"
                      type="button"
                      onClick={() => openDialog('approve', suggestion)}
                    >
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      disabled={suggestion.status === 'rejected' || activeMutation}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => openDialog('reject', suggestion)}
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      disabled={isTerminal(suggestion.status) || activeMutation}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => openDialog('clarify', suggestion)}
                    >
                      <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
                      Clarify
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          disabled={page === 0}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <span className="font-body text-xs text-[#777]">Page {page + 1}</span>
        <Button
          disabled={!hasNextPage}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => setPage((p) => p + 1)}
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Per-action confirmation dialog */}
      <Dialog open={pendingAction !== null} onOpenChange={(open) => !open && setPendingAction(null)}>
        <DialogContent>
          {pendingAction ? (
            <>
              <DialogHeader>
                <DialogTitle>{actionLabels[pendingAction.type]}</DialogTitle>
                <DialogDescription>
                  {actionDescriptions[pendingAction.type](pendingAction.suggestion)}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-2 space-y-3 rounded border border-0.5 border-black/10 bg-stone p-3">
                <p className="font-body text-xs font-semibold text-ink">
                  {typeLabels[pendingAction.suggestion.type]}
                </p>
                <p className="font-body text-sm text-ink">
                  {pendingAction.suggestion.suggestion_text}
                </p>
                {pendingAction.suggestion.reason ? (
                  <p className="font-body text-xs text-[#777]">{pendingAction.suggestion.reason}</p>
                ) : null}
              </div>

              <label className="mt-2 block">
                <span className="mb-1.5 block font-body text-xs text-[#777]">
                  {pendingAction.type === 'clarify' ? 'Message to contributor (required)' : 'Admin note (optional)'}
                </span>
                <textarea
                  className="min-h-20 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                  value={dialogNote}
                  onChange={(e) => setDialogNote(e.target.value)}
                />
              </label>

              {mutationError ? (
                <p className="font-body text-sm text-terracotta-dark">
                  {getErrorMessage(mutationError)}
                </p>
              ) : null}

              <div className="mt-2 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPendingAction(null)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    activeMutation ||
                    (pendingAction.type === 'clarify' && !dialogNote.trim())
                  }
                  type="button"
                  onClick={handleConfirm}
                >
                  {activeMutation ? 'Working…' : actionLabels[pendingAction.type]}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

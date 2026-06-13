import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, HelpCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

const suggestionsQueryKey = ['admin', 'suggestions'] as const

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

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Suggestion action failed.'

export default function AdminSuggestionManagerPage() {
  const queryClient = useQueryClient()
  const [adminNote, setAdminNote] = useState('')
  const suggestionsQuery = useQuery({
    queryKey: suggestionsQueryKey,
    queryFn: getAdminSuggestions,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: suggestionsQueryKey })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
    await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
  }

  const approveMutation = useMutation({
    mutationFn: (suggestionId: string) => approveSuggestion(suggestionId, adminNote || null),
    onSuccess: invalidate,
  })
  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) => rejectSuggestion(suggestionId, adminNote || null),
    onSuccess: invalidate,
  })
  const clarifyMutation = useMutation({
    mutationFn: (suggestionId: string) =>
      requestSuggestionClarification(suggestionId, adminNote || null),
    onSuccess: invalidate,
  })

  const actionError = approveMutation.error ?? rejectMutation.error ?? clarifyMutation.error

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl uppercase text-ink">Suggestions</h1>
        <p className="mt-1 font-body text-sm text-[#777]">
          Review contributor proposals before any draft content enters the graph.
        </p>
      </div>

      <section className="rounded border border-0.5 border-black/[0.09] bg-white p-4">
        <label className="block">
          <span className="mb-1.5 block font-body text-xs text-[#777]">Admin note</span>
          <textarea
            className="min-h-20 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={adminNote}
            onChange={(event) => setAdminNote(event.target.value)}
          />
        </label>
      </section>

      {actionError ? (
        <p className="rounded border border-terracotta/30 bg-terracotta-light p-3 font-body text-sm text-terracotta-dark">
          {getErrorMessage(actionError)}
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
            {!suggestionsQuery.isLoading &&
            !suggestionsQuery.error &&
            (suggestionsQuery.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={6}>
                  No suggestions submitted yet.
                </TableCell>
              </TableRow>
            ) : null}
            {(suggestionsQuery.data ?? []).map((suggestion) => (
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
                      disabled={suggestion.status === 'approved' || approveMutation.isPending}
                      size="sm"
                      type="button"
                      onClick={() => approveMutation.mutate(suggestion.id)}
                    >
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      Approve
                    </Button>
                    <Button
                      disabled={suggestion.status === 'rejected' || rejectMutation.isPending}
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => rejectMutation.mutate(suggestion.id)}
                    >
                      <X aria-hidden="true" className="h-3.5 w-3.5" />
                      Reject
                    </Button>
                    <Button
                      disabled={clarifyMutation.isPending}
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => clarifyMutation.mutate(suggestion.id)}
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
    </div>
  )
}

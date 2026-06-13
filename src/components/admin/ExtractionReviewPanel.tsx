import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  GitMerge,
  ListChecks,
  Pencil,
  Scissors,
  Search,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import {
  rejectFailedExtraction,
  reviewExtractionItem,
  searchAdminEntities,
  interpretationFrameLabels,
  interpretationFrames,
  type ReviewClaimItem,
  type ReviewEntityItem,
  type ReviewItem,
  type ReviewSourceGroup,
  type SaveClaimReviewInput,
  type SaveEntityReviewInput,
} from '@/lib/api/admin'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import {
  enrichSplitError,
  findHighlightSpan,
  validateClaimInput,
  validateEntityInput,
} from '@/lib/reviewUtils'

interface ExtractionReviewPanelProps {
  group: ReviewSourceGroup
  onReviewed: () => void
}

type Mode = 'view' | 'edit' | 'merge' | 'split'
const validationItemId = '__validation_failed__'

const entityTypeOptions = ['symbol', 'figure', 'narrative', 'culture', 'trope'] as const
const relationshipTypeOptions = [
  'symbolizes',
  'appears_in',
  'belongs_to',
  'parallels',
  'instantiates',
  'supports',
] as const

const getFirstPendingSelection = (group: ReviewSourceGroup) => {
  const extraction = group.extractions.find((candidate) => candidate.items.length > 0)
  const item = extraction?.items[0] ?? null

  return extraction && item ? { extractionId: extraction.extraction.id, itemId: item.itemId } : null
}

const findSelection = (
  group: ReviewSourceGroup,
  selection: { extractionId: string; itemId: string } | null
) => {
  if (!selection) {
    return null
  }

  for (const extraction of group.extractions) {
    if (extraction.extraction.id !== selection.extractionId) {
      continue
    }

    const item = extraction.items.find((candidate) => candidate.itemId === selection.itemId)

    if (item) {
      return { extraction, item }
    }
  }

  return null
}

const findValidationSelection = (
  group: ReviewSourceGroup,
  selection: { extractionId: string; itemId: string } | null
) => {
  if (selection?.itemId !== validationItemId) {
    return null
  }

  return (
    group.extractions.find(
      (extraction) =>
        extraction.extraction.id === selection.extractionId && extraction.validationFailed
    ) ?? null
  )
}

const itemTitle = (item: ReviewItem) => {
  return item.kind === 'entity' ? item.name : item.statement
}

const itemSubtitle = (item: ReviewItem) => {
  return item.kind === 'entity'
    ? ENTITY_LABELS[item.type]
    : `${item.relationshipType.replace(/_/g, ' ')} - ${item.entitiesInvolved.join(', ')}`
}

const getPassage = (item: ReviewItem) => {
  if (item.kind === 'entity') {
    return item.description || item.name
  }

  return item.evidenceSummary || item.statement
}

const highlightPassage = (text: string, passage: string) => {
  const trimmedPassage = passage.trim()

  if (!trimmedPassage) {
    return text
  }

  const span = findHighlightSpan(text, trimmedPassage)

  if (!span) {
    return text
  }

  const [start, end] = span

  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-verdigris-light px-1 text-verdigris-dark">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  )
}

const Textarea = ({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm leading-reading text-ink placeholder:text-[#888] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris',
        className
      )}
      {...props}
    />
  )
}

const EntityFields = ({
  value,
  onChange,
}: {
  onChange: (value: SaveEntityReviewInput) => void
  value: SaveEntityReviewInput
}) => {
  return (
    <div className="space-y-3">
      <Input
        aria-label="Entity name"
        value={value.name}
        onChange={(event) => onChange({ ...value, name: event.target.value })}
      />
      <select
        aria-label="Entity type"
        className="h-10 w-full rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
        value={value.type}
        onChange={(event) =>
          onChange({ ...value, type: event.target.value as SaveEntityReviewInput['type'] })
        }
      >
        {entityTypeOptions.map((type) => (
          <option key={type} value={type}>
            {ENTITY_LABELS[type]}
          </option>
        ))}
      </select>
      <Textarea
        aria-label="Entity description"
        value={value.description ?? ''}
        onChange={(event) => onChange({ ...value, description: event.target.value.trim() || null })}
      />
      <Input
        aria-label="Entity aliases"
        placeholder="Aliases separated by commas"
        value={value.aliases.join(', ')}
        onChange={(event) =>
          onChange({
            ...value,
            aliases: event.target.value
              .split(',')
              .map((alias) => alias.trim())
              .filter(Boolean),
          })
        }
      />
    </div>
  )
}

const ClaimFields = ({
  canSetCanonical,
  value,
  onChange,
}: {
  canSetCanonical: boolean
  onChange: (value: SaveClaimReviewInput) => void
  value: SaveClaimReviewInput
}) => {
  return (
    <div className="space-y-3">
      <Textarea
        aria-label="Claim statement"
        value={value.statement}
        onChange={(event) => onChange({ ...value, statement: event.target.value })}
      />
      <select
        aria-label="Relationship type"
        className="h-10 w-full rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
        value={value.relationshipType}
        onChange={(event) =>
          onChange({
            ...value,
            relationshipType: event.target.value as SaveClaimReviewInput['relationshipType'],
          })
        }
      >
        {relationshipTypeOptions.map((type) => (
          <option key={type} value={type}>
            {type.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      <Input
        aria-label="Entities involved"
        value={value.entitiesInvolved.join(', ')}
        onChange={(event) =>
          onChange({
            ...value,
            entitiesInvolved: event.target.value
              .split(',')
              .map((name) => name.trim())
              .filter(Boolean),
          })
        }
      />
      <Textarea
        aria-label="Evidence summary"
        value={value.evidenceSummary}
        onChange={(event) => onChange({ ...value, evidenceSummary: event.target.value })}
      />
      <select
        aria-label="Interpretation frame"
        className="h-10 w-full rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
        value={value.interpretationFrame ?? ''}
        onChange={(event) =>
          onChange({
            ...value,
            interpretationFrame: event.target.value
              ? (event.target.value as SaveClaimReviewInput['interpretationFrame'])
              : null,
          })
        }
      >
        <option value="">No frame</option>
        {interpretationFrames.map((frame) => (
          <option key={frame} value={frame}>
            {interpretationFrameLabels[frame]}
          </option>
        ))}
      </select>
      {canSetCanonical ? (
        <label className="flex items-center gap-2 rounded border border-0.5 border-black/[0.09] bg-stone/40 px-3 py-2 font-body text-sm text-ink">
          <input
            checked={value.isCanonical}
            className="h-4 w-4 accent-verdigris"
            type="checkbox"
            onChange={(event) => onChange({ ...value, isCanonical: event.target.checked })}
          />
          Canonical claim
        </label>
      ) : null}
    </div>
  )
}

const toEntityInput = (item: ReviewEntityItem): SaveEntityReviewInput => ({
  aliases: item.aliases,
  description: item.description,
  name: item.name,
  type: item.type,
})

const toClaimInput = (item: ReviewClaimItem): SaveClaimReviewInput => ({
  entitiesInvolved: item.entitiesInvolved,
  evidenceSummary: item.evidenceSummary,
  interpretationFrame: item.interpretationFrame,
  isCanonical: item.isCanonical,
  relationshipType: item.relationshipType,
  statement: item.statement,
})

export const ExtractionReviewPanel = ({ group, onReviewed }: ExtractionReviewPanelProps) => {
  const { role } = useAuth()
  const [selection, setSelection] = useState(getFirstPendingSelection(group))
  const [mode, setMode] = useState<Mode>('view')
  const [entityEdit, setEntityEdit] = useState<SaveEntityReviewInput | null>(null)
  const [claimEdit, setClaimEdit] = useState<SaveClaimReviewInput | null>(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [splitDraft, setSplitDraft] = useState<{
    first: SaveEntityReviewInput
    second: SaveEntityReviewInput
  } | null>(null)

  const currentSelection = findSelection(group, selection)
    ? selection
    : findValidationSelection(group, selection)
      ? selection
      : getFirstPendingSelection(group)
  const selected = findSelection(group, currentSelection)
  const selectedValidationExtraction =
    findValidationSelection(group, currentSelection) ??
    (!selected
      ? (group.extractions.find((extraction) => extraction.validationFailed) ?? null)
      : null)
  const selectedItem = selected?.item ?? null
  const selectedExtraction = selected?.extraction ?? null
  const editValidation =
    mode === 'edit' && selectedItem?.kind === 'entity'
      ? validateEntityInput(entityEdit)
      : mode === 'edit' && selectedItem?.kind === 'claim'
        ? validateClaimInput(claimEdit)
        : null
  const splitValidation =
    mode === 'split'
      ? (validateEntityInput(splitDraft?.first ?? null) ??
        validateEntityInput(splitDraft?.second ?? null))
      : null

  const mergeResultsQuery = useQuery({
    enabled: mode === 'merge' && mergeSearch.trim().length > 1,
    queryKey: ['admin', 'entities', 'search', mergeSearch],
    queryFn: () => searchAdminEntities(mergeSearch),
  })

  const reviewMutation = useMutation({
    mutationFn: reviewExtractionItem,
    onSuccess: () => {
      setMode('view')
      setRejectDialogOpen(false)
      onReviewed()
    },
  })

  const rejectFailedMutation = useMutation({
    mutationFn: rejectFailedExtraction,
    onSuccess: () => {
      setRejectDialogOpen(false)
      onReviewed()
    },
  })

  const submitConfirm = () => {
    if (!selectedItem || !selectedExtraction) {
      return
    }

    reviewMutation.mutate({
      action: 'confirm',
      extractionId: selectedExtraction.extraction.id,
      itemId: selectedItem.itemId,
      itemKind: selectedItem.kind,
    })
  }

  const submitEdit = () => {
    if (!selectedItem || !selectedExtraction) {
      return
    }

    if (editValidation) {
      return
    }

    reviewMutation.mutate({
      action: 'edit',
      claim: selectedItem.kind === 'claim' ? (claimEdit ?? undefined) : undefined,
      entity: selectedItem.kind === 'entity' ? (entityEdit ?? undefined) : undefined,
      extractionId: selectedExtraction.extraction.id,
      itemId: selectedItem.itemId,
      itemKind: selectedItem.kind,
    })
  }

  const submitReject = () => {
    if (!selectedItem || !selectedExtraction) {
      return
    }

    reviewMutation.mutate({
      action: 'reject',
      extractionId: selectedExtraction.extraction.id,
      itemId: selectedItem.itemId,
      itemKind: selectedItem.kind,
    })
  }

  const submitSplit = () => {
    if (!selectedItem || selectedItem.kind !== 'entity' || !selectedExtraction || !splitDraft) {
      return
    }

    if (splitValidation) {
      return
    }

    reviewMutation.mutate({
      action: 'split',
      extractionId: selectedExtraction.extraction.id,
      itemId: selectedItem.itemId,
      itemKind: 'entity',
      split: splitDraft,
    })
  }

  if (!selectedItem || !selectedExtraction) {
    if (selectedValidationExtraction) {
      const rejectError = rejectFailedMutation.error

      return (
        <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="rounded border border-0.5 border-black/[0.09] bg-white">
            <div className="border-b border-b-0.5 border-b-black/[0.06] p-4">
              <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
                Pending Items
              </h2>
              <p className="mt-1 font-body text-xs text-[#777]">
                {group.pendingItemCount} awaiting review
              </p>
            </div>
            <div className="max-h-[620px] overflow-y-auto">
              {group.extractions
                .filter((extraction) => extraction.validationFailed)
                .map((extraction) => {
                  const active =
                    selectedValidationExtraction.extraction.id === extraction.extraction.id

                  return (
                    <button
                      key={extraction.extraction.id}
                      className={cn(
                        'block w-full border-b border-b-0.5 border-b-black/[0.06] px-4 py-3 text-left transition-colors last:border-b-0',
                        active
                          ? 'bg-terracotta-light text-terracotta-dark'
                          : 'hover:bg-black/[0.03]'
                      )}
                      type="button"
                      onClick={() =>
                        setSelection({
                          extractionId: extraction.extraction.id,
                          itemId: validationItemId,
                        })
                      }
                    >
                      <p className="font-display text-[8px] uppercase tracking-label">
                        Validation Failed
                      </p>
                      <p className="mt-1 font-body text-[11px] text-[#777]">
                        Chunk {extraction.chunk.chunk_index + 1}
                      </p>
                    </button>
                  )
                })}
            </div>
          </aside>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
                    Source Passage
                  </h2>
                  <p className="mt-1 font-body text-xs text-[#777]">
                    Chunk {selectedValidationExtraction.chunk.chunk_index + 1}
                  </p>
                </div>
                <Badge variant="outline">
                  {selectedValidationExtraction.chunk.speaker ?? 'Source'}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap font-body text-sm leading-reading text-ink">
                {selectedValidationExtraction.chunk.raw_text}
              </p>
            </article>

            <article className="rounded border border-0.5 border-terracotta/30 bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
                    Validation Failure
                  </h2>
                  <p className="mt-1 font-body text-xs text-[#777]">
                    Provider output did not match the extraction schema.
                  </p>
                </div>
                <AlertTriangle aria-hidden="true" className="h-4 w-4 text-terracotta" />
              </div>

              <div className="space-y-4">
                <div>
                  <p className="font-display text-[8px] uppercase tracking-label text-[#777]">
                    Error
                  </p>
                  <p className="mt-1 whitespace-pre-wrap font-body text-sm leading-reading text-ink">
                    {selectedValidationExtraction.validationError ??
                      'No validation error recorded.'}
                  </p>
                </div>
                <div>
                  <p className="font-display text-[8px] uppercase tracking-label text-[#777]">
                    Raw Response
                  </p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded border border-0.5 border-black/[0.09] bg-stone p-3 font-mono text-[11px] text-ink">
                    {selectedValidationExtraction.validationRawResponse ??
                      'Raw response was not captured for this extraction.'}
                  </pre>
                </div>
              </div>

              {rejectError ? (
                <div className="mt-4 rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-3">
                  <p className="font-body text-sm text-terracotta-dark">
                    {rejectError instanceof Error ? rejectError.message : 'Reject action failed.'}
                  </p>
                </div>
              ) : null}

              <div className="mt-5 flex justify-end">
                <Button
                  disabled={rejectFailedMutation.isPending}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                  Reject failed extraction
                </Button>
              </div>

              <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reject Failed Extraction</DialogTitle>
                    <DialogDescription>
                      Remove this validation-failed extraction from the pending review queue?
                    </DialogDescription>
                  </DialogHeader>
                  <div className="mt-5 flex justify-end gap-3">
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      disabled={rejectFailedMutation.isPending}
                      type="button"
                      variant="outline"
                      onClick={() =>
                        rejectFailedMutation.mutate(selectedValidationExtraction.extraction.id)
                      }
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </article>
          </div>
        </section>
      )
    }

    return (
      <section className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
        <p className="font-body text-sm text-[#777]">
          No pending extraction items for this source.
        </p>
      </section>
    )
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="rounded border border-0.5 border-black/[0.09] bg-white">
        <div className="border-b border-b-0.5 border-b-black/[0.06] p-4">
          <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
            Pending Items
          </h2>
          <p className="mt-1 font-body text-xs text-[#777]">
            {group.pendingItemCount} awaiting review
          </p>
        </div>
        <div className="max-h-[620px] overflow-y-auto">
          {group.extractions.map((extraction) => (
            <div
              key={extraction.extraction.id}
              className="border-b border-b-0.5 border-b-black/[0.06]"
            >
              <p className="px-4 pt-3 font-display text-[8px] uppercase tracking-label text-[#777]">
                Chunk {extraction.chunk.chunk_index + 1}
              </p>
              <div className="p-2">
                {extraction.items.map((item) => {
                  const active =
                    currentSelection?.extractionId === extraction.extraction.id &&
                    currentSelection.itemId === item.itemId

                  return (
                    <button
                      key={item.itemId}
                      className={cn(
                        'block w-full rounded px-3 py-2 text-left transition-colors',
                        active ? 'bg-verdigris-light text-verdigris-dark' : 'hover:bg-black/[0.03]'
                      )}
                      type="button"
                      onClick={() => {
                        setSelection({
                          extractionId: extraction.extraction.id,
                          itemId: item.itemId,
                        })
                      }}
                    >
                      <p className="line-clamp-2 font-body text-sm text-ink">{itemTitle(item)}</p>
                      <p className="mt-1 font-body text-[11px] text-[#777]">{itemSubtitle(item)}</p>
                    </button>
                  )
                })}
                {extraction.validationFailed ? (
                  <button
                    className={cn(
                      'mt-1 block w-full rounded px-3 py-2 text-left transition-colors',
                      currentSelection?.extractionId === extraction.extraction.id &&
                        currentSelection.itemId === validationItemId
                        ? 'bg-terracotta-light text-terracotta-dark'
                        : 'hover:bg-black/[0.03]'
                    )}
                    type="button"
                    onClick={() =>
                      setSelection({
                        extractionId: extraction.extraction.id,
                        itemId: validationItemId,
                      })
                    }
                  >
                    <p className="font-body text-sm text-ink">Validation failed</p>
                    <p className="mt-1 font-body text-[11px] text-[#777]">
                      Inspect provider response
                    </p>
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
                Source Passage
              </h2>
              <p className="mt-1 font-body text-xs text-[#777]">
                Chunk {selectedExtraction.chunk.chunk_index + 1}
              </p>
            </div>
            <Badge variant="outline">{selectedExtraction.chunk.speaker ?? 'Source'}</Badge>
          </div>
          <p className="whitespace-pre-wrap font-body text-sm leading-reading text-ink">
            {highlightPassage(selectedExtraction.chunk.raw_text, getPassage(selectedItem))}
          </p>
        </article>

        <article className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[10px] uppercase tracking-label text-ink">
                Structured Extraction
              </h2>
              <p className="mt-1 font-body text-xs text-[#777]">{itemSubtitle(selectedItem)}</p>
            </div>
            <Badge>{selectedItem.kind}</Badge>
          </div>

          {mode === 'edit' && selectedItem.kind === 'entity' && entityEdit ? (
            <EntityFields value={entityEdit} onChange={setEntityEdit} />
          ) : null}

          {mode === 'edit' && selectedItem.kind === 'claim' && claimEdit ? (
            <ClaimFields
              canSetCanonical={role === 'super_admin'}
              value={claimEdit}
              onChange={setClaimEdit}
            />
          ) : null}

          {mode === 'merge' && selectedItem.kind === 'entity' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]"
                />
                <Input
                  className="pl-9"
                  placeholder="Search existing entities"
                  value={mergeSearch}
                  onChange={(event) => setMergeSearch(event.target.value)}
                />
              </div>
              <div className="max-h-52 overflow-y-auto rounded border border-0.5 border-black/[0.09]">
                {(mergeResultsQuery.data ?? []).map((entity) => (
                  <button
                    key={entity.id}
                    className="block w-full border-b border-b-0.5 border-b-black/[0.06] px-3 py-2 text-left last:border-b-0 hover:bg-black/[0.03]"
                    disabled={reviewMutation.isPending}
                    type="button"
                    onClick={() =>
                      reviewMutation.mutate({
                        action: 'merge',
                        extractionId: selectedExtraction.extraction.id,
                        itemId: selectedItem.itemId,
                        itemKind: 'entity',
                        targetEntityId: entity.id,
                      })
                    }
                  >
                    <p className="font-body text-sm text-ink">{entity.name}</p>
                    <p className="font-body text-[11px] text-[#777]">
                      {ENTITY_LABELS[entity.type]}
                    </p>
                  </button>
                ))}
                {mergeSearch.trim().length > 1 &&
                !mergeResultsQuery.isLoading &&
                (mergeResultsQuery.data ?? []).length === 0 ? (
                  <p className="px-3 py-2 font-body text-sm text-[#777]">No matching entities.</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {mode === 'split' && selectedItem.kind === 'entity' && splitDraft ? (
            <div className="grid gap-4">
              <div>
                <p className="mb-2 font-display text-[8px] uppercase tracking-label text-[#777]">
                  First Entity
                </p>
                <EntityFields
                  value={splitDraft.first}
                  onChange={(first) => setSplitDraft({ ...splitDraft, first })}
                />
              </div>
              <div>
                <p className="mb-2 font-display text-[8px] uppercase tracking-label text-[#777]">
                  Second Entity
                </p>
                <EntityFields
                  value={splitDraft.second}
                  onChange={(second) => setSplitDraft({ ...splitDraft, second })}
                />
              </div>
            </div>
          ) : null}

          {mode === 'view' ? (
            <div className="space-y-4">
              <div>
                <p className="font-display text-[8px] uppercase tracking-label text-[#777]">
                  {selectedItem.kind === 'entity' ? 'Name' : 'Statement'}
                </p>
                <p className="mt-1 font-body text-base leading-reading text-ink">
                  {itemTitle(selectedItem)}
                </p>
              </div>
              {selectedItem.kind === 'entity' ? (
                <>
                  <div>
                    <p className="font-display text-[8px] uppercase tracking-label text-[#777]">
                      Description
                    </p>
                    <p className="mt-1 font-body text-sm leading-reading text-ink">
                      {selectedItem.description ?? 'No description extracted.'}
                    </p>
                  </div>
                  <div>
                    <p className="font-display text-[8px] uppercase tracking-label text-[#777]">
                      Aliases
                    </p>
                    <p className="mt-1 font-body text-sm text-ink">
                      {selectedItem.aliases.length > 0 ? selectedItem.aliases.join(', ') : 'None'}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="font-display text-[8px] uppercase tracking-label text-[#777]">
                      Entities
                    </p>
                    <p className="mt-1 font-body text-sm text-ink">
                      {selectedItem.entitiesInvolved.join(', ') || 'None'}
                    </p>
                  </div>
                  <div>
                    <p className="font-display text-[8px] uppercase tracking-label text-[#777]">
                      Evidence
                    </p>
                    <p className="mt-1 font-body text-sm leading-reading text-ink">
                      {selectedItem.evidenceSummary}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {reviewMutation.error ? (
            <div className="mt-4 rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-3">
              <p className="font-body text-sm text-terracotta-dark">
                {(() => {
                  const raw =
                    reviewMutation.error instanceof Error
                      ? reviewMutation.error.message
                      : 'Review action failed.'
                  if (mode === 'split' && splitDraft) {
                    return enrichSplitError(raw, splitDraft.first.name, splitDraft.second.name)
                  }
                  return raw
                })()}
              </p>
            </div>
          ) : null}

          {editValidation || splitValidation ? (
            <div className="mt-4 rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-3">
              <p className="font-body text-sm text-terracotta-dark">
                {editValidation ?? splitValidation}
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {mode === 'edit' ? (
              <>
                <Button size="sm" type="button" variant="ghost" onClick={() => setMode('view')}>
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  disabled={reviewMutation.isPending || Boolean(editValidation)}
                  size="sm"
                  type="button"
                  onClick={submitEdit}
                >
                  <ListChecks aria-hidden="true" className="h-3.5 w-3.5" />
                  Save edit
                </Button>
              </>
            ) : null}
            {mode === 'split' ? (
              <>
                <Button size="sm" type="button" variant="ghost" onClick={() => setMode('view')}>
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                  Cancel
                </Button>
                <Button
                  disabled={reviewMutation.isPending || Boolean(splitValidation)}
                  size="sm"
                  type="button"
                  onClick={submitSplit}
                >
                  <Scissors aria-hidden="true" className="h-3.5 w-3.5" />
                  Save split
                </Button>
              </>
            ) : null}
            {mode === 'merge' ? (
              <Button size="sm" type="button" variant="ghost" onClick={() => setMode('view')}>
                <X aria-hidden="true" className="h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : null}
            {mode === 'view' ? (
              <>
                <Button
                  disabled={reviewMutation.isPending}
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => setRejectDialogOpen(true)}
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                  Reject
                </Button>
                {selectedItem.kind === 'entity' ? (
                  <>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setMergeSearch(selectedItem.name)
                        setMode('merge')
                      }}
                    >
                      <GitMerge aria-hidden="true" className="h-3.5 w-3.5" />
                      Merge
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSplitDraft({
                          first: toEntityInput(selectedItem),
                          second: {
                            aliases: [],
                            description: null,
                            name: '',
                            type: selectedItem.type,
                          },
                        })
                        setMode('split')
                      }}
                    >
                      <Scissors aria-hidden="true" className="h-3.5 w-3.5" />
                      Split
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (selectedItem.kind === 'entity') {
                      setEntityEdit(toEntityInput(selectedItem))
                      setClaimEdit(null)
                    } else {
                      setClaimEdit(toClaimInput(selectedItem))
                      setEntityEdit(null)
                    }
                    setMode('edit')
                  }}
                >
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  disabled={reviewMutation.isPending}
                  size="sm"
                  type="button"
                  onClick={submitConfirm}
                >
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                  Confirm
                </Button>
              </>
            ) : null}
          </div>

          <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reject Extraction</DialogTitle>
                <DialogDescription>
                  Reject this extraction item? No entity, claim, or evidence record will be created.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 flex justify-end gap-3">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  disabled={reviewMutation.isPending}
                  type="button"
                  variant="outline"
                  onClick={submitReject}
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                  Reject
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </article>
      </div>
    </section>
  )
}

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, GitMerge, ListChecks, Pencil, Scissors, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import {
  reviewExtractionItem,
  searchAdminEntities,
  type ReviewClaimItem,
  type ReviewEntityItem,
  type ReviewItem,
  type ReviewSourceGroup,
  type SaveClaimReviewInput,
  type SaveEntityReviewInput,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

interface ExtractionReviewPanelProps {
  group: ReviewSourceGroup
  onReviewed: () => void
}

type Mode = 'view' | 'edit' | 'merge' | 'split'

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

const itemTitle = (item: ReviewItem) => {
  return item.kind === 'entity' ? item.name : item.statement
}

const itemSubtitle = (item: ReviewItem) => {
  return item.kind === 'entity'
    ? ENTITY_LABELS[item.type]
    : `${item.relationshipType.replace(/_/g, ' ')} · ${item.entitiesInvolved.join(', ')}`
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

  const startIndex = text.toLowerCase().indexOf(trimmedPassage.toLowerCase())

  if (startIndex === -1) {
    return text
  }

  return (
    <>
      {text.slice(0, startIndex)}
      <mark className="rounded-sm bg-verdigris-light px-1 text-verdigris-dark">
        {text.slice(startIndex, startIndex + trimmedPassage.length)}
      </mark>
      {text.slice(startIndex + trimmedPassage.length)}
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
  value,
  onChange,
}: {
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
  relationshipType: item.relationshipType,
  statement: item.statement,
})

export const ExtractionReviewPanel = ({ group, onReviewed }: ExtractionReviewPanelProps) => {
  const [selection, setSelection] = useState(getFirstPendingSelection(group))
  const [mode, setMode] = useState<Mode>('view')
  const [entityEdit, setEntityEdit] = useState<SaveEntityReviewInput | null>(null)
  const [claimEdit, setClaimEdit] = useState<SaveClaimReviewInput | null>(null)
  const [mergeSearch, setMergeSearch] = useState('')
  const [splitDraft, setSplitDraft] = useState<{
    first: SaveEntityReviewInput
    second: SaveEntityReviewInput
  } | null>(null)

  const currentSelection = findSelection(group, selection)
    ? selection
    : getFirstPendingSelection(group)
  const selected = findSelection(group, currentSelection)
  const selectedItem = selected?.item ?? null
  const selectedExtraction = selected?.extraction ?? null

  const mergeResultsQuery = useQuery({
    enabled: mode === 'merge' && mergeSearch.trim().length > 1,
    queryKey: ['admin', 'entities', 'search', mergeSearch],
    queryFn: () => searchAdminEntities(mergeSearch),
  })

  const reviewMutation = useMutation({
    mutationFn: reviewExtractionItem,
    onSuccess: () => {
      setMode('view')
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

    reviewMutation.mutate({
      action: 'split',
      extractionId: selectedExtraction.extraction.id,
      itemId: selectedItem.itemId,
      itemKind: 'entity',
      split: splitDraft,
    })
  }

  if (!selectedItem || !selectedExtraction) {
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
            <ClaimFields value={claimEdit} onChange={setClaimEdit} />
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
                {reviewMutation.error instanceof Error
                  ? reviewMutation.error.message
                  : 'Review action failed.'}
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
                  disabled={reviewMutation.isPending}
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
                  disabled={reviewMutation.isPending}
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
                  onClick={submitReject}
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
        </article>
      </div>
    </section>
  )
}

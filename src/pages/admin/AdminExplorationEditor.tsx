import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  GripVertical,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { ExplorationPlayer } from '@/components/graph/ExplorationPlayer'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/constants/routes'
import { getErrorMessage } from '@/lib/format'
import { useSearch } from '@/hooks/useSearch'
import {
  createExploration,
  type ExplorationPublicationStatus,
  type ExplorationStepRow,
} from '@/lib/api/explorations'
import { cn } from '@/lib/utils'
import type { EntityType } from '@/types/domain'

interface PickedEntity {
  id: string
  name: string
  type: EntityType
}

interface DraftStep {
  localId: string
  prose_text: string
  focus: PickedEntity[]
}



const EntitySearchPicker = ({ onSelect }: { onSelect: (entity: PickedEntity) => void }) => {
  const { isLoading, query, results, setQuery } = useSearch()
  const hasQuery = query.trim().length > 0

  return (
    <div className="relative">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#888]"
        />
        <Input
          className="pl-9"
          placeholder="Search entities to highlight"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {hasQuery ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border-0.5 border-black/15 bg-white shadow-lg">
          {isLoading && results.entities.length === 0 ? (
            <p className="px-3 py-2 font-body text-[12px] text-[#888]">Searching…</p>
          ) : null}
          {!isLoading && results.entities.length === 0 ? (
            <p className="px-3 py-2 font-body text-[12px] text-[#888]">No matching entities.</p>
          ) : null}
          {results.entities.map((entity) => (
            <button
              key={entity.id}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-body text-[13px] text-ink transition-colors hover:bg-black/[0.03]"
              type="button"
              onClick={() => {
                onSelect({ id: entity.id, name: entity.name, type: entity.type })
                setQuery('')
              }}
            >
              <span className="truncate">{entity.name}</span>
              <EntityBadge type={entity.type} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function AdminExplorationEditor() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const stepCounter = useRef(1)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<DraftStep[]>([
    { localId: 'step-0', prose_text: '', focus: [] },
  ])
  const [formError, setFormError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const createMutation = useMutation({
    mutationFn: createExploration,
    onSuccess: async (exploration, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['explorations', 'published'] })
      navigate(
        variables.status === 'published' ? `/explorations/${exploration.id}` : ROUTES.EXPLORATIONS
      )
    },
  })

  const nextStepId = () => {
    const id = `step-${stepCounter.current}`
    stepCounter.current += 1
    return id
  }

  const addStep = () => {
    setSteps((current) => [...current, { localId: nextStepId(), prose_text: '', focus: [] }])
  }

  const removeStep = (localId: string) => {
    setSteps((current) => current.filter((step) => step.localId !== localId))
  }

  const updateStepProse = (localId: string, prose_text: string) => {
    setSteps((current) =>
      current.map((step) => (step.localId === localId ? { ...step, prose_text } : step))
    )
  }

  const addFocusEntity = (localId: string, entity: PickedEntity) => {
    setSteps((current) =>
      current.map((step) => {
        if (step.localId !== localId || step.focus.some((focus) => focus.id === entity.id)) {
          return step
        }

        return { ...step, focus: [...step.focus, entity] }
      })
    )
  }

  const removeFocusEntity = (localId: string, entityId: string) => {
    setSteps((current) =>
      current.map((step) =>
        step.localId === localId
          ? { ...step, focus: step.focus.filter((focus) => focus.id !== entityId) }
          : step
      )
    )
  }

  const moveStep = (fromIndex: number, toIndex: number) => {
    setSteps((current) => {
      if (toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) {
        return current
      }

      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const previewSteps: ExplorationStepRow[] = steps.map((step, index) => ({
    id: step.localId,
    exploration_id: 'preview',
    step_index: index,
    entity_id: step.focus[0]?.id ?? null,
    prose_text: step.prose_text,
    focus_entity_ids: step.focus.map((focus) => focus.id),
    created_at: '',
  }))

  const validate = () => {
    if (!title.trim()) {
      return 'A title is required.'
    }

    if (steps.length === 0) {
      return 'Add at least one step.'
    }

    if (steps.some((step) => step.focus.length === 0)) {
      return 'Every step needs at least one highlighted entity.'
    }

    if (steps.some((step) => !step.prose_text.trim())) {
      return 'Every step needs prose text.'
    }

    return null
  }

  const saveExploration = (status: ExplorationPublicationStatus) => {
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || null,
      status,
      steps: steps.map((step) => ({
        entity_id: step.focus[0]?.id ?? null,
        prose_text: step.prose_text.trim(),
        focus_entity_ids: step.focus.map((focus) => focus.id),
      })),
    })
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveExploration('draft')
  }

  const openPreview = () => {
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }

    setFormError(null)
    setPreviewOpen(true)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button
          className="mb-4"
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => navigate(ROUTES.EXPLORATIONS)}
        >
          <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
          Explorations
        </Button>
        <h1 className="font-display text-xl uppercase text-ink">New Exploration</h1>
        <p className="mt-1 font-body text-sm text-[#777]">
          Build a guided tour: each step highlights a set of entities and shows curated prose.
        </p>
      </div>

      {formError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">{formError}</p>
        </div>
      ) : null}

      {createMutation.isError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">
            {getErrorMessage(createMutation.error)}
          </p>
        </div>
      ) : null}

      <form className="space-y-6" onSubmit={handleSubmit}>
        <section className="space-y-4 rounded border border-0.5 border-black/[0.09] bg-white p-5">
          <label className="block">
            <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
              Title
            </span>
            <Input
              placeholder="The Hero's Descent"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
              Description
            </span>
            <textarea
              className="min-h-20 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
              placeholder="A short summary shown on the exploration card."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
        </section>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <section
              key={step.localId}
              className={cn(
                'space-y-3 rounded border border-0.5 border-black/[0.09] bg-white p-5 transition-shadow',
                dragIndex === index && 'opacity-60'
              )}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault()
                if (dragIndex !== null) {
                  moveStep(dragIndex, index)
                }
                setDragIndex(null)
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <GripVertical aria-hidden="true" className="h-4 w-4 cursor-grab text-[#bbb]" />
                  <span className="font-display text-[10px] uppercase tracking-label text-[#777]">
                    Step {index + 1}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    aria-label="Move step up"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[#888] hover:bg-black/5 hover:text-ink disabled:opacity-30"
                    disabled={index === 0}
                    type="button"
                    onClick={() => moveStep(index, index - 1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Move step down"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[#888] hover:bg-black/5 hover:text-ink disabled:opacity-30"
                    disabled={index === steps.length - 1}
                    type="button"
                    onClick={() => moveStep(index, index + 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Remove step"
                    className="inline-flex h-7 w-7 items-center justify-center rounded text-[#888] hover:bg-terracotta-light hover:text-terracotta-dark disabled:opacity-30"
                    disabled={steps.length === 1}
                    type="button"
                    onClick={() => removeStep(step.localId)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
                  Highlighted entities
                </span>
                {step.focus.length > 0 ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {step.focus.map((focus) => (
                      <span
                        key={focus.id}
                        className="inline-flex items-center gap-1.5 rounded border-0.5 border-black/15 bg-stone px-2 py-1 font-body text-[12px] text-ink"
                      >
                        {focus.name}
                        <button
                          aria-label={`Remove ${focus.name}`}
                          className="text-[#999] hover:text-terracotta-dark"
                          type="button"
                          onClick={() => removeFocusEntity(step.localId, focus.id)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
                <EntitySearchPicker onSelect={(entity) => addFocusEntity(step.localId, entity)} />
              </div>

              <label className="block">
                <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
                  Prose (Markdown)
                </span>
                <textarea
                  className="min-h-28 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm leading-reading text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                  placeholder="Describe what the viewer is looking at in this step."
                  value={step.prose_text}
                  onChange={(event) => updateStepProse(step.localId, event.target.value)}
                />
              </label>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button size="sm" type="button" variant="outline" onClick={addStep}>
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Add step
          </Button>
          <div className="flex gap-2">
            <Button size="sm" type="button" variant="outline" onClick={openPreview}>
              <Eye aria-hidden="true" className="h-3.5 w-3.5" />
              Preview
            </Button>
            <Button disabled={createMutation.isPending} size="sm" type="submit" variant="outline">
              {createMutation.isPending ? 'Saving...' : 'Save draft'}
            </Button>
            <Button
              disabled={createMutation.isPending}
              size="sm"
              type="button"
              onClick={() => saveExploration('published')}
            >
              {createMutation.isPending ? 'Publishing...' : 'Publish'}
            </Button>
          </div>
        </div>
      </form>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[min(94vw,900px)] max-w-none border-white/10 bg-charcoal p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Exploration preview</DialogTitle>
          </DialogHeader>
          <div className="h-[70vh] w-full overflow-hidden rounded">
            {previewOpen ? (
              <ExplorationPlayer steps={previewSteps} title={title || 'Preview'} />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

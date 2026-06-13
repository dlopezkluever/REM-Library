import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import {
  createAdminClaim,
  interpretationFrameLabels,
  interpretationFrames,
  searchAdminEntities,
  type AdminEntityRow,
  type ContentStatus,
  type InterpretationFrame,
} from '@/lib/api/admin'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Claim could not be created.'

export default function AdminClaimNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { role } = useAuth()
  const [content, setContent] = useState('')
  const [entitySearch, setEntitySearch] = useState('')
  const [selectedEntities, setSelectedEntities] = useState<AdminEntityRow[]>([])
  const [interpretationFrame, setInterpretationFrame] = useState<InterpretationFrame | null>(null)
  const [isCanonical, setIsCanonical] = useState(false)
  const [status, setStatus] = useState<Extract<ContentStatus, 'draft' | 'published'>>('draft')
  const [canonicalConflictNotice, setCanonicalConflictNotice] = useState<string | null>(null)

  const entityResultsQuery = useQuery({
    enabled: entitySearch.trim().length > 1,
    queryKey: ['admin', 'entities', 'claim-create-search', entitySearch],
    queryFn: () => searchAdminEntities(entitySearch),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminClaim({
        content,
        entityIds: selectedEntities.map((entity) => entity.id),
        interpretationFrame,
        isCanonical: role === 'super_admin' && isCanonical,
        status,
      }),
    onSuccess: async (claim) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
      await queryClient.invalidateQueries({ queryKey: ['entity'] })
      if ('canonicalConflict' in claim && claim.canonicalConflict) {
        setCanonicalConflictNotice(
          'Claim created. A canonical claim already exists for this entity; set this as canonical later from the claim manager if you want to replace it.'
        )
        return
      }
      navigate(`/claim/${claim.id}`)
    },
  })

  const addEntity = (entity: AdminEntityRow) => {
    if (selectedEntities.some((selected) => selected.id === entity.id)) {
      return
    }

    setSelectedEntities((current) => [...current, entity])
    setEntitySearch('')
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCanonicalConflictNotice(null)
    createMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild className="mb-4" size="sm" variant="ghost">
          <Link to={ROUTES.ADMIN_CLAIMS}>
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Claims
          </Link>
        </Button>
        <h1 className="font-display text-xl uppercase text-ink">Create Claim</h1>
      </div>

      <form
        className="rounded border border-0.5 border-black/[0.09] bg-white p-5"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-2 block font-body text-xs text-[#777]">Statement</span>
            <textarea
              className="min-h-36 w-full rounded border border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
              required
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>

          <div>
            <span className="mb-2 block font-body text-xs text-[#777]">Entities</span>
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedEntities.map((entity) => (
                <span
                  key={entity.id}
                  className="inline-flex items-center gap-2 rounded border border-0.5 border-black/15 bg-stone px-2 py-1 font-body text-xs text-ink"
                >
                  {entity.name}
                  <button
                    aria-label={`Remove ${entity.name}`}
                    className="text-[#777] hover:text-terracotta"
                    type="button"
                    onClick={() =>
                      setSelectedEntities((current) =>
                        current.filter((selected) => selected.id !== entity.id)
                      )
                    }
                  >
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]"
              />
              <Input
                className="pl-9"
                placeholder="Search entities"
                value={entitySearch}
                onChange={(event) => setEntitySearch(event.target.value)}
              />
            </div>
            {entitySearch.trim().length > 1 ? (
              <div className="mt-2 max-h-52 overflow-y-auto rounded border border-0.5 border-black/[0.09]">
                {entityResultsQuery.isLoading ? (
                  <p className="px-3 py-2 font-body text-sm text-[#777]">Searching...</p>
                ) : (entityResultsQuery.data ?? []).length === 0 ? (
                  <p className="px-3 py-2 font-body text-sm text-[#777]">
                    No matching entities.
                  </p>
                ) : (
                  (entityResultsQuery.data ?? []).map((entity) => (
                    <button
                      key={entity.id}
                      className="block w-full border-b border-b-0.5 border-b-black/[0.06] px-3 py-2 text-left last:border-b-0 hover:bg-black/[0.03]"
                      type="button"
                      onClick={() => addEntity(entity)}
                    >
                      <p className="font-body text-sm text-ink">{entity.name}</p>
                      <p className="font-body text-[11px] text-[#777]">
                        {ENTITY_LABELS[entity.type]}
                      </p>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <label className="block">
            <span className="mb-2 block font-body text-xs text-[#777]">Interpretation frame</span>
            <select
              className="h-10 w-full rounded border border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
              value={interpretationFrame ?? ''}
              onChange={(event) =>
                setInterpretationFrame(
                  event.target.value ? (event.target.value as InterpretationFrame) : null
                )
              }
            >
              <option value="">No frame</option>
              {interpretationFrames.map((frame) => (
                <option key={frame} value={frame}>
                  {interpretationFrameLabels[frame]}
                </option>
              ))}
            </select>
          </label>

          {role === 'super_admin' ? (
            <label className="flex items-center gap-2 rounded border border-0.5 border-black/[0.09] bg-stone/40 px-3 py-2 font-body text-sm text-ink">
              <input
                checked={isCanonical}
                className="h-4 w-4 accent-verdigris"
                type="checkbox"
                onChange={(event) => setIsCanonical(event.target.checked)}
              />
              Canonical claim
            </label>
          ) : null}

          <label className="block">
            <span className="mb-2 block font-body text-xs text-[#777]">Status</span>
            <select
              className="h-10 w-full rounded border border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as Extract<ContentStatus, 'draft' | 'published'>)
              }
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
        </div>

        {createMutation.error ? (
          <p className="mt-4 font-body text-sm text-terracotta-dark">
            {getErrorMessage(createMutation.error)}
          </p>
        ) : null}

        {canonicalConflictNotice ? (
          <p className="mt-4 rounded border border-0.5 border-amber-300/70 bg-amber-50 p-3 font-body text-sm text-amber-800">
            {canonicalConflictNotice}
          </p>
        ) : null}

        <div className="mt-5 flex justify-end">
          <Button
            disabled={createMutation.isPending || selectedEntities.length === 0}
            type="submit"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            Create claim
          </Button>
        </div>
      </form>
    </div>
  )
}

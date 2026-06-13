import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import { ROUTES } from '@/constants/routes'
import { createAdminEntity, type ContentStatus, type EntityType } from '@/lib/api/admin'

const entityTypes: EntityType[] = ['symbol', 'figure', 'narrative', 'culture', 'trope']

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Entity could not be created.'

export default function AdminEntityNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [type, setType] = useState<EntityType>('symbol')
  const [description, setDescription] = useState('')
  const [dateEra, setDateEra] = useState('')
  const [dateSortYear, setDateSortYear] = useState('')
  const [status, setStatus] = useState<Extract<ContentStatus, 'draft' | 'published'>>('draft')

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminEntity({
        dateEra: dateEra.trim() || null,
        dateSortYear: dateSortYear.trim() ? Number(dateSortYear) : null,
        description: description.trim() || null,
        name,
        status,
        type,
      }),
    onSuccess: async (entity) => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
      await queryClient.invalidateQueries({ queryKey: ['entities'] })
      navigate(`/entity/${entity.slug}`)
    },
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    createMutation.mutate()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Button asChild className="mb-4" size="sm" variant="ghost">
          <Link to={ROUTES.ADMIN_ENTITIES}>
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Entities
          </Link>
        </Button>
        <h1 className="font-display text-xl uppercase text-ink">Create Entity</h1>
      </div>

      <form
        className="rounded border border-0.5 border-black/[0.09] bg-white p-5"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-4">
          <label className="block">
            <span className="mb-2 block font-body text-xs text-[#777]">Name</span>
            <Input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>

          <label className="block">
            <span className="mb-2 block font-body text-xs text-[#777]">Type</span>
            <select
              className="h-10 w-full rounded border border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
              value={type}
              onChange={(event) => setType(event.target.value as EntityType)}
            >
              {entityTypes.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {ENTITY_LABELS[entityType]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block font-body text-xs text-[#777]">Description</span>
            <textarea
              className="min-h-36 w-full rounded border border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block font-body text-xs text-[#777]">Era</span>
              <Input value={dateEra} onChange={(event) => setDateEra(event.target.value)} />
            </label>
            <label className="block">
              <span className="mb-2 block font-body text-xs text-[#777]">Sort year</span>
              <Input
                type="number"
                value={dateSortYear}
                onChange={(event) => setDateSortYear(event.target.value)}
              />
            </label>
          </div>

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

        <div className="mt-5 flex justify-end">
          <Button disabled={createMutation.isPending} type="submit">
            <Save aria-hidden="true" className="h-4 w-4" />
            Create entity
          </Button>
        </div>
      </form>
    </div>
  )
}

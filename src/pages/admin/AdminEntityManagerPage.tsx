import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import { ConfidenceOverrideInput } from '@/components/admin/ConfidenceOverrideInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import {
  getAdminEntitiesPage,
  getEntityTimelineDates,
  publishAdminEntities,
  recomputeConfidenceInBatches,
  updateAdminEntityStatus,
  updateEntityConfidenceOverride,
  updateEntityTimelineDates,
  type AdminEntityRow,
  type ContentStatus,
} from '@/lib/api/admin'
import { TIMELINE_ERAS } from '@/lib/timeline/eras'
import { parseTimelineSortYear } from '@/lib/timeline/pinchZoom'
import { cn } from '@/lib/utils'

const TIMELINE_ENTITY_TYPES = new Set(['narrative', 'figure'])

const adminEntitiesQueryKey = ['admin', 'entities'] as const

const statusClassNames: Record<ContentStatus, string> = {
  archived: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
  disputed: 'border-amber-300/70 bg-amber-50 text-amber-800',
  draft: 'border-iris/30 bg-iris-light text-iris-dark',
  published: 'border-verdigris bg-verdigris-light text-verdigris-dark',
}

const ARCHIVE_ENTITY_CONFIRMATION =
  'Archive this entity? It will no longer appear publicly and cannot be easily restored.'

const getMutationError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Entity update failed.'
}

export default function AdminEntityManagerPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all')
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
  const [failedConfidenceIds, setFailedConfidenceIds] = useState<string[]>([])
  const entitiesQuery = useQuery({
    queryKey: [...adminEntitiesQueryKey, page, search, statusFilter],
    queryFn: () =>
      getAdminEntitiesPage({
        page,
        search,
        status: statusFilter === 'all' ? null : statusFilter,
      }),
  })

  const toggleStatusMutation = useMutation({
    mutationFn: ({ entity, status }: { entity: AdminEntityRow; status: ContentStatus }) =>
      updateAdminEntityStatus(entity.id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminEntitiesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
    },
  })

  const bulkPublishMutation = useMutation({
    mutationFn: publishAdminEntities,
    onSuccess: async (result, publishedIds) => {
      setSelectedEntityIds([])
      setFailedConfidenceIds(result.confidenceUpdateFailed ? publishedIds : [])
      await queryClient.invalidateQueries({ queryKey: adminEntitiesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
    },
  })

  const retryConfidenceMutation = useMutation({
    mutationFn: recomputeConfidenceInBatches,
    onSuccess: () => setFailedConfidenceIds([]),
  })

  const confidenceOverrideMutation = useMutation({
    mutationFn: ({ entity, override }: { entity: AdminEntityRow; override: number | null }) =>
      updateEntityConfidenceOverride(entity.id, override),
    onSuccess: async (_result, variables) => {
      await queryClient.invalidateQueries({ queryKey: adminEntitiesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
      await queryClient.invalidateQueries({ queryKey: ['entity', variables.entity.slug] })
      await queryClient.invalidateQueries({ queryKey: ['entities'] })
    },
  })

  const [datesEntity, setDatesEntity] = useState<AdminEntityRow | null>(null)

  const entityPage = entitiesQuery.data
  const entities = entityPage?.entities ?? []
  const totalCount = entityPage?.totalCount ?? 0
  const pageSize = entityPage?.pageSize ?? 50
  const pageCount = Math.max(Math.ceil(totalCount / pageSize), 1)
  const selectedSet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds])
  const allVisibleSelected =
    entities.length > 0 && entities.every((entity) => selectedSet.has(entity.id))
  const actionError =
    toggleStatusMutation.error ?? bulkPublishMutation.error ?? retryConfidenceMutation.error

  const toggleSelected = (entityId: string) => {
    setSelectedEntityIds((current) =>
      current.includes(entityId)
        ? current.filter((selectedId) => selectedId !== entityId)
        : [...current, entityId]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Entities</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Review draft content and control graph publication state.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" type="button" variant="outline">
            <Link to="/admin/entities/new">
              <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              Create entity
            </Link>
          </Button>
          <Button
            disabled={entitiesQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void entitiesQuery.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', entitiesQuery.isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
          <Button
            disabled={selectedEntityIds.length === 0 || bulkPublishMutation.isPending}
            size="sm"
            type="button"
            onClick={() => bulkPublishMutation.mutate(selectedEntityIds)}
          >
            <Check aria-hidden="true" className="h-3.5 w-3.5" />
            Publish selected
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">{getMutationError(actionError)}</p>
        </div>
      ) : null}

      {failedConfidenceIds.length > 0 && !actionError ? (
        <div className="flex items-center justify-between gap-3 rounded border border-0.5 border-amber-300/60 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="font-body text-sm text-amber-800">
              Entities published, but confidence scores could not be updated. Graph weights may be
              stale until recomputed.
            </p>
          </div>
          <Button
            disabled={retryConfidenceMutation.isPending}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => retryConfidenceMutation.mutate(failedConfidenceIds)}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', retryConfidenceMutation.isPending && 'animate-spin')}
            />
            Retry
          </Button>
        </div>
      ) : null}

      <section className="rounded border border-0.5 border-black/[0.09] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]"
            />
            <Input
              className="pl-9"
              placeholder="Search entities"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
                setSelectedEntityIds([])
              }}
            />
          </div>
          <select
            aria-label="Filter by status"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as ContentStatus | 'all')
              setPage(0)
              setSelectedEntityIds([])
            }}
          >
            <option value="all">All active statuses</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="disputed">Disputed</option>
          </select>
        </div>
      </section>

      <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <input
                  aria-label="Select all entities"
                  checked={allVisibleSelected}
                  className="h-4 w-4 accent-verdigris"
                  type="checkbox"
                  onChange={(event) =>
                    setSelectedEntityIds(
                      event.target.checked ? entities.map((entity) => entity.id) : []
                    )
                  }
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Aliases</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entitiesQuery.isLoading ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  Loading entities...
                </TableCell>
              </TableRow>
            ) : null}

            {entitiesQuery.error ? (
              <TableRow>
                <TableCell className="font-body text-sm text-terracotta-dark" colSpan={7}>
                  Entities could not load.
                </TableCell>
              </TableRow>
            ) : null}

            {!entitiesQuery.isLoading && !entitiesQuery.error && entities.length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  No entities have been created yet.
                </TableCell>
              </TableRow>
            ) : null}

            {entities.map((entity) => {
              const isSelected = selectedSet.has(entity.id)
              const isPublished = entity.status === 'published'
              const isDisputed = entity.status === 'disputed'
              const nextStatus: ContentStatus = isPublished ? 'draft' : 'published'
              const updating =
                toggleStatusMutation.isPending &&
                toggleStatusMutation.variables?.entity.id === entity.id
              const savingOverride =
                confidenceOverrideMutation.isPending &&
                confidenceOverrideMutation.variables?.entity.id === entity.id

              return (
                <TableRow key={entity.id}>
                  <TableCell>
                    <input
                      aria-label={`Select ${entity.name}`}
                      checked={isSelected}
                      className="h-4 w-4 accent-verdigris"
                      type="checkbox"
                      onChange={() => toggleSelected(entity.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="max-w-[300px]">
                      <p className="truncate font-body text-sm text-ink">{entity.name}</p>
                      <p className="truncate font-body text-[11px] text-[#888]">{entity.slug}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ENTITY_LABELS[entity.type]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={statusClassNames[entity.status]}>{entity.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <ConfidenceOverrideInput
                      key={`${entity.id}-${entity.confidence_override ?? 'auto'}`}
                      computedScore={entity.confidence_score}
                      disabled={savingOverride}
                      label={entity.name}
                      override={entity.confidence_override}
                      onSave={(override) =>
                        confidenceOverrideMutation.mutateAsync({ entity, override })
                      }
                    />
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate font-body text-sm text-[#777]">
                    {entity.aliases.length > 0 ? entity.aliases.join(', ') : 'None'}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      {TIMELINE_ENTITY_TYPES.has(entity.type) ? (
                        <Button
                          aria-label={`Edit timeline dates for ${entity.name}`}
                          size="sm"
                          type="button"
                          variant="ghost"
                          onClick={() => setDatesEntity(entity)}
                        >
                          <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                          Dates
                        </Button>
                      ) : null}
                      {isDisputed ? (
                        <Button
                          disabled={updating}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => toggleStatusMutation.mutate({ entity, status: 'draft' })}
                        >
                          Set draft
                        </Button>
                      ) : null}
                      <Button
                        disabled={updating}
                        size="sm"
                        type="button"
                        variant={isPublished ? 'outline' : 'default'}
                        onClick={() => toggleStatusMutation.mutate({ entity, status: nextStatus })}
                      >
                        {isPublished ? 'Set draft' : 'Publish'}
                      </Button>
                      <Button
                        disabled={updating || isDisputed}
                        size="sm"
                        type="button"
                        variant="outline"
                        onClick={() => toggleStatusMutation.mutate({ entity, status: 'disputed' })}
                      >
                        Mark disputed
                      </Button>
                      <Button
                        disabled={updating}
                        size="sm"
                        type="button"
                        variant="destructive"
                        onClick={() => {
                          if (window.confirm(ARCHIVE_ENTITY_CONFIRMATION)) {
                            toggleStatusMutation.mutate({ entity, status: 'archived' })
                          }
                        }}
                      >
                        Archive
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-xs text-[#777]">
          {totalCount === 0
            ? 'No matching entities'
            : `Page ${page + 1} of ${pageCount} - ${totalCount} entities`}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={page === 0 || entitiesQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => Math.max(current - 1, 0))
              setSelectedEntityIds([])
            }}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button
            disabled={page >= pageCount - 1 || entitiesQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => current + 1)
              setSelectedEntityIds([])
            }}
          >
            Next
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={datesEntity !== null} onOpenChange={(open) => !open && setDatesEntity(null)}>
        <DialogContent>
          {datesEntity ? (
            <TimelineDatesEditor entity={datesEntity} onClose={() => setDatesEntity(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const TimelineDatesEditor = ({
  entity,
  onClose,
}: {
  entity: AdminEntityRow
  onClose: () => void
}) => {
  const datesQuery = useQuery({
    queryKey: ['admin', 'entity-dates', entity.id],
    queryFn: () => getEntityTimelineDates(entity.id),
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>Timeline dates</DialogTitle>
        <p className="font-body text-sm text-[#777]">
          Set the era and sort year for <span className="text-ink">{entity.name}</span>. These place
          the entity on the public timeline. Use a negative year for BCE (e.g. -1200).
        </p>
      </DialogHeader>

      {datesQuery.isLoading || !datesQuery.data ? (
        <p className="mt-4 font-body text-sm text-[#777]">Loading current dates…</p>
      ) : (
        <TimelineDatesForm entityId={entity.id} initial={datesQuery.data} onClose={onClose} />
      )}
    </>
  )
}

const TimelineDatesForm = ({
  entityId,
  initial,
  onClose,
}: {
  entityId: string
  initial: { date_era: string | null; date_sort_year: number | null }
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const [dateEra, setDateEra] = useState(initial.date_era ?? '')
  const [dateSortYear, setDateSortYear] = useState(
    initial.date_sort_year !== null ? String(initial.date_sort_year) : ''
  )
  const [dateSortYearError, setDateSortYearError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: (dates: { date_era: string | null; date_sort_year: number | null }) =>
      updateEntityTimelineDates(entityId, dates),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['timeline', 'entities'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entity-dates', entityId] })
      onClose()
    },
  })

  const handleSave = () => {
    let parsedYear: number | null
    try {
      parsedYear = parseTimelineSortYear(dateSortYear)
    } catch (error) {
      setDateSortYearError(error instanceof Error ? error.message : 'Sort year is invalid.')
      return
    }

    setDateSortYearError(null)
    saveMutation.mutate({
      date_era: dateEra.trim() || null,
      date_sort_year: parsedYear,
    })
  }

  return (
    <div className="mt-4 space-y-4">
      <label className="block">
        <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
          Era
        </span>
        <Input
          list="timeline-era-options"
          placeholder="Classical Antiquity"
          value={dateEra}
          onChange={(event) => setDateEra(event.target.value)}
        />
        <datalist id="timeline-era-options">
          {TIMELINE_ERAS.map((era) => (
            <option key={era.key} value={era.label} />
          ))}
        </datalist>
      </label>

      <label className="block">
        <span className="mb-1.5 block font-display text-[9px] uppercase tracking-label text-[#777]">
          Sort year
        </span>
        <Input
          placeholder="-1200"
          type="number"
          value={dateSortYear}
          onChange={(event) => {
            setDateSortYear(event.target.value)
            setDateSortYearError(null)
          }}
        />
      </label>

      {dateSortYearError ? (
        <p className="font-body text-sm text-terracotta-dark">{dateSortYearError}</p>
      ) : null}

      {saveMutation.isError ? (
        <p className="font-body text-sm text-terracotta-dark">
          Dates could not be saved. Please try again.
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button size="sm" type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={saveMutation.isPending} size="sm" type="button" onClick={handleSave}>
          {saveMutation.isPending ? 'Saving…' : 'Save dates'}
        </Button>
      </div>
    </div>
  )
}

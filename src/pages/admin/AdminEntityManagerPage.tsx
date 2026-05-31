import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  publishAdminEntities,
  updateAdminEntityStatus,
  type AdminEntityRow,
  type ContentStatus,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const adminEntitiesQueryKey = ['admin', 'entities'] as const

const statusClassNames: Record<ContentStatus, string> = {
  archived: 'border-black/15 bg-stone text-[#777]',
  disputed: 'border-terracotta/30 bg-terracotta-light text-terracotta-dark',
  draft: 'border-iris/30 bg-iris-light text-iris-dark',
  published: 'border-verdigris bg-verdigris-light text-verdigris-dark',
}

const getMutationError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Entity update failed.'
}

export default function AdminEntityManagerPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all')
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([])
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
    onSuccess: async () => {
      setSelectedEntityIds([])
      await queryClient.invalidateQueries({ queryKey: adminEntitiesQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
    },
  })

  const entityPage = entitiesQuery.data
  const entities = entityPage?.entities ?? []
  const totalCount = entityPage?.totalCount ?? 0
  const pageSize = entityPage?.pageSize ?? 50
  const pageCount = Math.max(Math.ceil(totalCount / pageSize), 1)
  const selectedSet = useMemo(() => new Set(selectedEntityIds), [selectedEntityIds])
  const allVisibleSelected =
    entities.length > 0 && entities.every((entity) => selectedSet.has(entity.id))
  const actionError = toggleStatusMutation.error ?? bulkPublishMutation.error

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
              <TableHead>Confidence</TableHead>
              <TableHead>Aliases</TableHead>
              <TableHead className="text-right">Publication</TableHead>
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
              const nextStatus: ContentStatus = isPublished ? 'draft' : 'published'
              const updating =
                toggleStatusMutation.isPending &&
                toggleStatusMutation.variables?.entity.id === entity.id

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
                  <TableCell className="font-body text-sm text-ink">
                    {(entity.confidence_override ?? entity.confidence_score).toFixed(2)}
                  </TableCell>
                  <TableCell className="max-w-[260px] truncate font-body text-sm text-[#777]">
                    {entity.aliases.length > 0 ? entity.aliases.join(', ') : 'None'}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        disabled={updating || entity.status === 'disputed'}
                        size="sm"
                        type="button"
                        variant={isPublished ? 'outline' : 'default'}
                        onClick={() => toggleStatusMutation.mutate({ entity, status: nextStatus })}
                      >
                        {isPublished ? 'Set draft' : 'Publish'}
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
    </div>
  )
}

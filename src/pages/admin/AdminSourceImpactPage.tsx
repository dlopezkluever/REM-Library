import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ROUTES } from '@/constants/routes'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import {
  getAdminSourceById,
  getSourceImpact,
  markSourceClaimsDisputed,
  unpublishSourceClaims,
  updateAdminClaimStatus,
  updateAdminEntityStatus,
  type AdminClaimRow,
  type AdminEntityRow,
  type ContentStatus,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const statusClassNames: Record<ContentStatus, string> = {
  archived: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
  disputed: 'border-amber-300/70 bg-amber-50 text-amber-800',
  draft: 'border-iris/30 bg-iris-light text-iris-dark',
  published: 'border-verdigris bg-verdigris-light text-verdigris-dark',
}

const getMutationError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Source impact action failed.'
}

type BulkAction = 'dispute-claims' | 'unpublish-claims'
type BulkMutationInput = { action: BulkAction; claimIds: string[] }
type ImpactStatusFilter = 'all' | 'published' | 'draft' | 'disputed'

const impactStatusFilters: Array<{ label: string; value: ImpactStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'draft' },
  { label: 'Disputed', value: 'disputed' },
]

const getEffectiveConfidence = (row: AdminClaimRow | AdminEntityRow) =>
  row.confidence_override ?? row.confidence_score

const ConfidenceCell = ({ row }: { row: AdminClaimRow | AdminEntityRow }) => {
  const effectiveScore = getEffectiveConfidence(row)

  if (row.confidence_override === null) {
    return <span>{effectiveScore.toFixed(2)}</span>
  }

  return (
    <span>
      {effectiveScore.toFixed(2)} override
      <span className="ml-1 text-[#777]">auto {row.confidence_score.toFixed(2)}</span>
    </span>
  )
}

export default function AdminSourceImpactPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const sourceId = id ?? ''
  const sourceQueryKey = ['admin', 'source', sourceId] as const
  const impactQueryKey = ['admin', 'source-impact', sourceId] as const
  const [statusFilter, setStatusFilter] = useState<ImpactStatusFilter>('all')

  const sourceQuery = useQuery({
    enabled: Boolean(sourceId),
    queryKey: sourceQueryKey,
    queryFn: () => getAdminSourceById(sourceId),
  })
  const impactQuery = useQuery({
    enabled: Boolean(sourceId),
    queryKey: impactQueryKey,
    queryFn: () => getSourceImpact(sourceId),
  })

  const entityStatusMutation = useMutation({
    mutationFn: ({ entity, status }: { entity: AdminEntityRow; status: ContentStatus }) =>
      updateAdminEntityStatus(entity.id, status),
    onSuccess: async () => {
      await invalidateImpactQueries(queryClient, sourceId)
    },
  })

  const claimStatusMutation = useMutation({
    mutationFn: ({ claim, status }: { claim: AdminClaimRow; status: ContentStatus }) =>
      updateAdminClaimStatus(claim.id, status),
    onSuccess: async () => {
      await invalidateImpactQueries(queryClient, sourceId)
    },
  })

  const bulkMutation = useMutation({
    mutationFn: ({ action, claimIds }: BulkMutationInput) =>
      action === 'unpublish-claims'
        ? unpublishSourceClaims(sourceId, claimIds)
        : markSourceClaimsDisputed(sourceId, claimIds),
    onSuccess: async () => {
      await invalidateImpactQueries(queryClient, sourceId)
    },
  })

  const impact = impactQuery.data
  const allEntities = impact?.entities ?? []
  const allClaims = impact?.claims ?? []
  const entities =
    statusFilter === 'all'
      ? allEntities
      : allEntities.filter((entity) => entity.status === statusFilter)
  const claims =
    statusFilter === 'all' ? allClaims : allClaims.filter((claim) => claim.status === statusFilter)
  const unpublishClaimIds = claims
    .filter((claim) => claim.status === 'published')
    .map((claim) => claim.id)
  const disputeClaimIds = claims
    .filter((claim) => claim.status === 'published' || claim.status === 'draft')
    .map((claim) => claim.id)
  const actionError = entityStatusMutation.error ?? claimStatusMutation.error ?? bulkMutation.error
  const isLoading = sourceQuery.isLoading || impactQuery.isLoading
  const hasError = sourceQuery.error || impactQuery.error

  return (
    <div className="space-y-6">
      <div>
        <Button asChild className="mb-4" size="sm" variant="ghost">
          <Link to={sourceId ? `/admin/sources/${sourceId}` : ROUTES.ADMIN_SOURCES}>
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Source detail
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl uppercase text-ink">Source Impact</h1>
            <p className="mt-1 font-body text-sm text-[#777]">
              {sourceQuery.data?.title ?? 'Entities and claims linked to this source.'}
            </p>
          </div>
          <Button
            disabled={impactQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void impactQuery.refetch()}
          >
            <RefreshCw
              aria-hidden="true"
              className={cn('h-3.5 w-3.5', impactQuery.isFetching && 'animate-spin')}
            />
            Refresh
          </Button>
        </div>
      </div>

      {actionError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">{getMutationError(actionError)}</p>
        </div>
      ) : null}

      {hasError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-5">
          <p className="font-body text-sm text-terracotta-dark">Source impact could not load.</p>
        </div>
      ) : null}

      {isLoading ? <ImpactSkeleton /> : null}

      {!isLoading && !hasError ? (
        <>
          {allEntities.length === 0 && allClaims.length === 0 ? (
            <div className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
              <p className="font-body text-sm text-[#777]">
                No entities or claims have been confirmed from this source yet.
              </p>
            </div>
          ) : null}

          <StatusFilterTabs
            claimCount={claims.length}
            entityCount={entities.length}
            totalClaimCount={allClaims.length}
            totalEntityCount={allEntities.length}
            value={statusFilter}
            onChange={setStatusFilter}
          />

          <BulkActionBar
            disabled={bulkMutation.isPending}
            disputeCount={disputeClaimIds.length}
            unpublishCount={unpublishClaimIds.length}
            onConfirm={(action) =>
              bulkMutation.mutate({
                action,
                claimIds: action === 'unpublish-claims' ? unpublishClaimIds : disputeClaimIds,
              })
            }
          />

          <EntitiesSection entities={entities} mutation={entityStatusMutation} />

          <ClaimsSection claims={claims} mutation={claimStatusMutation} />
        </>
      ) : null}
    </div>
  )
}

const invalidateImpactQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  sourceId: string
) => {
  await queryClient.invalidateQueries({ queryKey: ['admin', 'source-impact', sourceId] })
  await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
  await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
  await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
  await queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-counts'] })
}

const ImpactSkeleton = () => (
  <div className="space-y-5">
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-56 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
)

const StatusFilterTabs = ({
  claimCount,
  entityCount,
  totalClaimCount,
  totalEntityCount,
  value,
  onChange,
}: {
  claimCount: number
  entityCount: number
  totalClaimCount: number
  totalEntityCount: number
  value: ImpactStatusFilter
  onChange: (value: ImpactStatusFilter) => void
}) => (
  <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-0.5 border-black/[0.09] bg-white p-4">
    <Tabs value={value} onValueChange={(nextValue) => onChange(nextValue as ImpactStatusFilter)}>
      <TabsList>
        {impactStatusFilters.map((filter) => (
          <TabsTrigger key={filter.value} value={filter.value}>
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
    <p className="font-body text-xs text-[#777]">
      Showing {entityCount} of {totalEntityCount} entities and {claimCount} of {totalClaimCount}{' '}
      claims.
    </p>
  </section>
)

const BulkActionBar = ({
  disabled,
  disputeCount,
  unpublishCount,
  onConfirm,
}: {
  disabled: boolean
  disputeCount: number
  unpublishCount: number
  onConfirm: (action: BulkAction) => void
}) => {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-0.5 border-black/[0.09] bg-white p-4">
      <div>
        <h2 className="font-display text-sm uppercase tracking-label text-ink">Bulk Actions</h2>
        <p className="mt-1 font-body text-xs text-[#777]">
          Apply status changes to eligible claims in the current filter.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <ConfirmBulkActionButton
          action="unpublish-claims"
          confirmText={`Unpublish ${unpublishCount} published claim${
            unpublishCount === 1 ? '' : 's'
          } in the current filter? They will move to draft.`}
          disabled={disabled || unpublishCount === 0}
          label={`Unpublish published (${unpublishCount})`}
          title="Unpublish Claims"
          onConfirm={onConfirm}
        />
        <ConfirmBulkActionButton
          action="dispute-claims"
          confirmText={`Mark ${disputeCount} published or draft claim${
            disputeCount === 1 ? '' : 's'
          } in the current filter as disputed?`}
          disabled={disabled || disputeCount === 0}
          label={`Mark disputed (${disputeCount})`}
          title="Mark Claims Disputed"
          onConfirm={onConfirm}
        />
      </div>
    </section>
  )
}

const ConfirmBulkActionButton = ({
  action,
  confirmText,
  disabled,
  label,
  title,
  onConfirm,
}: {
  action: BulkAction
  confirmText: string
  disabled: boolean
  label: string
  title: string
  onConfirm: (action: BulkAction) => void
}) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button disabled={disabled} size="sm" type="button" variant="outline">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{confirmText}</DialogDescription>
        </DialogHeader>
        <div className="mt-5 flex justify-end gap-3">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button type="button" onClick={() => onConfirm(action)}>
              Confirm
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const EntitiesSection = ({
  entities,
  mutation,
}: {
  entities: AdminEntityRow[]
  mutation: UseMutationResult<
    AdminEntityRow,
    Error,
    {
      entity: AdminEntityRow
      status: ContentStatus
    }
  >
}) => (
  <section className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
    <div className="border-b border-b-0.5 border-b-black/[0.06] p-4">
      <h2 className="font-display text-sm uppercase tracking-label text-ink">
        Entities ({entities.length})
      </h2>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entities.length === 0 ? (
          <TableRow>
            <TableCell className="font-body text-sm text-[#777]" colSpan={5}>
              No entities are linked to this source.
            </TableCell>
          </TableRow>
        ) : null}
        {entities.map((entity) => {
          const isPublished = entity.status === 'published'
          const nextStatus: ContentStatus = isPublished ? 'draft' : 'published'
          const updating = mutation.isPending && mutation.variables?.entity.id === entity.id

          return (
            <TableRow key={entity.id}>
              <TableCell>
                <Link
                  className="inline-flex max-w-[320px] items-center gap-2 truncate font-body text-sm text-ink hover:text-verdigris"
                  to={`/admin/entities?search=${encodeURIComponent(entity.name)}`}
                >
                  {entity.name}
                  <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{ENTITY_LABELS[entity.type]}</Badge>
              </TableCell>
              <TableCell>
                <Badge className={statusClassNames[entity.status]}>{entity.status}</Badge>
              </TableCell>
              <TableCell className="font-body text-sm text-ink">
                <ConfidenceCell row={entity} />
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <Button
                    disabled={updating}
                    size="sm"
                    type="button"
                    variant={isPublished ? 'outline' : 'default'}
                    onClick={() => mutation.mutate({ entity, status: nextStatus })}
                  >
                    {isPublished ? 'Unpublish' : 'Publish'}
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  </section>
)

const ClaimsSection = ({
  claims,
  mutation,
}: {
  claims: Array<AdminClaimRow & { entityNames: string[] }>
  mutation: UseMutationResult<
    void,
    Error,
    {
      claim: AdminClaimRow
      status: ContentStatus
    }
  >
}) => (
  <section className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
    <div className="border-b border-b-0.5 border-b-black/[0.06] p-4">
      <h2 className="font-display text-sm uppercase tracking-label text-ink">
        Claims ({claims.length})
      </h2>
    </div>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Statement</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Score</TableHead>
          <TableHead>Entities</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {claims.length === 0 ? (
          <TableRow>
            <TableCell className="font-body text-sm text-[#777]" colSpan={5}>
              No claims are linked to this source.
            </TableCell>
          </TableRow>
        ) : null}
        {claims.map((claim) => {
          const isPublished = claim.status === 'published'
          const isDisputed = claim.status === 'disputed'
          const nextStatus: ContentStatus = isPublished ? 'draft' : 'published'
          const updating = mutation.isPending && mutation.variables?.claim.id === claim.id

          return (
            <TableRow key={claim.id}>
              <TableCell>
                <Link
                  className="line-clamp-2 max-w-[460px] font-body text-sm text-ink hover:text-verdigris"
                  to={`/admin/claims?search=${encodeURIComponent(claim.statement)}`}
                >
                  {claim.statement}
                </Link>
              </TableCell>
              <TableCell>
                <Badge className={statusClassNames[claim.status]}>{claim.status}</Badge>
              </TableCell>
              <TableCell className="font-body text-sm text-ink">
                <ConfidenceCell row={claim} />
              </TableCell>
              <TableCell className="max-w-[260px] truncate font-body text-sm text-[#777]">
                {claim.entityNames.length > 0 ? claim.entityNames.join(', ') : 'None'}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    disabled={updating}
                    size="sm"
                    type="button"
                    variant={isPublished ? 'outline' : 'default'}
                    onClick={() => mutation.mutate({ claim, status: nextStatus })}
                  >
                    {isPublished ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button
                    disabled={updating || isDisputed}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => mutation.mutate({ claim, status: 'disputed' })}
                  >
                    Mark disputed
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  </section>
)

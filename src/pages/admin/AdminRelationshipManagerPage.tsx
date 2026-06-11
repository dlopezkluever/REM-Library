import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronRight as ChevronRightIcon,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  archiveRelationship,
  getAdminRelationships,
  restoreRelationship,
  updateRelationshipWeight,
  type AdminRelationshipListRow,
  type RelationshipStatus,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const adminRelationshipsQueryKey = ['admin', 'relationships'] as const

const statusClassNames: Record<RelationshipStatus, string> = {
  active: 'border-verdigris bg-verdigris-light text-verdigris-dark',
  archived: 'border-terracotta/25 bg-terracotta-light text-terracotta-dark',
}

const formatRelationshipType = (type: string) => {
  return type.split('_').join(' ')
}

const getMutationError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Relationship update failed.'
}

interface RelationshipWeightInputProps {
  disabled: boolean
  relationship: AdminRelationshipListRow
  onSave: (weight: number | null) => Promise<unknown>
}

const RelationshipWeightInput = ({
  disabled,
  relationship,
  onSave,
}: RelationshipWeightInputProps) => {
  const [value, setValue] = useState(String(relationship.effectiveWeight))

  const handleBlur = async () => {
    if (!value.trim()) {
      if (relationship.weight_override === null) {
        setValue(String(relationship.effectiveWeight))
        return
      }

      try {
        await onSave(null)
      } catch {
        setValue(String(relationship.effectiveWeight))
      }
      return
    }

    const nextWeight = Number.parseFloat(value)

    if (!Number.isFinite(nextWeight) || nextWeight < 0 || nextWeight > 1) {
      setValue(String(relationship.effectiveWeight))
      return
    }

    if (nextWeight === relationship.effectiveWeight) {
      return
    }

    try {
      await onSave(nextWeight)
    } catch {
      setValue(String(relationship.effectiveWeight))
    }
  }

  return (
    <div>
      <Input
        aria-label={`Weight for ${relationship.fromEntity?.name ?? 'source'} to ${
          relationship.toEntity?.name ?? 'target'
        }`}
        className="h-8 w-24"
        disabled={disabled}
        max={1}
        min={0}
        step={0.01}
        type="number"
        value={value}
        onBlur={() => void handleBlur()}
        onChange={(event) => setValue(event.target.value)}
      />
      {relationship.weight_override !== null ? (
        <p className="mt-1 font-body text-[11px] text-[#777]">
          override, auto {relationship.computedWeight.toFixed(2)}
        </p>
      ) : null}
    </div>
  )
}

export default function AdminRelationshipManagerPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RelationshipStatus | 'all'>('active')
  const [expandedIds, setExpandedIds] = useState<string[]>([])
  const [relationshipToArchive, setRelationshipToArchive] =
    useState<AdminRelationshipListRow | null>(null)

  const relationshipsQuery = useQuery({
    queryKey: [...adminRelationshipsQueryKey, page, search, statusFilter],
    queryFn: () =>
      getAdminRelationships({
        page,
        search,
        status: statusFilter,
      }),
  })

  const weightMutation = useMutation({
    mutationFn: ({
      relationship,
      weight,
    }: {
      relationship: AdminRelationshipListRow
      weight: number | null
    }) => updateRelationshipWeight(relationship.id, weight),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminRelationshipsQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['relationships', 'published'] })
      await queryClient.invalidateQueries({ queryKey: ['entity'] })
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (relationship: AdminRelationshipListRow) => archiveRelationship(relationship.id),
    onSuccess: async () => {
      setRelationshipToArchive(null)
      await queryClient.invalidateQueries({ queryKey: adminRelationshipsQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['relationships', 'published'] })
      await queryClient.invalidateQueries({ queryKey: ['entity'] })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (relationship: AdminRelationshipListRow) => restoreRelationship(relationship.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminRelationshipsQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['relationships', 'published'] })
      await queryClient.invalidateQueries({ queryKey: ['entity'] })
    },
  })

  const relationshipPage = relationshipsQuery.data
  const relationships = relationshipPage?.relationships ?? []
  const totalCount = relationshipPage?.totalCount ?? 0
  const pageSize = relationshipPage?.pageSize ?? 50
  const pageCount = Math.max(Math.ceil(totalCount / pageSize), 1)
  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds])
  const actionError = weightMutation.error ?? archiveMutation.error ?? restoreMutation.error

  const toggleExpanded = (relationshipId: string) => {
    setExpandedIds((current) =>
      current.includes(relationshipId)
        ? current.filter((expandedId) => expandedId !== relationshipId)
        : [...current, relationshipId]
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Relationships</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            {relationshipsQuery.isLoading
              ? 'Loading relationship rows.'
              : `${totalCount} relationship${totalCount === 1 ? '' : 's'} in this view.`}
          </p>
        </div>
        <Button
          disabled={relationshipsQuery.isFetching}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void relationshipsQuery.refetch()}
        >
          <RefreshCw
            aria-hidden="true"
            className={cn('h-3.5 w-3.5', relationshipsQuery.isFetching && 'animate-spin')}
          />
          Refresh
        </Button>
      </div>

      {actionError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">
            {getMutationError(actionError)}
          </p>
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
              placeholder="Search entity names"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
                setExpandedIds([])
              }}
            />
          </div>
          <select
            aria-label="Filter by relationship status"
            className="h-10 rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as RelationshipStatus | 'all')
              setPage(0)
              setExpandedIds([])
            }}
          >
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>
      </section>

      <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From Entity</TableHead>
              <TableHead>To Entity</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Weight</TableHead>
              <TableHead>Claim Count</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {relationshipsQuery.isLoading ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  Loading relationships...
                </TableCell>
              </TableRow>
            ) : null}

            {relationshipsQuery.error ? (
              <TableRow>
                <TableCell className="font-body text-sm text-terracotta-dark" colSpan={7}>
                  Relationships could not load.
                </TableCell>
              </TableRow>
            ) : null}

            {!relationshipsQuery.isLoading &&
            !relationshipsQuery.error &&
            relationships.length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  No relationships match this view.
                </TableCell>
              </TableRow>
            ) : null}

            {relationships.map((relationship) => {
              const isExpanded = expandedSet.has(relationship.id)
              const isArchived = relationship.status === 'archived'
              const savingWeight =
                weightMutation.isPending &&
                weightMutation.variables?.relationship.id === relationship.id
              const archiving =
                archiveMutation.isPending && archiveMutation.variables?.id === relationship.id
              const restoring =
                restoreMutation.isPending && restoreMutation.variables?.id === relationship.id

              return (
                <Fragment key={relationship.id}>
                  <TableRow key={relationship.id}>
                    <TableCell>
                      <div>
                        <p className="font-body text-sm text-ink">
                          {relationship.fromEntity?.name ?? 'Unknown entity'}
                        </p>
                        {relationship.fromEntity ? (
                          <p className="mt-1 font-display text-[9px] uppercase tracking-label text-[#777]">
                            {ENTITY_LABELS[relationship.fromEntity.type]}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-body text-sm text-ink">
                          {relationship.toEntity?.name ?? 'Unknown entity'}
                        </p>
                        {relationship.toEntity ? (
                          <p className="mt-1 font-display text-[9px] uppercase tracking-label text-[#777]">
                            {ENTITY_LABELS[relationship.toEntity.type]}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="font-body text-sm text-ink">
                      {formatRelationshipType(relationship.type)}
                    </TableCell>
                    <TableCell>
                      <RelationshipWeightInput
                        key={`${relationship.id}-${relationship.effectiveWeight}-${relationship.weight_override ?? 'auto'}`}
                        disabled={savingWeight || archiving || restoring}
                        relationship={relationship}
                        onSave={(weight) =>
                          weightMutation.mutateAsync({
                            relationship,
                            weight,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        aria-expanded={isExpanded}
                        disabled={relationship.claim_ids.length === 0}
                        size="sm"
                        type="button"
                        variant="ghost"
                        onClick={() => toggleExpanded(relationship.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRightIcon aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {relationship.claim_ids.length}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusClassNames[relationship.status]}>
                        {relationship.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {isArchived ? (
                          <Button
                            disabled={restoring}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => restoreMutation.mutate(relationship)}
                          >
                            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                            Restore
                          </Button>
                        ) : (
                          <Button
                            disabled={archiving}
                            size="sm"
                            type="button"
                            variant="destructive"
                            onClick={() => setRelationshipToArchive(relationship)}
                          >
                            <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                            Archive
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {isExpanded ? (
                    <TableRow key={`${relationship.id}-claims`} className="bg-stone/40">
                      <TableCell colSpan={7}>
                        <div className="space-y-2">
                          <p className="font-display text-[10px] uppercase tracking-label text-[#777]">
                            Backing claims
                          </p>
                          {relationship.backingClaims.length > 0 ? (
                            <ul className="space-y-2">
                              {relationship.backingClaims.map((claim) => (
                                <li
                                  key={claim.id}
                                  className="flex items-start justify-between gap-3 font-body text-sm"
                                >
                                  <div>
                                    <p className="line-clamp-2 text-ink">{claim.statement}</p>
                                    <Badge className={cn('mt-1', statusClassNames.active)}>
                                      {claim.status}
                                    </Badge>
                                  </div>
                                  <Button asChild size="sm" type="button" variant="outline">
                                    <Link to={`/claim/${claim.id}`}>
                                      View
                                      <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
                                    </Link>
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="font-body text-sm text-[#777]">
                              No backing claims are available for this relationship.
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-body text-xs text-[#777]">
          {totalCount === 0
            ? 'No matching relationships'
            : `Page ${page + 1} of ${pageCount} - ${totalCount} relationships`}
        </p>
        <div className="flex gap-2">
          <Button
            disabled={page === 0 || relationshipsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => Math.max(current - 1, 0))
              setExpandedIds([])
            }}
          >
            <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Previous
          </Button>
          <Button
            disabled={page >= pageCount - 1 || relationshipsQuery.isFetching}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => {
              setPage((current) => current + 1)
              setExpandedIds([])
            }}
          >
            Next
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(relationshipToArchive)}
        onOpenChange={(open) => {
          if (!open && !archiveMutation.isPending) {
            setRelationshipToArchive(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive relationship</DialogTitle>
            <DialogDescription>
              This relationship will no longer appear in the public graph. It can be restored from
              the archived filter.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild>
              <Button disabled={archiveMutation.isPending} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={!relationshipToArchive || archiveMutation.isPending}
              type="button"
              variant="destructive"
              onClick={() => {
                if (relationshipToArchive) {
                  archiveMutation.mutate(relationshipToArchive)
                }
              }}
            >
              <Archive aria-hidden="true" className="h-4 w-4" />
              Archive
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

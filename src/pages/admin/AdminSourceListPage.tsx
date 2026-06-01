import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ExternalLink, Plus, RefreshCw, RotateCcw } from 'lucide-react'
import {
  formatLabels,
  getStageClassName,
  SourceFormatIcon,
  stageLabels,
} from '@/components/admin/sourceDisplay'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ROUTES } from '@/constants/routes'
import {
  archiveAdminSource,
  getPipelineRerunAction,
  getAdminSourceListRows,
  rerunSourcePipelineStage,
  restoreAdminSource,
  updateAdminSourceStatus,
  type AdminSourceRow,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const adminSourceListQueryKey = ['admin', 'source-list'] as const

const getMutationError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'The source action failed.'
}

export default function AdminSourceListPage() {
  const queryClient = useQueryClient()
  const [sourcePendingArchive, setSourcePendingArchive] = useState<AdminSourceRow | null>(null)
  const sourceListQuery = useQuery({
    queryKey: adminSourceListQueryKey,
    queryFn: getAdminSourceListRows,
  })

  const archiveMutation = useMutation({
    mutationFn: archiveAdminSource,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminSourceListQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const rerunMutation = useMutation({
    mutationFn: (source: AdminSourceRow) =>
      rerunSourcePipelineStage(source.id, source.pipeline_stage, source),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminSourceListQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreAdminSource,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminSourceListQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const statusMutation = useMutation({
    mutationFn: ({
      source,
      status,
    }: {
      source: AdminSourceRow
      status: AdminSourceRow['status']
    }) => updateAdminSourceStatus(source.id, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminSourceListQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
    },
  })

  const rows = sourceListQuery.data ?? []
  const actionError =
    archiveMutation.error ?? rerunMutation.error ?? restoreMutation.error ?? statusMutation.error

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl uppercase text-ink">Sources</h1>
          <p className="mt-1 font-body text-sm text-[#777]">
            Manage ingested sources, review state, and extraction actions.
          </p>
        </div>
        <Button asChild>
          <Link to={ROUTES.ADMIN_SOURCE_NEW}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add source
          </Link>
        </Button>
      </div>

      {actionError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">{getMutationError(actionError)}</p>
        </div>
      ) : null}

      <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Pipeline</TableHead>
              <TableHead>Extractions</TableHead>
              <TableHead>Review</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sourceListQuery.isLoading ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  Loading sources...
                </TableCell>
              </TableRow>
            ) : null}

            {sourceListQuery.error ? (
              <TableRow>
                <TableCell className="font-body text-sm text-terracotta-dark" colSpan={7}>
                  Sources could not load.
                </TableCell>
              </TableRow>
            ) : null}

            {!sourceListQuery.isLoading && !sourceListQuery.error && rows.length === 0 ? (
              <TableRow>
                <TableCell className="font-body text-sm text-[#777]" colSpan={7}>
                  No sources have been added yet.
                </TableCell>
              </TableRow>
            ) : null}

            {rows.map(({ extractionCount, pendingReviewCount, reviewStatus, source }) => {
              const archiveInFlight =
                archiveMutation.isPending && archiveMutation.variables === source.id
              const rerunInFlight =
                rerunMutation.isPending && rerunMutation.variables?.id === source.id
              const restoreInFlight =
                restoreMutation.isPending && restoreMutation.variables === source.id
              const statusInFlight =
                statusMutation.isPending && statusMutation.variables?.source.id === source.id
              const isArchived = source.status === 'archived'
              const isPublished = source.status === 'published'
              const rerunAction = getPipelineRerunAction(source.pipeline_stage, source)

              return (
                <TableRow key={source.id} className={cn(isArchived && 'opacity-60')}>
                  <TableCell>
                    <div className="max-w-[320px]">
                      <Link
                        className="truncate font-body text-sm text-ink hover:text-verdigris"
                        to={`/admin/sources/${source.id}`}
                      >
                        {source.title}
                      </Link>
                      <p className="font-body text-[11px] text-[#888]">
                        {source.authors.length > 0 ? source.authors.join(', ') : 'Unknown author'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-body text-xs text-[#777]">
                      <SourceFormatIcon format={source.format} />
                      {formatLabels[source.format]}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        source.tier === 'primary'
                          ? 'border-verdigris bg-verdigris-light text-verdigris-dark'
                          : 'border-black/15 bg-stone text-[#777]'
                      )}
                    >
                      {source.tier === 'primary' ? 'Tier 1' : 'Tier 2'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStageClassName(source.pipeline_stage)}>
                      {stageLabels[source.pipeline_stage]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-body text-sm text-ink">{extractionCount}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-body text-sm text-ink">{reviewStatus}</p>
                      <p className="font-body text-[11px] text-[#888]">
                        {pendingReviewCount} pending
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/admin/sources/${source.id}`}>
                          View
                          <ExternalLink aria-hidden="true" className="h-3 w-3" />
                        </Link>
                      </Button>
                      <Button
                        disabled={Boolean(rerunAction.disabledReason) || rerunInFlight}
                        size="sm"
                        title={rerunAction.disabledReason ?? undefined}
                        type="button"
                        variant="outline"
                        onClick={() => rerunMutation.mutate(source)}
                      >
                        <RefreshCw
                          aria-hidden="true"
                          className={cn('h-3 w-3', rerunInFlight && 'animate-spin')}
                        />
                        {rerunAction.label}
                      </Button>
                      {isArchived ? (
                        <Button
                          disabled={restoreInFlight}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => restoreMutation.mutate(source.id)}
                        >
                          <RotateCcw aria-hidden="true" className="h-3 w-3" />
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            disabled={statusInFlight}
                            size="sm"
                            type="button"
                            variant={isPublished ? 'outline' : 'default'}
                            onClick={() =>
                              statusMutation.mutate({
                                source,
                                status: isPublished ? 'draft' : 'published',
                              })
                            }
                          >
                            {isPublished ? 'Set draft' : 'Publish'}
                          </Button>
                          <Button
                            disabled={archiveInFlight}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => setSourcePendingArchive(source)}
                          >
                            <Archive aria-hidden="true" className="h-3 w-3" />
                            Archive
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={Boolean(sourcePendingArchive)}
        onOpenChange={(open) => {
          if (!open) {
            setSourcePendingArchive(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Source</DialogTitle>
            <DialogDescription>
              Archive {sourcePendingArchive?.title ?? 'this source'}? It will leave the dashboard
              pipeline monitor and can be restored from the source list or detail page.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={archiveMutation.isPending}
              type="button"
              variant="outline"
              onClick={() => {
                if (!sourcePendingArchive) {
                  return
                }

                archiveMutation.mutate(sourcePendingArchive.id, {
                  onSuccess: () => setSourcePendingArchive(null),
                })
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

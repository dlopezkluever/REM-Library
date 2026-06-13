import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, ArrowLeft, ExternalLink, RefreshCw, RotateCcw, X } from 'lucide-react'
import {
  failedStageMap,
  formatLabels,
  getStageClassName,
  pipelineOrder,
  stageLabels,
} from '@/components/admin/sourceDisplay'
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
import { ROUTES } from '@/constants/routes'
import {
  archiveAdminSource,
  getSourceAffectedEntityIds,
  getPipelineRerunAction,
  getAdminSourceById,
  recomputeConfidenceInBatches,
  rerunSourcePipelineStage,
  restoreAdminSource,
  sourceCategories,
  sourceCategoryLabels,
  subscribeToSourceUpdates,
  triggerUrlFetch,
  updateAdminSourceStatus,
  updateSourceCategory,
  updateSourceRightsMetadata,
  updateSourceTier,
  type SourceCategory,
  type SourceTier,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'The source action failed.'
}

const MetadataRow = ({ label, value }: { label: string; value: ReactNode }) => {
  return (
    <div className="border-b border-b-0.5 border-b-black/[0.06] py-3 last:border-b-0">
      <p className="font-display text-[8px] uppercase tracking-label text-[#777]">{label}</p>
      <div className="mt-1 font-body text-sm text-ink">{value}</div>
    </div>
  )
}

export default function AdminSourceDetailPage() {
  const { id } = useParams()
  const location = useLocation()
  const queryClient = useQueryClient()
  const sourceQueryKey = useMemo(() => ['admin', 'source', id] as const, [id])
  const routeState = location.state as { triggerError?: string; triggerWarning?: string } | null
  const [routeWarning, setRouteWarning] = useState(
    routeState?.triggerError ?? routeState?.triggerWarning ?? null
  )
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false)
  const [tierMessage, setTierMessage] = useState<string | null>(null)
  const [rightsMessage, setRightsMessage] = useState<string | null>(null)
  const [license, setLicense] = useState('')
  const [rightsNotes, setRightsNotes] = useState('')
  const [attribution, setAttribution] = useState('')
  const [fairUseRationale, setFairUseRationale] = useState('')
  const [recomputeDialogOpen, setRecomputeDialogOpen] = useState(false)
  const [impactedEntityIds, setImpactedEntityIds] = useState<string[]>([])

  const sourceQuery = useQuery({
    enabled: Boolean(id),
    queryKey: sourceQueryKey,
    queryFn: () => getAdminSourceById(id ?? ''),
  })
  const source = sourceQuery.data

  const archiveMutation = useMutation({
    mutationFn: archiveAdminSource,
    onSuccess: async (source) => {
      queryClient.setQueryData(sourceQueryKey, source)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const rerunMutation = useMutation({
    mutationFn: () => {
      if (!sourceQuery.data) {
        throw new Error('Source is not loaded yet.')
      }

      return rerunSourcePipelineStage(
        sourceQuery.data.id,
        sourceQuery.data.pipeline_stage,
        sourceQuery.data
      )
    },
    onSuccess: async () => {
      setRouteWarning(null)
      await queryClient.invalidateQueries({ queryKey: sourceQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: restoreAdminSource,
    onSuccess: async (source) => {
      queryClient.setQueryData(sourceQueryKey, source)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const statusMutation = useMutation({
    mutationFn: (status: NonNullable<typeof source>['status']) => {
      if (!source) {
        throw new Error('Source is not loaded yet.')
      }

      return updateAdminSourceStatus(source.id, status)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sourceQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
    },
  })

  const tierMutation = useMutation({
    mutationFn: async (tier: SourceTier) => {
      if (!source) {
        throw new Error('Source is not loaded yet.')
      }

      const updatedSource = await updateSourceTier(source.id, tier)
      const affectedEntityIds = await getSourceAffectedEntityIds(source.id)

      return {
        impactedEntityIds: affectedEntityIds,
        source: updatedSource,
      }
    },
    onMutate: () => {
      setTierMessage(null)
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(sourceQueryKey, result.source)
      setImpactedEntityIds(result.impactedEntityIds)
      setTierMessage('Source tier updated.')
      setRecomputeDialogOpen(true)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-impact', source?.id] })
    },
    onError: (error) => {
      setTierMessage(getErrorMessage(error))
    },
  })

  const categoryMutation = useMutation({
    mutationFn: async (category: SourceCategory) => {
      if (!source) {
        throw new Error('Source is not loaded yet.')
      }

      const updatedSource = await updateSourceCategory(source.id, category)
      const affectedEntityIds = await getSourceAffectedEntityIds(source.id)

      return {
        impactedEntityIds: affectedEntityIds,
        source: updatedSource,
      }
    },
    onMutate: () => {
      setTierMessage(null)
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(sourceQueryKey, result.source)
      setImpactedEntityIds(result.impactedEntityIds)
      setTierMessage('Source category updated.')
      setRecomputeDialogOpen(true)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-impact', source?.id] })
    },
    onError: (error) => {
      setTierMessage(getErrorMessage(error))
    },
  })

  const rightsMutation = useMutation({
    mutationFn: () => {
      if (!source) {
        throw new Error('Source is not loaded yet.')
      }

      return updateSourceRightsMetadata(source.id, {
        attribution: attribution.trim() || null,
        fair_use_rationale: fairUseRationale.trim() || null,
        license: license.trim() || null,
        rights_notes: rightsNotes.trim() || null,
      })
    },
    onMutate: () => setRightsMessage(null),
    onSuccess: async (updatedSource) => {
      queryClient.setQueryData(sourceQueryKey, updatedSource)
      setRightsMessage('Rights metadata saved.')
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
    },
    onError: (error) => setRightsMessage(getErrorMessage(error)),
  })

  const urlFetchMutation = useMutation({
    mutationFn: () => {
      if (!source) {
        throw new Error('Source is not loaded yet.')
      }

      return triggerUrlFetch(source.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sourceQueryKey })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'source-list'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] })
    },
  })

  const recomputeMutation = useMutation({
    mutationFn: async (entityIds: string[]) => {
      await recomputeConfidenceInBatches(entityIds)
    },
    onSuccess: async () => {
      setTierMessage('Confidence recomputation started for affected entities.')
      setRecomputeDialogOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['admin', 'entities'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'claims'] })
      await queryClient.invalidateQueries({ queryKey: ['admin', 'content-stats'] })
    },
    onError: (error) => {
      setTierMessage(getErrorMessage(error))
    },
  })

  useEffect(() => {
    if (!id) {
      return undefined
    }

    return subscribeToSourceUpdates((change) => {
      if (change.eventType !== 'DELETE' && change.source.id === id) {
        queryClient.setQueryData(sourceQueryKey, change.source)
      }
    })
  }, [id, queryClient, sourceQueryKey])

  useEffect(() => {
    if (!source) {
      return
    }

    /* eslint-disable react-hooks/set-state-in-effect -- Sync editable rights draft fields when a source record loads. */
    setLicense(source.license ?? '')
    setRightsNotes(source.rights_notes ?? '')
    setAttribution(source.attribution ?? '')
    setFairUseRationale(source.fair_use_rationale ?? '')
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [source])

  const currentStage = source
    ? (failedStageMap[source.pipeline_stage] ?? source.pipeline_stage)
    : null
  const activeStageIndex = currentStage ? pipelineOrder.indexOf(currentStage) : -1
  const actionError =
    archiveMutation.error ??
    rerunMutation.error ??
    restoreMutation.error ??
    statusMutation.error ??
    tierMutation.error ??
    categoryMutation.error ??
    rightsMutation.error ??
    urlFetchMutation.error ??
    recomputeMutation.error
  const rerunAction = source ? getPipelineRerunAction(source.pipeline_stage, source) : null

  const visibleRouteWarning =
    source?.pipeline_stage && source.pipeline_stage !== 'uploaded' ? null : routeWarning

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button asChild className="mb-4" size="sm" variant="ghost">
          <Link to={ROUTES.ADMIN_SOURCES}>
            <ArrowLeft aria-hidden="true" className="h-3.5 w-3.5" />
            Sources
          </Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-xl uppercase text-ink">
              {sourceQuery.isLoading ? 'Loading Source' : (source?.title ?? 'Source Not Found')}
            </h1>
            <p className="mt-1 font-body text-sm text-[#777]">
              Real-time pipeline status and source metadata.
            </p>
          </div>
          {source ? (
            <Badge className={getStageClassName(source.pipeline_stage)}>
              {stageLabels[source.pipeline_stage]}
            </Badge>
          ) : null}
        </div>
      </div>

      {visibleRouteWarning ? (
        <div className="rounded border border-0.5 border-[#C9A84C]/40 bg-[#FBF6DF] p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="font-body text-sm text-[#6F5A12]">
              {routeState?.triggerError
                ? `Source was saved, but the transcription function did not start: ${visibleRouteWarning}`
                : visibleRouteWarning}
            </p>
            <Button
              aria-label="Dismiss warning"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setRouteWarning(null)}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">{getErrorMessage(actionError)}</p>
        </div>
      ) : null}

      {source?.pipeline_error ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-display text-[9px] uppercase tracking-label text-terracotta-dark">
            Latest Pipeline Error
          </p>
          <p className="mt-1 font-body text-sm text-terracotta-dark">{source.pipeline_error}</p>
        </div>
      ) : null}

      {sourceQuery.error ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-5">
          <p className="font-body text-sm text-terracotta-dark">Source could not load.</p>
        </div>
      ) : null}

      {source ? (
        <>
          <section className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-sm uppercase tracking-label text-ink">
                  Pipeline Progress
                </h2>
                <p className="mt-1 font-body text-xs text-[#777]">
                  Updates are applied from Supabase Realtime when the stage changes.
                </p>
              </div>
              <p className="font-body text-xs text-[#777]">
                Entered stage {new Date(source.pipeline_stage_entered_at).toLocaleString()}
              </p>
            </div>

            <div className="grid gap-2 md:grid-cols-7">
              {pipelineOrder.map((stage, index) => {
                const isActive = source.pipeline_stage === stage
                const isComplete = activeStageIndex > index
                const isFailed = failedStageMap[source.pipeline_stage] === stage

                return (
                  <div
                    key={stage}
                    className={cn(
                      'rounded border border-0.5 p-3',
                      isActive || isComplete
                        ? 'border-verdigris/50 bg-verdigris-light'
                        : 'border-black/[0.09] bg-stone/40',
                      isFailed && 'border-terracotta/50 bg-terracotta-light'
                    )}
                  >
                    <p
                      className={cn(
                        'font-display text-[8px] uppercase tracking-label',
                        isActive || isComplete ? 'text-verdigris-dark' : 'text-[#777]',
                        isFailed && 'text-terracotta-dark'
                      )}
                    >
                      {stageLabels[stage]}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
              <h2 className="font-display text-sm uppercase tracking-label text-ink">Metadata</h2>
              <div className="mt-3">
                <MetadataRow
                  label="Authors"
                  value={source.authors.length > 0 ? source.authors.join(', ') : 'Unknown author'}
                />
                <MetadataRow
                  label="Description"
                  value={source.description ?? 'No description provided'}
                />
                <MetadataRow
                  label="Publication Date"
                  value={source.publication_date ?? 'Not provided'}
                />
                <MetadataRow label="Format" value={formatLabels[source.format]} />
                <MetadataRow
                  label="Category"
                  value={
                    <div className="space-y-2">
                      <select
                        aria-label="Source category"
                        className="h-9 w-full max-w-[260px] rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris disabled:opacity-60"
                        disabled={categoryMutation.isPending}
                        value={source.category ?? ''}
                        onChange={(event) => {
                          const nextCategory = event.target.value as SourceCategory

                          if (nextCategory && nextCategory !== source.category) {
                            categoryMutation.mutate(nextCategory)
                          }
                        }}
                      >
                        <option value="">No category</option>
                        {sourceCategories.map((category) => (
                          <option key={category} value={category}>
                            {sourceCategoryLabels[category]}
                          </option>
                        ))}
                      </select>
                      <p className="font-body text-xs text-[#777]">
                        Legacy tier is derived for confidence scoring.
                      </p>
                    </div>
                  }
                />
                <MetadataRow
                  label="Tier"
                  value={
                    <div className="space-y-2">
                      <select
                        aria-label="Source tier"
                        className="h-9 w-full max-w-[220px] rounded border border-0.5 border-black/15 bg-stone px-3 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris disabled:opacity-60"
                        disabled={tierMutation.isPending}
                        value={source.tier}
                        onChange={(event) => {
                          const nextTier = event.target.value as SourceTier

                          if (nextTier !== source.tier) {
                            tierMutation.mutate(nextTier)
                          }
                        }}
                      >
                        <option value="primary">Primary</option>
                        <option value="secondary">Secondary</option>
                      </select>
                      {tierMutation.isPending ? (
                        <p className="font-body text-xs text-[#777]">Saving tier...</p>
                      ) : null}
                      {tierMessage ? (
                        <p
                          className={cn(
                            'font-body text-xs',
                            tierMutation.isError || recomputeMutation.isError
                              ? 'text-terracotta-dark'
                              : 'text-verdigris-dark'
                          )}
                        >
                          {tierMessage}
                        </p>
                      ) : null}
                    </div>
                  }
                />
                <MetadataRow label="Status" value={source.status} />
                <MetadataRow
                  label="Crawl Date"
                  value={
                    source.crawl_date ? new Date(source.crawl_date).toLocaleString() : 'Not crawled'
                  }
                />
                <MetadataRow
                  label="Rights Metadata"
                  value={
                    <div className="space-y-3">
                      <Input
                        aria-label="License"
                        placeholder="License"
                        value={license}
                        onChange={(event) => setLicense(event.target.value)}
                      />
                      <Input
                        aria-label="Attribution"
                        placeholder="Attribution"
                        value={attribution}
                        onChange={(event) => setAttribution(event.target.value)}
                      />
                      <textarea
                        aria-label="Rights notes"
                        className="min-h-20 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                        placeholder="Rights notes"
                        value={rightsNotes}
                        onChange={(event) => setRightsNotes(event.target.value)}
                      />
                      <textarea
                        aria-label="Fair use rationale"
                        className="min-h-20 w-full rounded border border-0.5 border-black/15 bg-stone px-3 py-2 font-body text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verdigris"
                        placeholder="Fair use rationale"
                        value={fairUseRationale}
                        onChange={(event) => setFairUseRationale(event.target.value)}
                      />
                      <div className="flex items-center gap-3">
                        <Button
                          disabled={rightsMutation.isPending}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => rightsMutation.mutate()}
                        >
                          Save rights
                        </Button>
                        {rightsMessage ? (
                          <span
                            className={cn(
                              'font-body text-xs',
                              rightsMutation.isError
                                ? 'text-terracotta-dark'
                                : 'text-verdigris-dark'
                            )}
                          >
                            {rightsMessage}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  }
                />
                <MetadataRow
                  label="Location"
                  value={
                    source.url ? (
                      <a
                        className="inline-flex items-center gap-2 text-verdigris hover:text-verdigris-dark"
                        href={source.url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {source.url}
                        <ExternalLink aria-hidden="true" className="h-3 w-3" />
                      </a>
                    ) : (
                      (source.file_path ?? 'No file path recorded')
                    )
                  }
                />
              </div>
            </section>

            <aside className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
              <h2 className="font-display text-sm uppercase tracking-label text-ink">Actions</h2>
              <div className="mt-4 space-y-3">
                <Button asChild className="w-full">
                  <Link to={`/admin/sources/${source.id}/impact`}>View impact</Link>
                </Button>
                <Button
                  className="w-full"
                  disabled={rerunMutation.isPending || Boolean(rerunAction?.disabledReason)}
                  title={rerunAction?.disabledReason ?? undefined}
                  type="button"
                  variant="outline"
                  onClick={() => rerunMutation.mutate()}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={cn('h-4 w-4', rerunMutation.isPending && 'animate-spin')}
                  />
                  {rerunAction?.label ?? 'Re-run'}
                </Button>
                {source.format === 'url' &&
                (source.pipeline_stage === 'uploaded' ||
                  source.pipeline_stage === 'chunking_failed') ? (
                  <Button
                    className="w-full"
                    disabled={urlFetchMutation.isPending}
                    type="button"
                    variant="outline"
                    onClick={() => urlFetchMutation.mutate()}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={cn('h-4 w-4', urlFetchMutation.isPending && 'animate-spin')}
                    />
                    Fetch URL
                  </Button>
                ) : null}
                {source.status === 'archived' ? (
                  <Button
                    className="w-full"
                    disabled={restoreMutation.isPending}
                    type="button"
                    variant="outline"
                    onClick={() => restoreMutation.mutate(source.id)}
                  >
                    <RotateCcw aria-hidden="true" className="h-4 w-4" />
                    Restore source
                  </Button>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      disabled={statusMutation.isPending}
                      type="button"
                      variant={source.status === 'published' ? 'outline' : 'default'}
                      onClick={() =>
                        statusMutation.mutate(source.status === 'published' ? 'draft' : 'published')
                      }
                    >
                      {source.status === 'published' ? 'Set source draft' : 'Publish source'}
                    </Button>
                    <Button
                      className="w-full"
                      disabled={archiveMutation.isPending}
                      type="button"
                      variant="outline"
                      onClick={() => setArchiveDialogOpen(true)}
                    >
                      <Archive aria-hidden="true" className="h-4 w-4" />
                      Archive source
                    </Button>
                  </>
                )}
                {source.pipeline_stage === 'review' ? (
                  <Button asChild className="w-full">
                    <Link to={`${ROUTES.ADMIN_REVIEW}?source=${source.id}`}>
                      Review extractions
                    </Link>
                  </Button>
                ) : null}
              </div>
            </aside>
          </div>

          <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Archive Source</DialogTitle>
                <DialogDescription>
                  Archive {source.title}? It will leave the dashboard pipeline monitor and can be
                  restored later.
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
                  onClick={() =>
                    archiveMutation.mutate(source.id, {
                      onSuccess: () => setArchiveDialogOpen(false),
                    })
                  }
                >
                  <Archive aria-hidden="true" className="h-4 w-4" />
                  Archive
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={recomputeDialogOpen} onOpenChange={setRecomputeDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Recompute Confidence</DialogTitle>
                <DialogDescription>
                  Would you like to recompute confidence scores for entities affected by this
                  source? ({impactedEntityIds.length} entities)
                </DialogDescription>
              </DialogHeader>
              <div className="mt-5 flex justify-end gap-3">
                <DialogClose asChild>
                  <Button
                    disabled={recomputeMutation.isPending}
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setTierMessage('Source tier updated. Confidence recompute skipped.')
                    }
                  >
                    No
                  </Button>
                </DialogClose>
                <Button
                  disabled={recomputeMutation.isPending || impactedEntityIds.length === 0}
                  type="button"
                  onClick={() => recomputeMutation.mutate(impactedEntityIds)}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className={cn('h-4 w-4', recomputeMutation.isPending && 'animate-spin')}
                  />
                  Yes
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  )
}

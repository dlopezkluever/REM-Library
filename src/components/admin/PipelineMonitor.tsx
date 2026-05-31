import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, ExternalLink, FileAudio, FileText, LinkIcon, Video } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  applySourceRealtimeChange,
  getAdminSources,
  subscribeToSourceUpdates,
  type AdminSourceRow,
} from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const adminSourcesQueryKey = ['admin', 'sources'] as const

const formatLabels: Record<AdminSourceRow['format'], string> = {
  audio: 'Audio',
  video: 'Video',
  text: 'Text',
  book: 'Book',
  url: 'URL',
}

const stageLabels: Record<AdminSourceRow['pipeline_stage'], string> = {
  uploaded: 'Uploaded',
  transcribing: 'Transcribing',
  transcribing_failed: 'Transcription Failed',
  chunking: 'Chunking',
  chunking_failed: 'Chunking Failed',
  extracting: 'Extracting',
  extracting_failed: 'Extraction Failed',
  review: 'Review',
  curated: 'Curated',
  published: 'Published',
}

const formatIconClass = 'h-4 w-4 text-[#777]'

const FormatIcon = ({ format }: { format: AdminSourceRow['format'] }) => {
  if (format === 'audio') {
    return <FileAudio aria-hidden="true" className={formatIconClass} />
  }

  if (format === 'video') {
    return <Video aria-hidden="true" className={formatIconClass} />
  }

  if (format === 'book') {
    return <BookOpen aria-hidden="true" className={formatIconClass} />
  }

  if (format === 'url') {
    return <LinkIcon aria-hidden="true" className={formatIconClass} />
  }

  return <FileText aria-hidden="true" className={formatIconClass} />
}

const getStageClassName = (stage: AdminSourceRow['pipeline_stage']) => {
  if (stage.endsWith('_failed')) {
    return 'border-terracotta/50 bg-terracotta-light text-terracotta-dark'
  }

  if (stage === 'review') {
    return 'border-terracotta/50 bg-terracotta-light text-terracotta-dark'
  }

  if (stage === 'published' || stage === 'curated') {
    return 'border-verdigris/60 bg-verdigris-light text-verdigris-dark'
  }

  if (stage === 'extracting' || stage === 'transcribing' || stage === 'chunking') {
    return 'border-[#C9A84C]/60 bg-[#FBF6DF] text-[#6F5A12]'
  }

  return 'border-black/15 bg-white text-[#777]'
}

const formatRelativeDuration = (fromIso: string, now: number) => {
  const elapsedMs = Math.max(now - new Date(fromIso).getTime(), 0)
  const minutes = Math.floor(elapsedMs / 60000)

  if (minutes < 1) {
    return 'Just now'
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)

  if (hours < 24) {
    return `${hours}h ${minutes % 60}m`
  }

  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

export const PipelineMonitor = () => {
  const queryClient = useQueryClient()
  const [now, setNow] = useState(() => Date.now())
  const {
    data: sources = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: adminSourcesQueryKey,
    queryFn: getAdminSources,
  })

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    return subscribeToSourceUpdates((change) => {
      queryClient.setQueryData<AdminSourceRow[]>(adminSourcesQueryKey, (currentSources) => {
        return applySourceRealtimeChange(currentSources, change)
      })
    })
  }, [queryClient])

  if (isLoading) {
    return (
      <div className="rounded border border-0.5 border-black/[0.09] bg-white p-5">
        <p className="font-display text-[9px] uppercase tracking-label text-[#777]">
          Loading pipeline
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-5">
        <p className="font-body text-sm text-terracotta-dark">Pipeline sources could not load.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded border border-0.5 border-black/[0.09] bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Source</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Tier</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sources.length === 0 ? (
            <TableRow>
              <TableCell className="font-body text-sm text-[#777]" colSpan={6}>
                No sources have entered the ingestion pipeline yet.
              </TableCell>
            </TableRow>
          ) : (
            sources.map((source) => {
              const isReviewStage = source.pipeline_stage === 'review'
              const isFailedStage = source.pipeline_stage.endsWith('_failed')
              const actionRoute = isReviewStage
                ? `/admin/review?source=${source.id}`
                : `/admin/sources?source=${source.id}`

              return (
                <TableRow key={source.id}>
                  <TableCell>
                    <div className="max-w-[340px]">
                      <p className="truncate font-body text-sm text-ink">{source.title}</p>
                      <p className="font-body text-[11px] text-[#888]">
                        {new Date(source.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-body text-xs text-[#777]">
                      <FormatIcon format={source.format} />
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
                  <TableCell className="font-body text-xs text-[#777]">
                    {formatRelativeDuration(source.pipeline_stage_entered_at, now)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant={isReviewStage ? 'default' : 'outline'}>
                      <Link to={actionRoute}>
                        {isFailedStage ? 'Re-run' : isReviewStage ? 'Review' : 'View'}
                        <ExternalLink aria-hidden="true" className="h-3 w-3" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

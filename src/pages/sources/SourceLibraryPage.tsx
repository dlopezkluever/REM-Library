import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AudioLines, BookOpen, FileText, Link as LinkIcon, Video } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getAllSources, getClaimCountsForSources } from '@/lib/api/sources'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PipelineStage, SourceFormat, SourceTier } from '@/types/domain'

const formats: SourceFormat[] = ['audio', 'video', 'text', 'book', 'url']
const tiers: SourceTier[] = ['primary', 'secondary']
const stages: Array<PipelineStage | 'all'> = [
  'all',
  'uploaded',
  'transcribing',
  'chunking',
  'extracting',
  'review',
  'curated',
  'published',
]

const formatIcons: Record<SourceFormat, typeof AudioLines> = {
  audio: AudioLines,
  book: BookOpen,
  text: FileText,
  url: LinkIcon,
  video: Video,
}

type SortMode = 'date' | 'title' | 'claim-count'

const skeletonRows = Array.from({ length: 6 }, (_, index) => index)

export default function SourceLibraryPage() {
  const [activeFormats, setActiveFormats] = useState<Set<SourceFormat>>(new Set())
  const [activeTiers, setActiveTiers] = useState<Set<SourceTier>>(new Set())
  const [activeStage, setActiveStage] = useState<PipelineStage | 'all'>('all')
  const [sortMode, setSortMode] = useState<SortMode>('date')

  const sourcesQuery = useQuery({
    queryKey: ['sources', 'published'],
    queryFn: getAllSources,
    staleTime: 60_000,
  })

  const claimCountsQuery = useQuery({
    queryKey: ['sources', 'claim-counts', sourcesQuery.data?.map((source) => source.id).join(',')],
    queryFn: () => getClaimCountsForSources((sourcesQuery.data ?? []).map((source) => source.id)),
    enabled: Boolean(sourcesQuery.data),
    staleTime: 60_000,
  })

  const claimCountsBySourceId = useMemo(
    () =>
      new Map((claimCountsQuery.data ?? []).map((item) => [item.sourceId, item.claimCount])),
    [claimCountsQuery.data]
  )

  const filteredSources = useMemo(() => {
    const nextSources = (sourcesQuery.data ?? []).filter((source) => {
      const formatMatch = activeFormats.size === 0 || activeFormats.has(source.format)
      const tierMatch = activeTiers.size === 0 || activeTiers.has(source.tier)
      const stageMatch = activeStage === 'all' || source.pipeline_stage === activeStage

      return formatMatch && tierMatch && stageMatch
    })

    return [...nextSources].sort((first, second) => {
      if (sortMode === 'title') {
        return first.title.localeCompare(second.title)
      }

      if (sortMode === 'claim-count') {
        return (
          (claimCountsBySourceId.get(second.id) ?? 0) - (claimCountsBySourceId.get(first.id) ?? 0)
        )
      }

      return (
        new Date(second.publication_date ?? second.created_at).getTime() -
        new Date(first.publication_date ?? first.created_at).getTime()
      )
    })
  }, [activeFormats, activeStage, activeTiers, claimCountsBySourceId, sortMode, sourcesQuery.data])

  const toggleFormat = (format: SourceFormat) => {
    setActiveFormats((current) => {
      const next = new Set(current)
      if (next.has(format)) {
        next.delete(format)
      } else {
        next.add(format)
      }
      return next
    })
  }

  const toggleTier = (tier: SourceTier) => {
    setActiveTiers((current) => {
      const next = new Set(current)
      if (next.has(tier)) {
        next.delete(tier)
      } else {
        next.add(tier)
      }
      return next
    })
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <div className="mb-7">
        <p className="mb-2 font-display text-[8px] uppercase tracking-label text-[#777]">
          Sources
        </p>
        <h1 className="font-display text-[28px] leading-tight text-ink">Source Library</h1>
      </div>

      <div className="mb-5 grid gap-4 rounded-lg border-0.5 border-black/10 bg-white p-4 lg:grid-cols-[1fr_auto_auto]">
        <div>
          <p className="mb-2 font-display text-[8px] uppercase tracking-label text-[#777]">
            Format
          </p>
          <div className="flex flex-wrap gap-2">
            {formats.map((format) => (
              <button
                key={format}
                type="button"
                className={cn(
                  'rounded border-0.5 px-3 py-1.5 font-body text-[11px] capitalize',
                  activeFormats.has(format)
                    ? 'border-verdigris bg-verdigris-light text-verdigris-dark'
                    : 'border-black/10 text-[#666] hover:border-verdigris/50'
                )}
                onClick={() => toggleFormat(format)}
              >
                {format}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-display text-[8px] uppercase tracking-label text-[#777]">Tier</p>
          <div className="flex gap-2">
            {tiers.map((tier) => (
              <button
                key={tier}
                type="button"
                className={cn(
                  'rounded border-0.5 px-3 py-1.5 font-body text-[11px] capitalize',
                  activeTiers.has(tier)
                    ? 'border-verdigris bg-verdigris-light text-verdigris-dark'
                    : 'border-black/10 text-[#666] hover:border-verdigris/50'
                )}
                onClick={() => toggleTier(tier)}
              >
                Tier {tier === 'primary' ? '1' : '2'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 font-display text-[8px] uppercase tracking-label text-[#777]">
            Pipeline
          </p>
          <select
            className="h-8 rounded border-0.5 border-black/10 bg-white px-2 font-body text-[11px] capitalize text-ink"
            value={activeStage}
            onChange={(event) => setActiveStage(event.target.value as PipelineStage | 'all')}
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stage}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-display text-[8px] uppercase tracking-label text-[#777]">Sort</span>
        {(['date', 'title', 'claim-count'] as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={cn(
              'rounded border-0.5 px-2.5 py-1 font-body text-[11px] capitalize',
              sortMode === mode
                ? 'border-verdigris bg-verdigris-light text-verdigris-dark'
                : 'border-black/10 bg-white text-[#666]'
            )}
            onClick={() => setSortMode(mode)}
          >
            {mode.replace('-', ' ')}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border-0.5 border-black/10 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="border-b-0.5 border-black/10 last:border-b-0.5">
              {['Title', 'Authors', 'Date', 'Format', 'Tier', 'Stage', 'Claims'].map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sourcesQuery.isLoading
              ? skeletonRows.map((row) => (
                  <TableRow key={row}>
                    {Array.from({ length: 7 }, (_, index) => (
                      <TableCell key={index}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
            {!sourcesQuery.isLoading && filteredSources.length > 0
              ? filteredSources.map((source) => {
                  const FormatIcon = formatIcons[source.format]

                  return (
                    <TableRow key={source.id}>
                      <TableCell>
                        <Link
                          className="font-body text-[12px] font-semibold text-ink hover:text-verdigris"
                          to={`/source/${source.id}`}
                        >
                          {source.title}
                        </Link>
                      </TableCell>
                      <TableCell className="font-body text-[11px] text-[#666]">
                        {source.authors.join(', ') || 'Unknown'}
                      </TableCell>
                      <TableCell className="font-body text-[11px] text-[#666]">
                        {formatDate(source.publication_date)}
                      </TableCell>
                      <TableCell>
                        <FormatIcon className="h-4 w-4 text-[#666]" />
                      </TableCell>
                      <TableCell>
                        <span className="rounded border-0.5 border-verdigris/40 bg-verdigris-light px-2 py-0.5 font-display text-[8px] uppercase tracking-badge text-verdigris-dark">
                          Tier {source.tier === 'primary' ? '1' : '2'}
                        </span>
                      </TableCell>
                      <TableCell className="font-body text-[11px] capitalize text-[#666]">
                        {source.pipeline_stage}
                      </TableCell>
                      <TableCell className="font-body text-[11px] text-[#666]">
                        {claimCountsBySourceId.get(source.id) ?? 0}
                      </TableCell>
                    </TableRow>
                  )
                })
              : null}
          </TableBody>
        </Table>
      </div>

      {!sourcesQuery.isLoading && !sourcesQuery.isError && sourcesQuery.data?.length === 0 ? (
        <p className="mt-5 rounded-lg border-0.5 border-black/10 bg-white p-6 text-center font-display text-[11px] uppercase tracking-label text-ink">
          No sources have been added yet.
        </p>
      ) : null}

      {!sourcesQuery.isLoading &&
      !sourcesQuery.isError &&
      (sourcesQuery.data?.length ?? 0) > 0 &&
      filteredSources.length === 0 ? (
        <p className="mt-5 rounded-lg border-0.5 border-black/10 bg-white p-6 text-center font-body text-[12px] text-[#666]">
          No sources match these filters.
        </p>
      ) : null}

      {sourcesQuery.isError ? (
        <p className="mt-5 rounded-lg border-0.5 border-terracotta/40 bg-white p-6 font-body text-[12px] text-terracotta">
          Could not load sources.
        </p>
      ) : null}
    </div>
  )
}

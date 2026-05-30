import { useEffect, useRef, type RefObject } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { EntityChip } from '@/components/entity/EntityChip'
import { TranscriptViewer } from '@/components/source/TranscriptViewer'
import { Skeleton } from '@/components/ui/skeleton'
import {
  getChunksForSource,
  getSignedSourceFileUrl,
  getSourceById,
  getSourceExtractedContent,
} from '@/lib/api/sources'
import { formatDate } from '@/lib/format'

export default function SourceDetailPage() {
  const { id } = useParams()
  const mediaRef = useRef<HTMLMediaElement | null>(null)

  const sourceQuery = useQuery({
    queryKey: ['source', id],
    queryFn: () => getSourceById(id ?? ''),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  const chunksQuery = useQuery({
    queryKey: ['source', id, 'chunks'],
    queryFn: () => getChunksForSource(id ?? ''),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  const extractedContentQuery = useQuery({
    queryKey: ['source', id, 'extracted-content'],
    queryFn: () => getSourceExtractedContent(id ?? ''),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  const signedUrlQuery = useQuery({
    queryKey: ['source', id, 'signed-file-url', sourceQuery.data?.file_path],
    queryFn: () => getSignedSourceFileUrl(sourceQuery.data?.file_path ?? ''),
    enabled:
      Boolean(sourceQuery.data?.file_path) &&
      (sourceQuery.data?.format === 'audio' || sourceQuery.data?.format === 'video'),
    staleTime: 50 * 60_000,
  })

  const seekTo = (seconds: number) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = seconds
    }
  }

  useEffect(() => {
    if (!chunksQuery.data) {
      return
    }

    const match = window.location.hash.match(/^#t-(\d+)$/)

    if (!match) {
      return
    }

    const seconds = Number(match[1])
    const target = document.getElementById(`t-${seconds}`)
    target?.scrollIntoView({ block: 'center' })
    seekTo(seconds)
  }, [chunksQuery.data])

  if (sourceQuery.isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-8">
        <Skeleton className="mb-4 h-8 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (sourceQuery.isError || !sourceQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-[24px] text-ink">Source Not Found</h1>
        <p className="mt-3 font-body text-[13px] text-[#666]">
          This source does not exist or has not been published yet.
        </p>
        <Link className="mt-5 inline-block font-body text-[12px] text-verdigris" to="/sources">
          Back to sources
        </Link>
      </div>
    )
  }

  const source = sourceQuery.data
  const extractedContent = extractedContentQuery.data ?? { claims: [], entities: [] }
  const hostedMediaUrl = signedUrlQuery.data

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,760px)_280px]">
      <article>
        <nav className="mb-6 font-body text-[11px] text-[#777]">
          <Link className="hover:text-ink" to="/sources">
            Sources
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink">{source.title}</span>
        </nav>

        <header className="border-b-0.5 border-black/10 pb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded border-0.5 border-verdigris/40 bg-verdigris-light px-2 py-0.5 font-display text-[8px] uppercase tracking-badge text-verdigris-dark">
              Tier {source.tier === 'primary' ? '1' : '2'}
            </span>
            <span className="rounded border-0.5 border-black/15 bg-white px-2 py-0.5 font-display text-[8px] uppercase tracking-badge text-[#666]">
              {source.format}
            </span>
            <span className="rounded border-0.5 border-black/15 bg-white px-2 py-0.5 font-display text-[8px] uppercase tracking-badge text-[#666]">
              {source.pipeline_stage}
            </span>
          </div>
          <h1 className="font-display text-[28px] leading-tight text-ink">{source.title}</h1>
          <p className="mt-3 font-body text-[12px] italic text-[#666]">
            {source.authors.join(', ') || 'Unknown author'} &middot;{' '}
            {formatDate(source.publication_date)}
          </p>
          {source.description ? (
            <p className="mt-4 max-w-2xl font-body text-[13px] leading-reading text-[#666]">
              {source.description}
            </p>
          ) : null}
        </header>

        {source.format === 'audio' || source.format === 'video' ? (
          <section className="py-6">
            {hostedMediaUrl ? (
              source.format === 'video' ? (
                <video
                  ref={mediaRef as RefObject<HTMLVideoElement>}
                  className="w-full"
                  controls
                  src={hostedMediaUrl}
                >
                  <track kind="captions" />
                </video>
              ) : (
                <audio
                  ref={mediaRef as RefObject<HTMLAudioElement>}
                  className="w-full"
                  controls
                  src={hostedMediaUrl}
                >
                  <track kind="captions" />
                </audio>
              )
            ) : source.url ? (
              <a
                className="inline-flex items-center gap-2 rounded border-0.5 border-black/10 bg-white px-3 py-2 font-body text-[12px] text-verdigris"
                href={source.url}
                rel="noreferrer"
                target="_blank"
              >
                Open external source
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <p className="rounded-lg border-0.5 border-black/10 bg-white p-4 font-body text-[12px] text-[#666]">
                Audio file is not hosted on Mythograph.
              </p>
            )}
          </section>
        ) : null}

        <section className="py-6">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Transcript
          </h2>
          {chunksQuery.isLoading ? <Skeleton className="h-64 w-full" /> : null}
          {!chunksQuery.isLoading ? (
            <TranscriptViewer
              chunks={chunksQuery.data ?? []}
              entities={extractedContent.entities}
              onSeek={seekTo}
            />
          ) : null}
        </section>
      </article>

      <aside>
        <div className="sticky top-16">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Extracted Content
          </h2>
          <div className="rounded-lg border-0.5 border-black/10 bg-white p-4">
            <p className="mb-3 font-display text-[8px] uppercase tracking-label text-[#777]">
              Entities
            </p>
            {extractedContent.entities.length > 0 ? (
              <div className="mb-5 flex flex-wrap gap-2">
                {extractedContent.entities.map((entity) => (
                  <EntityChip
                    key={entity.id}
                    name={entity.name}
                    slug={entity.slug}
                    type={entity.type}
                  />
                ))}
              </div>
            ) : (
              <p className="mb-5 font-body text-[12px] text-[#666]">
                No entities have been extracted from this source yet.
              </p>
            )}

            <p className="mb-3 font-display text-[8px] uppercase tracking-label text-[#777]">
              Claims
            </p>
            {extractedContent.claims.length > 0 ? (
              <div className="grid gap-2">
                {extractedContent.claims.map((claim) => (
                  <Link
                    key={claim.id}
                    className="rounded border-0.5 border-black/10 bg-stone/60 p-2 font-body text-[11px] leading-meta text-ink hover:border-verdigris/50"
                    to={`/claim/${claim.id}`}
                  >
                    {claim.statement}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="font-body text-[12px] text-[#666]">
                No claims have been extracted from this source yet.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { ConfidenceBreakdown } from '@/components/claim/ConfidenceBreakdown'
import { MarkdownProse } from '@/components/content/MarkdownProse'
import { ConfidenceBadge } from '@/components/entity/ConfidenceBadge'
import { EntityChip } from '@/components/entity/EntityChip'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ExportDialog } from '@/components/export/ExportDialog'
import { CopyLinkButton } from '@/components/common/CopyLinkButton'
import { InlineMediaPlayer } from '@/components/source/InlineMediaPlayer'
import { SuggestionDialog } from '@/components/suggestions/SuggestionDialog'
import { buildClaimExport } from '@/lib/export'
import { getClaimById, getEntitiesForClaim } from '@/lib/api/claims'
import { getSourceEvidenceForClaim } from '@/lib/api/sources'
import { formatAnchorCitation, formatTimestamp } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ContentStatus } from '@/types/domain'

const statusClassName: Record<ContentStatus, string> = {
  archived: 'border-black/15 bg-white text-[#777]',
  disputed: 'border-terracotta/50 bg-terracotta-light text-terracotta-dark',
  draft: 'border-iris/40 bg-iris-light text-iris-dark',
  published: 'border-verdigris/50 bg-verdigris-light text-verdigris-dark',
}

const StatusBadge = ({ status }: { status: ContentStatus }) => (
  <span
    className={cn(
      'inline-flex items-center rounded border px-2 py-0.5 font-display text-[9px] uppercase tracking-badge',
      statusClassName[status]
    )}
  >
    {status}
  </span>
)

export default function ClaimDetailPage() {
  const { id } = useParams()
  const [openMediaAnchorId, setOpenMediaAnchorId] = useState<string | null>(null)
  const [suggestionOpen, setSuggestionOpen] = useState(false)

  const claimQuery = useQuery({
    queryKey: ['claim', id],
    queryFn: () => getClaimById(id ?? ''),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  const entitiesQuery = useQuery({
    queryKey: ['claim', id, 'entities'],
    queryFn: () => getEntitiesForClaim(id ?? ''),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  const evidenceQuery = useQuery({
    queryKey: ['claim', id, 'evidence'],
    queryFn: () => getSourceEvidenceForClaim(id ?? ''),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  if (claimQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8">
        <Skeleton className="mb-4 h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (claimQuery.isError || !claimQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-[24px] text-ink">Claim Not Found</h1>
        <p className="mt-3 font-body text-[13px] text-[#666]">
          This claim does not exist or has not been published yet.
        </p>
        <Link className="mt-5 inline-block font-body text-[12px] text-verdigris" to="/encyclopedia">
          Back to encyclopedia
        </Link>
      </div>
    )
  }

  const claim = claimQuery.data
  const confidence = claim.confidence_override ?? claim.confidence_score
  const evidence = evidenceQuery.data ?? []

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,720px)_280px]">
      <article>
        <nav className="mb-6 font-body text-[11px] text-[#777]">
          <Link className="hover:text-ink" to="/encyclopedia">
            Encyclopedia
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink">Claim</span>
        </nav>

        <header className="border-b-0.5 border-black/10 pb-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={claim.status} />
            <ConfidenceBadge score={confidence} />
          </div>
          <h1 className="font-body text-[18px] leading-reading text-ink">{claim.statement}</h1>
          <p className="mt-4 font-body text-[12px] italic text-[#666]">
            {claim.profiles?.display_name ?? 'Unknown researcher'} &middot;{' '}
            {new Date(claim.created_at).toLocaleDateString()}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <ExportDialog
              title="Export claim"
              buildExport={(options) =>
                buildClaimExport(
                  {
                    canonicalUrl: window.location.href,
                    claim,
                    entities: (entitiesQuery.data ?? []).map((entity) => ({
                      name: entity.name,
                      type: entity.type,
                    })),
                    evidence,
                  },
                  options
                )
              }
            />
            <CopyLinkButton />
            <Button size="sm" type="button" variant="outline" onClick={() => setSuggestionOpen(true)}>
              Suggest a correction
            </Button>
          </div>
        </header>

        <section className="py-7">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Argument
          </h2>
          <MarkdownProse value={claim.detailed_argument ?? 'No detailed argument is published.'} />
        </section>

        <section className="border-t-0.5 border-black/10 py-6">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Entities Involved
          </h2>
          {(entitiesQuery.data ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(entitiesQuery.data ?? []).map((entity) => (
                <EntityChip
                  key={entity.id}
                  name={entity.name}
                  slug={entity.slug}
                  type={entity.type}
                />
              ))}
            </div>
          ) : (
            <p className="font-body text-[12px] text-[#666]">
              No entities are linked to this claim yet.
            </p>
          )}
        </section>

        <section className="border-t-0.5 border-black/10 py-6">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Source Evidence
          </h2>
          {evidenceQuery.isLoading ? <Skeleton className="h-28 w-full" /> : null}
          {evidence.length > 0 ? (
            <div className="grid gap-3">
              {evidence.map((item) => {
                const citation = formatAnchorCitation({
                  endPage: item.anchor.end_page,
                  endTimestamp: item.anchor.end_timestamp_sec,
                  startPage: item.anchor.start_page,
                  startTimestamp: item.anchor.start_timestamp_sec,
                })
                const timestamp = formatTimestamp(item.anchor.start_timestamp_sec)
                const sourceUrl = `/source/${item.source.id}${
                  item.anchor.start_timestamp_sec !== null
                    ? `#t-${item.anchor.start_timestamp_sec}`
                    : ''
                }`

                return (
                  <div
                    key={item.anchor.id}
                    className="rounded-lg border-0.5 border-black/10 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Link
                        className="font-body text-[13px] font-semibold text-ink hover:text-verdigris"
                        to={sourceUrl}
                      >
                        {item.source.title}
                      </Link>
                      <span className="font-body text-[10px] text-[#777]">{citation}</span>
                    </div>
                    {item.anchor.transcript_excerpt ? (
                      <p className="mt-3 border-l-2 border-verdigris/40 pl-3 font-body text-[12px] italic leading-meta text-[#666]">
                        {item.anchor.transcript_excerpt}
                      </p>
                    ) : null}
                    {timestamp &&
                    item.anchor.start_timestamp_sec !== null &&
                    (item.source.format === 'audio' || item.source.format === 'video') ? (
                      <div className="mt-3">
                        <button
                          className="inline-flex items-center gap-1.5 font-body text-[11px] text-verdigris hover:text-verdigris-dark"
                          type="button"
                          onClick={() =>
                            setOpenMediaAnchorId((current) =>
                              current === item.anchor.id ? null : item.anchor.id
                            )
                          }
                        >
                          <Play className="h-3 w-3" />
                          {openMediaAnchorId === item.anchor.id ? 'Hide source clip' : `Play from ${timestamp}`}
                        </button>
                        {openMediaAnchorId === item.anchor.id ? (
                          <InlineMediaPlayer
                            endSec={item.anchor.end_timestamp_sec ?? undefined}
                            format={item.source.format}
                            label={`Source: ${item.source.title}, ${timestamp}`}
                            sourceId={item.source.id}
                            startSec={item.anchor.start_timestamp_sec}
                          />
                        ) : null}
                      </div>
                    ) : timestamp ? (
                      <Link
                        className="mt-3 inline-flex items-center gap-1.5 font-body text-[11px] text-verdigris hover:text-verdigris-dark"
                        to={sourceUrl}
                      >
                        <Play className="h-3 w-3" />
                        Open source at {timestamp}
                      </Link>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
          {!evidenceQuery.isLoading && evidence.length === 0 ? (
            <p className="font-body text-[12px] text-[#666]">
              No source anchors have been linked to this claim yet.
            </p>
          ) : null}
        </section>
      </article>

      <aside>
        <div className="sticky top-16">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Confidence
          </h2>
          <ConfidenceBreakdown evidence={evidence} score={confidence} />
        </div>
      </aside>
      <SuggestionDialog
        open={suggestionOpen}
        reasonLabel="Reason"
        suggestionLabel="Corrected claim"
        targetClaimId={claim.id}
        targetLabel={claim.statement}
        title="Suggest a correction"
        type="claim_correction"
        onOpenChange={setSuggestionOpen}
      />
    </div>
  )
}

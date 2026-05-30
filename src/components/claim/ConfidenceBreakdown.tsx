import type { SourceAnchorEvidence } from '@/lib/api/sources'

interface ConfidenceBreakdownProps {
  score: number
  evidence: SourceAnchorEvidence[]
}

const clamp = (value: number) => Math.min(Math.max(value, 0), 1)

export const ConfidenceBreakdown = ({ evidence, score }: ConfidenceBreakdownProps) => {
  const sourceCount = new Set(evidence.map((item) => item.source.id)).size
  const hasPrimary = evidence.some((item) => item.source.tier === 'primary')
  const hasSecondary = evidence.some((item) => item.source.tier === 'secondary')
  const hasExcerpt = evidence.some((item) => item.anchor.transcript_excerpt?.trim())

  const rows = [
    {
      label: 'Source tier weight',
      value: hasPrimary ? 'Primary source present' : hasSecondary ? 'Secondary support' : 'No tiered source',
      contribution: hasPrimary ? 0.3 : hasSecondary ? 0.18 : 0,
    },
    {
      label: 'Source count',
      value: `${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}`,
      contribution: clamp(sourceCount / 5) * 0.25,
    },
    {
      label: 'Explicitness',
      value: hasExcerpt ? 'Anchored excerpt' : 'No excerpt',
      contribution: hasExcerpt ? 0.2 : 0.08,
    },
    {
      label: 'Corroboration',
      value: hasPrimary && hasSecondary ? 'Cross-tier' : 'Single tier',
      contribution: hasPrimary && hasSecondary ? 0.15 : 0.05,
    },
  ]

  return (
    <div className="overflow-hidden rounded-lg border-0.5 border-black/10 bg-white">
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[1fr_auto_auto] gap-3 border-b-0.5 border-black/[0.06] px-4 py-3 last:border-b-0"
        >
          <span className="font-display text-[8px] uppercase tracking-label text-[#777]">
            {row.label}
          </span>
          <span className="font-body text-[11px] text-[#666]">{row.value}</span>
          <span className="font-body text-[11px] text-ink">
            {Math.round(row.contribution * 100)}%
          </span>
        </div>
      ))}
      <div className="border-t-0.5 border-black/10 bg-stone/60 px-4 py-3 font-body text-[11px] text-[#666]">
        Score: {Math.round(score * 100)}% &middot; factor weights are evidence-derived estimates
      </div>
    </div>
  )
}

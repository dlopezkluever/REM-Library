import { Link } from 'react-router-dom'
import { formatAnchorCitation } from '@/lib/format'
import type { SourceAnchorEvidence } from '@/lib/api/sources'

interface SourceAnchorRowProps {
  evidence: SourceAnchorEvidence
}

export const SourceAnchorRow = ({ evidence }: SourceAnchorRowProps) => {
  const citation = formatAnchorCitation({
    endPage: evidence.anchor.end_page,
    endTimestamp: evidence.anchor.end_timestamp_sec,
    startPage: evidence.anchor.start_page,
    startTimestamp: evidence.anchor.start_timestamp_sec,
  })
  const sourcePath = `/source/${evidence.source.id}${
    evidence.anchor.start_timestamp_sec !== null ? `#t-${evidence.anchor.start_timestamp_sec}` : ''
  }`

  return (
    <Link
      to={sourcePath}
      className="block rounded-md border-0.5 border-black/10 bg-white p-3 transition-colors hover:border-verdigris/50"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-body text-[12px] font-semibold text-ink">{evidence.source.title}</p>
        <span className="shrink-0 font-body text-[10px] text-[#777]">{citation}</span>
      </div>
      {evidence.anchor.transcript_excerpt ? (
        <p className="mt-2 font-body text-[11px] italic leading-meta text-[#666]">
          {evidence.anchor.transcript_excerpt}
        </p>
      ) : null}
    </Link>
  )
}

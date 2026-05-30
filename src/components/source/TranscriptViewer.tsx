import { useNavigate } from 'react-router-dom'
import { formatTimestamp } from '@/lib/format'
import type { EntityRow } from '@/lib/api/entities'
import type { SourceChunkRow } from '@/lib/api/sources'

interface TranscriptViewerProps {
  chunks: SourceChunkRow[]
  entities: EntityRow[]
  onSeek: (seconds: number) => void
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildEntityPattern = (entities: EntityRow[]) => {
  const names = entities
    .flatMap((entity) => [entity.name, ...entity.aliases].map((name) => ({ entity, name })))
    .filter((entry) => entry.name.trim().length > 1)
    .sort((first, second) => second.name.length - first.name.length)

  if (names.length === 0) {
    return null
  }

  return {
    entries: names,
    regex: new RegExp(`\\b(${names.map((entry) => escapeRegex(entry.name)).join('|')})\\b`, 'gi'),
  }
}

export const TranscriptViewer = ({ chunks, entities, onSeek }: TranscriptViewerProps) => {
  const navigate = useNavigate()
  const entityPattern = buildEntityPattern(entities)

  if (chunks.length === 0) {
    return (
      <div className="rounded-lg border-0.5 border-black/10 bg-white p-5 font-body text-[12px] text-[#666]">
        Transcript is being generated. Check back soon.
      </div>
    )
  }

  return (
    <div className="rounded-lg border-0.5 border-black/10 bg-white">
      {chunks.map((chunk) => {
        const timestamp = formatTimestamp(chunk.start_sec)
        const parts = entityPattern ? chunk.raw_text.split(entityPattern.regex) : [chunk.raw_text]

        return (
          <p
            id={chunk.start_sec !== null ? `t-${chunk.start_sec}` : undefined}
            key={chunk.id}
            className="border-b-0.5 border-black/[0.06] px-4 py-3 font-body text-[13px] leading-reading text-ink last:border-b-0"
          >
            {timestamp && chunk.start_sec !== null ? (
              <button
                type="button"
                className="mr-3 font-display text-[9px] uppercase tracking-badge text-verdigris hover:text-verdigris-dark"
                onClick={() => onSeek(chunk.start_sec ?? 0)}
              >
                [{timestamp}]
              </button>
            ) : null}
            {parts.map((part, index) => {
              const match = entityPattern?.entries.find(
                (entry) => entry.name.toLowerCase() === part.toLowerCase()
              )

              if (!match) {
                return <span key={`${chunk.id}-${index}`}>{part}</span>
              }

              return (
                <button
                  key={`${chunk.id}-${index}`}
                  type="button"
                  className="rounded-sm bg-verdigris-light px-1 text-verdigris-dark hover:bg-verdigris/20"
                  onClick={() => navigate(`/entity/${match.entity.slug}`)}
                >
                  {part}
                </button>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}

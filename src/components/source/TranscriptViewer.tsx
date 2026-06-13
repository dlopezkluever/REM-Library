import { useNavigate } from 'react-router-dom'
import { formatTimestamp } from '@/lib/format'
import type { EntityRow } from '@/lib/api/entities'
import type { SourceChunkRow } from '@/lib/api/sources'

interface SpeakerTurn {
  speaker: string | null
  text: string
}

interface TranscriptViewerProps {
  chunks: SourceChunkRow[]
  entities: EntityRow[]
  showFairUseWarning?: boolean
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

const getSpeakerTurns = (chunk: SourceChunkRow): SpeakerTurn[] => {
  if (!Array.isArray(chunk.speaker_turns)) {
    return [{ speaker: chunk.speaker, text: chunk.raw_text }]
  }

  const turns = chunk.speaker_turns
    .map((turn): SpeakerTurn | null => {
      if (typeof turn !== 'object' || turn === null || !('text' in turn)) {
        return null
      }

      const record = turn as Record<string, unknown>
      return {
        speaker: typeof record.speaker === 'string' ? record.speaker : null,
        text: typeof record.text === 'string' ? record.text : '',
      }
    })
    .filter((turn): turn is SpeakerTurn => Boolean(turn?.text.trim()))

  return turns.length > 0 ? turns : [{ speaker: chunk.speaker, text: chunk.raw_text }]
}

export const TranscriptViewer = ({
  chunks,
  entities,
  showFairUseWarning = false,
  onSeek,
}: TranscriptViewerProps) => {
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
    <div className="overflow-hidden rounded-lg border-0.5 border-black/10 bg-white">
      {showFairUseWarning ? (
        <div className="border-b-0.5 border-amber-300/60 bg-amber-50 px-4 py-3">
          <p className="font-body text-[12px] leading-meta text-amber-900">
            This source uses a non-open license and has no fair-use rationale documented.
          </p>
        </div>
      ) : null}
      {chunks.map((chunk) => {
        const timestamp = formatTimestamp(chunk.start_sec)
        const speakerTurns = getSpeakerTurns(chunk)

        return (
          <div
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
            {speakerTurns.map((turn, turnIndex) => {
              const parts = entityPattern ? turn.text.split(entityPattern.regex) : [turn.text]

              return (
                <p key={`${chunk.id}-${turnIndex}`} className={turnIndex > 0 ? 'mt-2' : undefined}>
                  {turn.speaker ? (
                    <span className="mr-2 font-display text-[9px] uppercase tracking-badge text-[#777]">
                      {turn.speaker}
                    </span>
                  ) : null}
                  {parts.map((part, index) => {
                    const match = entityPattern?.entries.find(
                      (entry) => entry.name.toLowerCase() === part.toLowerCase()
                    )

                    if (!match) {
                      return <span key={`${chunk.id}-${turnIndex}-${index}`}>{part}</span>
                    }

                    return (
                      <button
                        key={`${chunk.id}-${turnIndex}-${index}`}
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
      })}
    </div>
  )
}

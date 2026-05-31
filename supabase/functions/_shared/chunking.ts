import type { SupabaseClient } from '@supabase/supabase-js'

import { requireEnv, updateSourceStage, type SourceRow } from './pipeline.ts'

interface AssemblyAiTranscript {
  audio_duration?: unknown
  error?: unknown
  id?: unknown
  status?: unknown
  text?: unknown
  utterances?: unknown
}

interface TranscriptSegment {
  endSec: number | null
  speaker: string | null
  startSec: number | null
  text: string
}

interface SpeakerTurn {
  end_sec: number | null
  speaker: string | null
  start_sec: number | null
  text: string
}

interface ChunkInsert {
  chunk_index: number
  end_sec: number | null
  raw_text: string
  source_id: string
  speaker: string | null
  speaker_turns: SpeakerTurn[]
  start_sec: number | null
}

export class TranscriptPendingError extends Error {
  status: string

  constructor(status: string) {
    super(`AssemblyAI transcript is not complete yet: ${status}.`)
    this.status = status
  }
}

export class TranscriptionProviderError extends Error {}

const numberFromMilliseconds = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }

  return value / 1000
}

const wordCount = (text: string) => {
  const matches = text.trim().match(/\S+/g)
  return matches ? matches.length : 0
}

const cleanText = (value: unknown) => {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

const getTranscriptSegments = (transcript: AssemblyAiTranscript): TranscriptSegment[] => {
  if (Array.isArray(transcript.utterances)) {
    const segments = transcript.utterances
      .map((utterance): TranscriptSegment | null => {
        if (typeof utterance !== 'object' || utterance === null) {
          return null
        }

        const record = utterance as Record<string, unknown>
        const text = cleanText(record.text)

        if (!text) {
          return null
        }

        return {
          endSec: numberFromMilliseconds(record.end),
          speaker: typeof record.speaker === 'string' ? record.speaker : null,
          startSec: numberFromMilliseconds(record.start),
          text,
        }
      })
      .filter((segment): segment is TranscriptSegment => segment !== null)

    if (segments.length > 0) {
      return segments
    }
  }

  const fullText = cleanText(transcript.text)

  if (!fullText) {
    return []
  }

  return [
    {
      endSec: null,
      speaker: null,
      startSec: null,
      text: fullText,
    },
  ]
}

const getSegmentGapSeconds = (previous: TranscriptSegment, next: TranscriptSegment) => {
  if (previous.endSec === null || next.startSec === null) {
    return 0
  }

  return next.startSec - previous.endSec
}

const toSpeakerTurn = (segment: TranscriptSegment): SpeakerTurn => {
  return {
    end_sec: segment.endSec,
    speaker: segment.speaker,
    start_sec: segment.startSec,
    text: segment.text,
  }
}

const toChunkRow = (
  sourceId: string,
  chunkIndex: number,
  segments: TranscriptSegment[]
): ChunkInsert => {
  const speakers = [
    ...new Set(
      segments
        .map((segment) => segment.speaker)
        .filter((speaker): speaker is string => typeof speaker === 'string' && speaker.length > 0)
    ),
  ]
  const startSec = segments.find((segment) => segment.startSec !== null)?.startSec ?? null
  const endSec = [...segments].reverse().find((segment) => segment.endSec !== null)?.endSec ?? null

  return {
    chunk_index: chunkIndex,
    end_sec: endSec,
    raw_text: segments.map((segment) => segment.text).join('\n\n'),
    source_id: sourceId,
    speaker: speakers.length === 1 ? speakers[0] : null,
    speaker_turns: segments.map(toSpeakerTurn),
    start_sec: startSec,
  }
}

const buildChunks = (sourceId: string, segments: TranscriptSegment[]) => {
  const chunks: ChunkInsert[] = []
  let currentSegments: TranscriptSegment[] = []
  let currentWordCount = 0

  for (const segment of segments) {
    const previousSegment = currentSegments[currentSegments.length - 1]
    const segmentWordCount = wordCount(segment.text)
    const gapSeconds = previousSegment ? getSegmentGapSeconds(previousSegment, segment) : 0
    const shouldFlushAtPause = currentWordCount >= 800 && gapSeconds > 2
    const shouldFlushAtHardLimit = currentWordCount >= 1200

    if (currentSegments.length > 0 && (shouldFlushAtPause || shouldFlushAtHardLimit)) {
      chunks.push(toChunkRow(sourceId, chunks.length, currentSegments))
      currentSegments = []
      currentWordCount = 0
    }

    currentSegments.push(segment)
    currentWordCount += segmentWordCount
  }

  if (currentSegments.length > 0) {
    chunks.push(toChunkRow(sourceId, chunks.length, currentSegments))
  }

  return chunks
}

const fetchTranscript = async (transcriptId: string) => {
  const response = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
    headers: {
      Authorization: requireEnv('ASSEMBLYAI_API_KEY'),
    },
  })
  const transcript = (await response.json()) as AssemblyAiTranscript

  if (!response.ok) {
    const message =
      typeof transcript.error === 'string'
        ? transcript.error
        : `AssemblyAI returned ${response.status}.`
    throw new Error(message)
  }

  return transcript
}

const getExistingChunkCount = async (supabase: SupabaseClient, sourceId: string) => {
  const { count, error } = await supabase
    .from('chunks')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', sourceId)

  if (error) {
    throw error
  }

  return count ?? 0
}

export const chunkSourceTranscript = async (supabase: SupabaseClient, source: SourceRow) => {
  if (!source.transcript_id) {
    throw new Error('This source does not have a transcript id to chunk.')
  }

  await updateSourceStage(supabase, source.id, 'chunking')

  const existingChunkCount = await getExistingChunkCount(supabase, source.id)

  if (existingChunkCount > 0) {
    return {
      chunkCount: existingChunkCount,
      reusedChunks: true,
    }
  }

  const transcript = await fetchTranscript(source.transcript_id)

  if (transcript.status === 'error') {
    throw new TranscriptionProviderError(
      typeof transcript.error === 'string'
        ? transcript.error
        : 'AssemblyAI transcription failed.'
    )
  }

  if (transcript.status !== 'completed') {
    throw new TranscriptPendingError(
      typeof transcript.status === 'string' ? transcript.status : 'unknown'
    )
  }

  const segments = getTranscriptSegments(transcript)

  if (segments.length === 0) {
    throw new Error('AssemblyAI transcript did not contain text segments.')
  }

  const chunks = buildChunks(source.id, segments)

  const { error: insertError } = await supabase.from('chunks').upsert(chunks, {
    onConflict: 'source_id,chunk_index',
  })

  if (insertError) {
    throw insertError
  }

  const durationSeconds =
    typeof transcript.audio_duration === 'number' && Number.isFinite(transcript.audio_duration)
      ? Math.round(transcript.audio_duration)
      : null

  if (durationSeconds !== null) {
    const { error: durationError } = await supabase
      .from('sources')
      .update({ duration_seconds: durationSeconds })
      .eq('id', source.id)

    if (durationError) {
      throw durationError
    }
  }

  return {
    chunkCount: chunks.length,
    reusedChunks: false,
  }
}

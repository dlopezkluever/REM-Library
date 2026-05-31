import {
  corsHeaders,
  createServiceClient,
  errorMessage,
  invokeInternalFunction,
  jsonResponse,
  readJsonBody,
  requireEnv,
  updateSourceStage,
  type SourceRow,
} from '../_shared/pipeline.ts'

interface AssemblyAiWebhookBody {
  status?: unknown
  transcript_id?: unknown
}

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

interface ChunkInsert {
  chunk_index: number
  end_sec: number | null
  raw_text: string
  source_id: string
  speaker: string | null
  start_sec: number | null
}

const getWebhookHeaderName = () => {
  return Deno.env.get('ASSEMBLYAI_WEBHOOK_HEADER_NAME') ?? 'x-assemblyai-webhook-secret'
}

const verifyWebhookSecret = (request: Request) => {
  const webhookSecret = Deno.env.get('ASSEMBLYAI_WEBHOOK_SECRET')

  if (!webhookSecret) {
    return
  }

  if (request.headers.get(getWebhookHeaderName()) !== webhookSecret) {
    throw new Error('AssemblyAI webhook signature is invalid.')
  }
}

const getTranscriptId = (body: unknown) => {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Webhook body must be an object.')
  }

  const transcriptId = (body as AssemblyAiWebhookBody).transcript_id

  if (typeof transcriptId !== 'string' || !transcriptId.trim()) {
    throw new Error('transcript_id is required.')
  }

  return transcriptId
}

const getWebhookStatus = (body: unknown) => {
  if (typeof body !== 'object' || body === null) {
    return null
  }

  const status = (body as AssemblyAiWebhookBody).status
  return typeof status === 'string' ? status : null
}

const numberFromMilliseconds = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }

  return Math.round(value / 1000)
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createServiceClient()
  let sourceId: string | null = null
  let failureStage: 'chunking_failed' | 'extracting_failed' = 'chunking_failed'

  try {
    verifyWebhookSecret(request)

    const body = await readJsonBody(request)
    const transcriptId = getTranscriptId(body)
    const webhookStatus = getWebhookStatus(body)

    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('id,file_path,format,pipeline_stage,status,transcript_id,url')
      .eq('transcript_id', transcriptId)
      .single<SourceRow>()

    if (sourceError || !source) {
      throw new Error('Source for transcript was not found.')
    }

    sourceId = source.id

    if (webhookStatus === 'error') {
      await updateSourceStage(supabase, source.id, 'transcribing_failed')
      return jsonResponse({ source_id: source.id, status: 'transcribing_failed' })
    }

    if (webhookStatus && webhookStatus !== 'completed') {
      return jsonResponse({ source_id: source.id, status: webhookStatus })
    }

    const { count: chunkCount, error: countError } = await supabase
      .from('chunks')
      .select('id', { count: 'exact', head: true })
      .eq('source_id', source.id)

    if (countError) {
      throw countError
    }

    if ((chunkCount ?? 0) > 0) {
      failureStage = 'extracting_failed'
      await invokeInternalFunction('trigger-extraction', { source_id: source.id })
      return jsonResponse({ reused_chunks: true, source_id: source.id })
    }

    await updateSourceStage(supabase, source.id, 'chunking')

    const transcript = await fetchTranscript(transcriptId)

    if (transcript.status === 'error') {
      await updateSourceStage(supabase, source.id, 'transcribing_failed')
      return jsonResponse(
        {
          error:
            typeof transcript.error === 'string'
              ? transcript.error
              : 'AssemblyAI transcription failed.',
          source_id: source.id,
        },
        500
      )
    }

    if (transcript.status !== 'completed') {
      return jsonResponse({ source_id: source.id, status: transcript.status }, 202)
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

    failureStage = 'extracting_failed'
    await invokeInternalFunction('trigger-extraction', { source_id: source.id })

    return jsonResponse({
      chunk_count: chunks.length,
      pipeline_stage: 'extracting',
      source_id: source.id,
    })
  } catch (error) {
    if (sourceId) {
      await updateSourceStage(supabase, sourceId, failureStage).catch(() => undefined)
    }

    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

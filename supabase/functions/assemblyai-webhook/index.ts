import {
  TranscriptionProviderError,
  TranscriptPendingError,
  chunkSourceTranscript,
} from '../_shared/chunking.ts'
import {
  corsHeaders,
  createServiceClient,
  errorMessage,
  failSourceStage,
  invokeInternalFunction,
  jsonResponse,
  readJsonBody,
  runInBackground,
  updateSourceStage,
  type SourceRow,
} from '../_shared/pipeline.ts'

interface AssemblyAiWebhookBody {
  status?: unknown
  transcript_id?: unknown
}

class WebhookAuthError extends Error {}

const getWebhookHeaderName = () => {
  return Deno.env.get('ASSEMBLYAI_WEBHOOK_HEADER_NAME') ?? 'x-assemblyai-webhook-secret'
}

const verifyWebhookSecret = (request: Request) => {
  const webhookSecret = Deno.env.get('ASSEMBLYAI_WEBHOOK_SECRET')
  const allowUnsignedWebhooks = Deno.env.get('ALLOW_UNSIGNED_ASSEMBLYAI_WEBHOOKS') === 'true'

  if (!webhookSecret) {
    if (allowUnsignedWebhooks) {
      return
    }

    throw new Error('ASSEMBLYAI_WEBHOOK_SECRET is required.')
  }

  if (request.headers.get(getWebhookHeaderName()) !== webhookSecret) {
    throw new WebhookAuthError('AssemblyAI webhook signature is invalid.')
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

const queueExtraction = async (sourceId: string) => {
  const supabase = createServiceClient()
  await updateSourceStage(supabase, sourceId, 'extracting')
  runInBackground(
    invokeInternalFunction('trigger-extraction', { source_id: sourceId }).catch(async (error) => {
      await failSourceStage(supabase, sourceId, 'extracting_failed', error).catch(() => undefined)
      throw error
    })
  )
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createServiceClient()
  let sourceId: string | null = null

  try {
    verifyWebhookSecret(request)

    const body = await readJsonBody(request)
    const transcriptId = getTranscriptId(body)
    const webhookStatus = getWebhookStatus(body)

    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('id,file_path,format,pipeline_error,pipeline_stage,status,transcript_id,url')
      .eq('transcript_id', transcriptId)
      .maybeSingle<SourceRow>()

    if (sourceError) {
      throw sourceError
    }

    if (!source) {
      console.warn(`Ignoring AssemblyAI webhook for stale transcript ${transcriptId}.`)
      return jsonResponse({ ignored: true, transcript_id: transcriptId }, 202)
    }

    sourceId = source.id

    if (webhookStatus === 'error') {
      await failSourceStage(supabase, source.id, 'transcribing_failed', 'AssemblyAI transcription failed.')
      return jsonResponse({ source_id: source.id, status: 'transcribing_failed' })
    }

    if (webhookStatus && webhookStatus !== 'completed') {
      return jsonResponse({ source_id: source.id, status: webhookStatus }, 202)
    }

    const result = await chunkSourceTranscript(supabase, source)
    await queueExtraction(source.id)

    return jsonResponse({
      chunk_count: result.chunkCount,
      extraction_queued: true,
      pipeline_stage: 'extracting',
      reused_chunks: result.reusedChunks,
      source_id: source.id,
    })
  } catch (error) {
    if (error instanceof WebhookAuthError) {
      return jsonResponse({ error: errorMessage(error) }, 401)
    }

    if (sourceId && error instanceof TranscriptPendingError) {
      return jsonResponse({ source_id: sourceId, status: error.status }, 202)
    }

    if (sourceId) {
      const failureStage =
        error instanceof TranscriptionProviderError ? 'transcribing_failed' : 'chunking_failed'
      await failSourceStage(supabase, sourceId, failureStage, error).catch(() => undefined)
    }

    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

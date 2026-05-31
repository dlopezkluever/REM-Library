import {
  corsHeaders,
  createServiceClient,
  errorMessage,
  failSourceStage,
  getBooleanFlag,
  getSourceId,
  invokeInternalFunction,
  jsonResponse,
  readJsonBody,
  requireAdminOrServiceRole,
  requireEnv,
  runInBackground,
  updateSourceStage,
  type SourceRow,
} from '../_shared/pipeline.ts'

interface AssemblyAiSubmitResponse {
  error?: unknown
  id?: unknown
  status?: unknown
}

const sourceFilesBucket = 'source-files'
const defaultSignedUrlTtlSeconds = 60 * 60 * 24

const getSpeechModels = () => {
  const configuredModels = Deno.env.get('ASSEMBLYAI_SPEECH_MODELS')

  if (!configuredModels) {
    return ['universal-3-pro', 'universal-2']
  }

  return configuredModels
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)
}

const getSignedUrlTtlSeconds = () => {
  const configuredTtl = Number.parseInt(
    Deno.env.get('SOURCE_SIGNED_URL_TTL_SECONDS') ?? '',
    10
  )

  return Number.isFinite(configuredTtl) && configuredTtl > 0
    ? configuredTtl
    : defaultSignedUrlTtlSeconds
}

const getWebhookUrl = () => {
  const configuredUrl = Deno.env.get('ASSEMBLYAI_WEBHOOK_URL')

  if (configuredUrl) {
    return configuredUrl
  }

  return `${requireEnv('SUPABASE_URL')}/functions/v1/assemblyai-webhook`
}

const getWebhookSecret = () => {
  const webhookSecret = Deno.env.get('ASSEMBLYAI_WEBHOOK_SECRET')
  const allowUnsignedWebhooks = Deno.env.get('ALLOW_UNSIGNED_ASSEMBLYAI_WEBHOOKS') === 'true'

  if (!webhookSecret && !allowUnsignedWebhooks) {
    throw new Error('ASSEMBLYAI_WEBHOOK_SECRET is required.')
  }

  return webhookSecret
}

const isAssemblyAiSourceFormat = (format: string) => {
  return format === 'audio' || format === 'video'
}

const queueChunking = (sourceId: string) => {
  const supabase = createServiceClient()
  runInBackground(
    invokeInternalFunction('trigger-chunking', { source_id: sourceId }).catch(async (error) => {
      await failSourceStage(supabase, sourceId, 'chunking_failed', error).catch(() => undefined)
      throw error
    })
  )
}

const submitTranscript = async (audioUrl: string) => {
  const webhookHeaderName =
    Deno.env.get('ASSEMBLYAI_WEBHOOK_HEADER_NAME') ?? 'x-assemblyai-webhook-secret'
  const webhookSecret = getWebhookSecret()
  const payload: Record<string, unknown> = {
    audio_url: audioUrl,
    format_text: true,
    punctuate: true,
    speaker_labels: true,
    speech_models: getSpeechModels(),
    webhook_url: getWebhookUrl(),
  }

  if (webhookSecret) {
    payload.webhook_auth_header_name = webhookHeaderName
    payload.webhook_auth_header_value = webhookSecret
  }

  const response = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: {
      Authorization: requireEnv('ASSEMBLYAI_API_KEY'),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const responseBody = (await response.json()) as AssemblyAiSubmitResponse

  if (!response.ok) {
    const message =
      typeof responseBody.error === 'string'
        ? responseBody.error
        : `AssemblyAI returned ${response.status}.`
    throw new Error(message)
  }

  if (typeof responseBody.id !== 'string' || !responseBody.id) {
    throw new Error('AssemblyAI did not return a transcript id.')
  }

  return responseBody.id
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let sourceId: string | null = null
  let canUpdateSource = false
  const supabase = createServiceClient()

  try {
    const body = await readJsonBody(request)
    sourceId = getSourceId(body)
    const force = getBooleanFlag(body, 'force')

    await requireAdminOrServiceRole(request, supabase)

    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('id,file_path,format,pipeline_error,pipeline_stage,status,transcript_id,url')
      .eq('id', sourceId)
      .single<SourceRow>()

    if (sourceError || !source) {
      throw new Error('Source was not found.')
    }

    canUpdateSource = true

    const shouldReuseTranscript =
      source.transcript_id &&
      !force &&
      source.pipeline_stage !== 'transcribing_failed'

    if (shouldReuseTranscript) {
      queueChunking(source.id)
      return jsonResponse({
        chunking_queued: true,
        pipeline_stage: source.pipeline_stage,
        reused: true,
        source_id: source.id,
        transcript_id: source.transcript_id,
      })
    }

    if (!isAssemblyAiSourceFormat(source.format)) {
      await failSourceStage(
        supabase,
        source.id,
        'transcribing_failed',
        'AssemblyAI transcription is only available for audio and video sources.'
      )
      return jsonResponse(
        {
          error: 'AssemblyAI transcription is only available for audio and video sources.',
          source_id: source.id,
        },
        400
      )
    }

    if (!source.file_path) {
      await failSourceStage(
        supabase,
        source.id,
        'transcribing_failed',
        'This source does not have a stored file to transcribe.'
      )
      return jsonResponse(
        {
          error: 'This source does not have a stored file to transcribe.',
          source_id: source.id,
        },
        400
      )
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(sourceFilesBucket)
      .createSignedUrl(source.file_path, getSignedUrlTtlSeconds())

    if (signedUrlError || !signedUrlData?.signedUrl) {
      throw new Error(signedUrlError?.message ?? 'Could not create a signed source file URL.')
    }

    const transcriptId = await submitTranscript(signedUrlData.signedUrl)

    await updateSourceStage(supabase, source.id, 'transcribing', {
      transcript_id: transcriptId,
    })

    return jsonResponse({
      pipeline_stage: 'transcribing',
      source_id: source.id,
      transcript_id: transcriptId,
    })
  } catch (error) {
    if (sourceId && canUpdateSource) {
      await failSourceStage(supabase, sourceId, 'transcribing_failed', error).catch(() => undefined)
    }

    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

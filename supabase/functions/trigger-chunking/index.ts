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
  getSourceId,
  invokeInternalFunction,
  jsonResponse,
  readJsonBody,
  requireAdminOrServiceRole,
  runInBackground,
  updateSourceStage,
  type SourceRow,
} from '../_shared/pipeline.ts'

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
  let canUpdateSource = false

  try {
    const body = await readJsonBody(request)
    sourceId = getSourceId(body)

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
    if (sourceId && error instanceof TranscriptPendingError) {
      return jsonResponse({ source_id: sourceId, status: error.status }, 202)
    }

    if (sourceId && canUpdateSource) {
      const failureStage =
        error instanceof TranscriptionProviderError ? 'transcribing_failed' : 'chunking_failed'
      await failSourceStage(supabase, sourceId, failureStage, error).catch(() => undefined)
    }

    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

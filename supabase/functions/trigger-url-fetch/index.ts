import {
  corsHeaders,
  createServiceClient,
  errorMessage,
  failSourceStage,
  getSourceId,
  jsonResponse,
  readJsonBody,
  requireAdminOrServiceRole,
  updateSourceStage,
} from '../_shared/pipeline.ts'

interface SourceRow {
  format: string
  id: string
  pipeline_stage: string
  url: string | null
}

interface ChunkInsert {
  chunk_index: number
  raw_text: string
  source_id: string
  speaker: string | null
  speaker_turns: Array<{
    end_sec: number | null
    speaker: string | null
    start_sec: number | null
    text: string
  }>
}

const userAgent = 'AlexandriaBot/1.0'
const minimumWordCount = 200
const targetWordsPerChunk = 500

const wordCount = (text: string) => text.match(/\S+/g)?.length ?? 0

const decodeEntities = (text: string) => {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
}

const stripHtmlToText = (html: string) => {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|blockquote)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return decodeEntities(withoutNoise)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/[ \t\r\f\v]+/g, ' ').trim())
    .filter((paragraph) => wordCount(paragraph) > 3)
    .join('\n\n')
}

const chunkText = (sourceId: string, text: string): ChunkInsert[] => {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  const chunks: ChunkInsert[] = []
  let current: string[] = []
  let currentWords = 0

  for (const paragraph of paragraphs) {
    const paragraphWords = wordCount(paragraph)

    if (current.length > 0 && currentWords + paragraphWords > targetWordsPerChunk) {
      const rawText = current.join('\n\n')
      chunks.push({
        chunk_index: chunks.length,
        raw_text: rawText,
        source_id: sourceId,
        speaker: null,
        speaker_turns: [
          {
            end_sec: null,
            speaker: null,
            start_sec: null,
            text: rawText,
          },
        ],
      })
      current = []
      currentWords = 0
    }

    current.push(paragraph)
    currentWords += paragraphWords
  }

  if (current.length > 0) {
    const rawText = current.join('\n\n')
    chunks.push({
      chunk_index: chunks.length,
      raw_text: rawText,
      source_id: sourceId,
      speaker: null,
      speaker_turns: [
        {
          end_sec: null,
          speaker: null,
          start_sec: null,
          text: rawText,
        },
      ],
    })
  }

  return chunks
}

const getAllowedDomain = async (
  supabase: ReturnType<typeof createServiceClient>,
  hostname: string
) => {
  const { data, error } = await supabase
    .from('url_ingestion_config')
    .select('id')
    .eq('domain', hostname)
    .eq('enabled', true)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
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
      .select('id,format,pipeline_stage,url')
      .eq('id', sourceId)
      .single<SourceRow>()

    if (sourceError || !source) {
      throw new Error('Source was not found.')
    }

    canUpdateSource = true

    if (source.format !== 'url') {
      throw new Error('Only URL-format sources can be fetched.')
    }

    if (source.pipeline_stage !== 'uploaded') {
      throw new Error('Only uploaded URL sources can be fetched.')
    }

    if (!source.url) {
      throw new Error('Source URL is required.')
    }

    const url = new URL(source.url)
    const hostname = url.hostname.toLowerCase()
    const allowedDomain = await getAllowedDomain(supabase, hostname)

    if (!allowedDomain) {
      throw new Error(`Domain is not allowlisted: ${hostname}.`)
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
      },
    })

    if (!response.ok) {
      throw new Error(`URL returned HTTP ${response.status}.`)
    }

    const html = await response.text()
    const text = stripHtmlToText(html)

    if (wordCount(text) < minimumWordCount) {
      throw new Error(
        'This URL returned insufficient readable content. It may require JavaScript rendering or may be behind a paywall.'
      )
    }

    const chunks = chunkText(source.id, text)

    const { error: deleteError } = await supabase.from('chunks').delete().eq('source_id', source.id)

    if (deleteError) {
      throw deleteError
    }

    const { error: insertError } = await supabase.from('chunks').insert(chunks)

    if (insertError) {
      throw insertError
    }

    await updateSourceStage(supabase, source.id, 'chunking', {
      crawl_date: new Date().toISOString(),
    })

    return jsonResponse({
      chunks_created: chunks.length,
      pipeline_stage: 'chunking',
      source_id: source.id,
    })
  } catch (error) {
    if (sourceId && canUpdateSource) {
      await failSourceStage(supabase, sourceId, 'chunking_failed', error).catch(() => undefined)
    }

    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

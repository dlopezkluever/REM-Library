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
const maxDownloadBytes = 1_500_000
const targetWordsPerChunk = 500
const fetchTimeoutMs = 10_000
const nonArticlePathPatterns = [
  /\/tag(\/|$)/i,
  /\/author(\/|$)/i,
  /\/page(\/|$)/i,
  /\/category(\/|$)/i,
  /\/search(\/|$)/i,
  /\/login(\/|$)/i,
  /\/signup(\/|$)/i,
]
const paywallSignals = [
  'subscribe to continue',
  'subscription required',
  'already a subscriber',
  'sign in to continue',
  'to keep reading',
  'paywall',
  'premium article',
]

const wordCount = (text: string) => text.match(/\S+/g)?.length ?? 0

const normalizeUrl = (url: URL) => {
  url.hash = ''
  url.search = ''

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '')
  }

  url.hostname = url.hostname.toLowerCase()

  return url.toString()
}

const assertArticlePath = (url: URL) => {
  if (nonArticlePathPatterns.some((pattern) => pattern.test(url.pathname))) {
    throw new Error('This URL looks like a listing, account, or search page rather than an article.')
  }
}

const assertNoPaywallSignals = (html: string, text: string) => {
  const combined = `${html.slice(0, 100_000)}\n${text.slice(0, 100_000)}`.toLowerCase()

  if (paywallSignals.some((signal) => combined.includes(signal))) {
    throw new Error('This URL appears to be paywalled or gated.')
  }
}

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

const findDuplicateSource = async (
  supabase: ReturnType<typeof createServiceClient>,
  normalizedUrl: string,
  sourceId: string
) => {
  const { data, error } = await supabase.rpc('find_source_by_normalized_url', {
    input_url: normalizedUrl,
  })

  if (error) {
    throw error
  }

  return Array.isArray(data)
    ? data.find((row) => typeof row.id === 'string' && row.id !== sourceId)
    : null
}

const readResponseTextWithLimit = async (response: Response) => {
  const reader = response.body?.getReader()

  if (!reader) {
    throw new Error('Response body is not readable.')
  }

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    totalBytes += value.byteLength

    if (totalBytes > maxDownloadBytes) {
      await reader.cancel()
      throw new Error(
        'This URL returned too much content (over 1.5MB). Consider a more specific URL.'
      )
    }

    chunks.push(value)
  }

  const merged = new Uint8Array(totalBytes)
  let offset = 0

  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder().decode(merged)
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
      return jsonResponse({ error: 'Source was not found.' }, 400)
    }

    if (source.format !== 'url') {
      return jsonResponse({ error: 'Only URL-format sources can be fetched.' }, 400)
    }

    if (source.pipeline_stage !== 'uploaded' && source.pipeline_stage !== 'chunking_failed') {
      return jsonResponse({ error: 'Source is not in a fetchable state.' }, 400)
    }

    if (!source.url) {
      return jsonResponse({ error: 'Source URL is required.' }, 400)
    }

    let url: URL

    try {
      url = new URL(source.url)
    } catch {
      return jsonResponse({ error: 'Source URL is invalid.' }, 400)
    }

    // Mark the source as updateable now that we have a valid URL. Quality
    // checks below (assertArticlePath, paywall, word count) throw on failure,
    // which lands in the catch block and calls failSourceStage. The duplicate
    // and allowlist checks use early returns (400) and intentionally do NOT
    // mark the source failed — they are retryable by the admin.
    canUpdateSource = true

    const hostname = url.hostname.toLowerCase()
    assertArticlePath(url)

    const duplicateSource = await findDuplicateSource(supabase, normalizeUrl(new URL(url)), source.id)

    if (duplicateSource) {
      return jsonResponse({ error: 'Another source already exists for this URL.' }, 400)
    }

    const allowedDomain = await getAllowedDomain(supabase, hostname)

    if (!allowedDomain) {
      return jsonResponse({ error: `Domain is not allowlisted: ${hostname}.` }, 400)
    }

    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), fetchTimeoutMs)
    const response = await fetch(url, {
      headers: {
        'User-Agent': userAgent,
      },
      signal: abortController.signal,
    }).finally(() => clearTimeout(timeoutId))

    if (!response.ok) {
      throw new Error(`URL returned HTTP ${response.status}.`)
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

    if (
      contentType &&
      !contentType.includes('text/html') &&
      !contentType.includes('text/plain') &&
      !contentType.includes('application/xhtml+xml')
    ) {
      throw new Error(`URL returned unsupported content type: ${contentType}.`)
    }

    const html = await readResponseTextWithLimit(response)
    const text = stripHtmlToText(html)
    assertNoPaywallSignals(html, text)

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

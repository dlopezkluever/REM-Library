import { z } from 'zod'

import {
  corsHeaders,
  createServiceClient,
  errorMessage,
  failSourceStage,
  getSourceId,
  jsonResponse,
  readJsonBody,
  requireAdminOrServiceRole,
  requireEnv,
  updateSourceStage,
} from '../_shared/pipeline.ts'

interface ChunkRow {
  chunk_index: number
  end_sec: number | null
  extractions?: Array<{ id: string }> | null
  id: string
  raw_text: string
  speaker: string | null
  start_sec: number | null
}

interface EntityNameRow {
  aliases: string[] | null
  name: string
}

interface ClaudeContentBlock {
  input?: unknown
  text?: unknown
  type?: unknown
}

interface ClaudeMessagesResponse {
  content?: unknown
  error?: unknown
  stop_reason?: unknown
}

interface ClaudeCallResult {
  parsed: BatchExtraction | null
  providerStatus: number
  rawText: string
  retryCount: number
  stopReason: string | null
  validationError: string | null
}

interface RelevantEntity {
  aliases: string[]
  name: string
}

class ProviderHttpError extends Error {
  retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

const entityTypeSchema = z.enum(['symbol', 'figure', 'narrative', 'culture', 'trope'])
const relationshipTypeSchema = z.enum([
  'symbolizes',
  'appears_in',
  'belongs_to',
  'parallels',
  'instantiates',
  'supports',
])

const extractionSchema = z.object({
  claims: z.array(
    z.object({
      entities_involved: z.array(z.string().min(1)),
      evidence_summary: z.string().min(1),
      relationship_type: relationshipTypeSchema,
      statement: z.string().min(1),
    })
  ),
  entities: z.array(
    z.object({
      aliases: z.array(z.string()).default([]),
      description: z.string().nullable().optional(),
      name: z.string().min(1),
      type: entityTypeSchema,
    })
  ),
})

const batchExtractionSchema = z.object({
  chunk_extractions: z.array(
    extractionSchema.extend({
      chunk_id: z.string().optional(),
      chunk_index: z.number().int().nonnegative(),
    })
  ),
})

type BatchExtraction = z.infer<typeof batchExtractionSchema>

const batchSize = 5
const requestSpacingMs = 200
const maxClaudeRetries = 3
const defaultClaudeMaxTokens = 8192
const retryableStatuses = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529])

const sleep = (milliseconds: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

const tokenize = (text: string) => {
  const matches = text.toLowerCase().match(/[a-z0-9]+/g)
  return new Set(matches ?? [])
}

const getRelevantEntityNames = (entities: EntityNameRow[], chunks: ChunkRow[]) => {
  const batchTokens = tokenize(chunks.map((chunk) => chunk.raw_text).join(' '))

  return entities
    .map((entity) => {
      const names = [entity.name, ...(entity.aliases ?? [])]
      const score = names.reduce((total, name) => {
        const tokens = tokenize(name)
        let overlap = 0

        for (const token of tokens) {
          if (batchTokens.has(token)) {
            overlap += 1
          }
        }

        return total + overlap
      }, 0)

      return {
        aliases: entity.aliases ?? [],
        name: entity.name,
        score,
      }
    })
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
    .slice(0, 50)
    .map(({ aliases, name }) => ({ aliases, name }))
}

const systemPrompt = `You extract structured mythology knowledge graph data from source transcript chunks.

Use the provided canonical entity list and aliases when a mention clearly maps to an existing entity. Do not invent evidence beyond the chunk text. If a chunk has no useful graph data, return empty entities and claims for that chunk.`

const extractionTool = {
  description: 'Record structured mythology entities and claims extracted from transcript chunks.',
  input_schema: {
    additionalProperties: false,
    properties: {
      chunk_extractions: {
        items: {
          additionalProperties: false,
          properties: {
            chunk_id: { type: 'string' },
            chunk_index: { minimum: 0, type: 'integer' },
            claims: {
              items: {
                additionalProperties: false,
                properties: {
                  entities_involved: { items: { type: 'string' }, type: 'array' },
                  evidence_summary: { type: 'string' },
                  relationship_type: {
                    enum: [
                      'symbolizes',
                      'appears_in',
                      'belongs_to',
                      'parallels',
                      'instantiates',
                      'supports',
                    ],
                    type: 'string',
                  },
                  statement: { type: 'string' },
                },
                required: [
                  'statement',
                  'entities_involved',
                  'relationship_type',
                  'evidence_summary',
                ],
                type: 'object',
              },
              type: 'array',
            },
            entities: {
              items: {
                additionalProperties: false,
                properties: {
                  aliases: { items: { type: 'string' }, type: 'array' },
                  description: { type: ['string', 'null'] },
                  name: { type: 'string' },
                  type: {
                    enum: ['symbol', 'figure', 'narrative', 'culture', 'trope'],
                    type: 'string',
                  },
                },
                required: ['type', 'name', 'aliases', 'description'],
                type: 'object',
              },
              type: 'array',
            },
          },
          required: ['chunk_id', 'chunk_index', 'entities', 'claims'],
          type: 'object',
        },
        type: 'array',
      },
    },
    required: ['chunk_extractions'],
    type: 'object',
  },
  name: 'record_extractions',
}

const userPrompt = (chunks: ChunkRow[], relevantEntities: RelevantEntity[]) => {
  const chunkPayload = chunks.map((chunk) => ({
    chunk_id: chunk.id,
    chunk_index: chunk.chunk_index,
    end_sec: chunk.end_sec,
    raw_text: chunk.raw_text,
    speaker: chunk.speaker,
    start_sec: chunk.start_sec,
  }))

  return JSON.stringify(
    {
      canonical_entities: relevantEntities,
      chunks: chunkPayload,
    },
    null,
    2
  )
}

const extractTextContent = (response: ClaudeMessagesResponse) => {
  if (!Array.isArray(response.content)) {
    throw new Error('Claude response did not contain content.')
  }

  const textParts = response.content
    .map((block) => {
      if (typeof block !== 'object' || block === null) {
        return ''
      }

      const contentBlock = block as ClaudeContentBlock
      return typeof contentBlock.text === 'string' ? contentBlock.text : ''
    })
    .filter(Boolean)

  if (textParts.length === 0) {
    throw new Error('Claude response did not contain text.')
  }

  return textParts.join('\n')
}

const extractToolInput = (response: ClaudeMessagesResponse) => {
  if (!Array.isArray(response.content)) {
    return null
  }

  const toolBlock = response.content.find((block) => {
    if (typeof block !== 'object' || block === null) {
      return false
    }

    const contentBlock = block as ClaudeContentBlock
    return contentBlock.type === 'tool_use' && contentBlock.input
  })

  if (typeof toolBlock !== 'object' || toolBlock === null) {
    return null
  }

  return (toolBlock as ClaudeContentBlock).input ?? null
}

const parseJsonFromText = (text: string) => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    const startIndex = text.indexOf('{')
    const endIndex = text.lastIndexOf('}')

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      throw new Error('Claude response was not valid JSON.')
    }

    return JSON.parse(text.slice(startIndex, endIndex + 1)) as unknown
  }
}

const getClaudeMaxTokens = (chunks: ChunkRow[]) => {
  const configuredMaxTokens = Number.parseInt(Deno.env.get('ANTHROPIC_MAX_TOKENS') ?? '', 10)

  if (Number.isFinite(configuredMaxTokens) && configuredMaxTokens > 0) {
    return configuredMaxTokens
  }

  const batchWords = chunks.reduce((total, chunk) => total + tokenize(chunk.raw_text).size, 0)
  return Math.max(defaultClaudeMaxTokens, Math.min(16000, batchWords * 3))
}

const readClaudeResponseBody = async (response: Response) => {
  const responseText = await response.text()

  if (!responseText) {
    return { responseBody: {} as ClaudeMessagesResponse, responseText: '' }
  }

  try {
    return {
      responseBody: JSON.parse(responseText) as ClaudeMessagesResponse,
      responseText,
    }
  } catch {
    return { responseBody: {} as ClaudeMessagesResponse, responseText }
  }
}

const retryAfterMilliseconds = (response: Response) => {
  const retryAfter = response.headers.get('retry-after')

  if (!retryAfter) {
    return null
  }

  const seconds = Number.parseFloat(retryAfter)

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const retryDate = new Date(retryAfter).getTime()

  if (Number.isFinite(retryDate)) {
    return Math.max(0, retryDate - Date.now())
  }

  return null
}

const backoffMilliseconds = (attempt: number) => {
  const baseDelay = 1000 * 2 ** attempt
  const jitter = Math.floor(Math.random() * 250)
  return baseDelay + jitter
}

const callClaudeOnce = async (
  chunks: ChunkRow[],
  relevantEntities: RelevantEntity[]
): Promise<{
  responseBody: ClaudeMessagesResponse
  responseText: string
  status: number
  retryAfterMs: number | null
}> => {
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6'
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'x-api-key': requireEnv('ANTHROPIC_API_KEY'),
    },
    body: JSON.stringify({
      max_tokens: getClaudeMaxTokens(chunks),
      messages: [
        {
          content: userPrompt(chunks, relevantEntities),
          role: 'user',
        },
      ],
      model,
      system: systemPrompt,
      temperature: 0,
      tool_choice: { name: extractionTool.name, type: 'tool' },
      tools: [extractionTool],
    }),
  })
  const { responseBody, responseText } = await readClaudeResponseBody(response)

  return {
    responseBody,
    responseText,
    retryAfterMs: retryAfterMilliseconds(response),
    status: response.status,
  }
}

const callClaude = async (
  chunks: ChunkRow[],
  relevantEntities: RelevantEntity[]
): Promise<ClaudeCallResult> => {
  let finalError: Error | null = null

  for (let attempt = 0; attempt <= maxClaudeRetries; attempt += 1) {
    try {
      const response = await callClaudeOnce(chunks, relevantEntities)

      if (retryableStatuses.has(response.status) && attempt < maxClaudeRetries) {
        await sleep(response.retryAfterMs ?? backoffMilliseconds(attempt))
        continue
      }

      if (response.status < 200 || response.status >= 300) {
        const message =
          typeof response.responseBody.error === 'object' && response.responseBody.error !== null
            ? JSON.stringify(response.responseBody.error)
            : response.responseText || `Claude returned ${response.status}.`
        throw new ProviderHttpError(message, retryableStatuses.has(response.status))
      }

      const toolInput = extractToolInput(response.responseBody)
      const rawText = toolInput ? JSON.stringify(toolInput) : extractTextContent(response.responseBody)
      let parsed: BatchExtraction | null = null
      let validationError: string | null = null

      try {
        const json = toolInput ?? parseJsonFromText(rawText)
        const result = batchExtractionSchema.safeParse(json)
        parsed = result.success ? result.data : null
        validationError = result.success ? null : z.prettifyError(result.error)
      } catch (parseError) {
        validationError = errorMessage(parseError)
        parsed = null
      }

      const stopReason =
        typeof response.responseBody.stop_reason === 'string'
          ? response.responseBody.stop_reason
          : null

      if (!parsed && stopReason === 'max_tokens' && attempt < maxClaudeRetries) {
        await sleep(backoffMilliseconds(attempt))
        continue
      }

      return {
        parsed,
        providerStatus: response.status,
        rawText,
        retryCount: attempt,
        stopReason,
        validationError,
      }
    } catch (error) {
      finalError = error instanceof Error ? error : new Error(errorMessage(error))
      const retryableError =
        !(error instanceof ProviderHttpError) || error.retryable

      if (retryableError && attempt < maxClaudeRetries) {
        await sleep(backoffMilliseconds(attempt))
        continue
      }

      throw finalError
    }
  }

  throw finalError ?? new Error('Claude request failed.')
}

const withItemReviewState = (extraction: z.infer<typeof extractionSchema>) => {
  return {
    claims: extraction.claims.map((claim) => ({
      ...claim,
      item_id: crypto.randomUUID(),
      review_status: 'pending',
    })),
    entities: extraction.entities.map((entity) => ({
      ...entity,
      item_id: crypto.randomUUID(),
      review_status: 'pending',
    })),
  }
}

const createValidationFailedExtraction = (
  chunk: ChunkRow,
  claudeResult: ClaudeCallResult,
  batchErrorId: string,
  includeRawResponse: boolean
) => {
  return {
    chunk_id: chunk.id,
    extraction_data: {
      batch_error_id: batchErrorId,
      chunk_index: chunk.chunk_index,
      claims: [],
      entities: [],
      provider: 'anthropic',
      provider_status: claudeResult.providerStatus,
      raw_response: includeRawResponse ? claudeResult.rawText : null,
      retry_count: claudeResult.retryCount,
      stop_reason: claudeResult.stopReason,
      validation_error: claudeResult.validationError,
      validation_failed: true,
    },
    status: 'pending',
  }
}

const toExtractionRow = (
  chunk: ChunkRow,
  batchExtraction: BatchExtraction | null,
  claudeResult: ClaudeCallResult,
  batchErrorId: string,
  includeRawResponse: boolean
) => {
  if (!batchExtraction) {
    return createValidationFailedExtraction(chunk, claudeResult, batchErrorId, includeRawResponse)
  }

  const extraction = batchExtraction.chunk_extractions.find((item) => {
    return item.chunk_id === chunk.id || item.chunk_index === chunk.chunk_index
  })

  if (!extraction) {
    return createValidationFailedExtraction(chunk, claudeResult, batchErrorId, includeRawResponse)
  }

  const itemReviewData = withItemReviewState(extraction)

  return {
    chunk_id: chunk.id,
    extraction_data: {
      claims: itemReviewData.claims,
      entities: itemReviewData.entities,
      provider: 'anthropic',
      provider_status: claudeResult.providerStatus,
      retry_count: claudeResult.retryCount,
      stop_reason: claudeResult.stopReason,
      validation_failed: false,
    },
    status: 'pending',
  }
}

const fetchActiveEntities = async (supabase: ReturnType<typeof createServiceClient>) => {
  const pageSize = 1000
  const entities: EntityNameRow[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('entities')
      .select('name,aliases')
      .neq('status', 'archived')
      .order('name', { ascending: true })
      .range(offset, offset + pageSize - 1)
      .returns<EntityNameRow[]>()

    if (error) {
      throw error
    }

    entities.push(...(data ?? []))

    if (!data || data.length < pageSize) {
      return entities
    }
  }
}

const throttleProviderRequest = async (supabase: ReturnType<typeof createServiceClient>) => {
  const { data, error } = await supabase.rpc('claim_provider_request_slot', {
    provider_name: 'anthropic',
    spacing_ms: requestSpacingMs,
  })

  if (error) {
    throw error
  }

  const waitMs = typeof data === 'number' ? data : 0

  if (waitMs > 0) {
    await sleep(waitMs)
  }
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

    await requireAdminOrServiceRole(request, supabase)
    canUpdateSource = true

    const { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('id,chunk_index,start_sec,end_sec,speaker,raw_text,extractions(id)')
      .eq('source_id', sourceId)
      .order('chunk_index', { ascending: true })
      .returns<ChunkRow[]>()

    if (chunksError) {
      throw chunksError
    }

    if (!chunks || chunks.length === 0) {
      throw new Error('Extraction cannot run until this source has chunks.')
    }

    const chunksWithoutExtractions = chunks.filter((chunk) => {
      return !Array.isArray(chunk.extractions) || chunk.extractions.length === 0
    })

    if (chunksWithoutExtractions.length === 0) {
      await updateSourceStage(supabase, sourceId, 'review')
      return jsonResponse({
        created_extractions: 0,
        pipeline_stage: 'review',
        source_id: sourceId,
      })
    }

    await updateSourceStage(supabase, sourceId, 'extracting')

    const entities = await fetchActiveEntities(supabase)

    let createdExtractionCount = 0

    for (let index = 0; index < chunksWithoutExtractions.length; index += batchSize) {
      const batch = chunksWithoutExtractions.slice(index, index + batchSize)
      const relevantEntities = getRelevantEntityNames(entities, batch)
      await throttleProviderRequest(supabase)
      const claudeResult = await callClaude(batch, relevantEntities)
      const batchErrorId = crypto.randomUUID()
      const extractionRows = batch.map((chunk) =>
        toExtractionRow(
          chunk,
          claudeResult.parsed,
          claudeResult,
          batchErrorId,
          chunk.id === batch[0]?.id
        )
      )

      const { error: insertError } = await supabase.from('extractions').upsert(extractionRows, {
        ignoreDuplicates: true,
        onConflict: 'chunk_id',
      })

      if (insertError) {
        throw insertError
      }

      createdExtractionCount += extractionRows.length

      if (index + batchSize < chunksWithoutExtractions.length) {
        await sleep(requestSpacingMs)
      }
    }

    await updateSourceStage(supabase, sourceId, 'review')

    return jsonResponse({
      created_extractions: createdExtractionCount,
      pipeline_stage: 'review',
      source_id: sourceId,
    })
  } catch (error) {
    if (sourceId && canUpdateSource) {
      await failSourceStage(supabase, sourceId, 'extracting_failed', error).catch(() => undefined)
    }

    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

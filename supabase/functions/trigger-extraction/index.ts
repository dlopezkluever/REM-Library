import { z } from 'npm:zod@4.1.13'

import {
  corsHeaders,
  createServiceClient,
  errorMessage,
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
  text?: unknown
  type?: unknown
}

interface ClaudeMessagesResponse {
  content?: unknown
  error?: unknown
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
        name: entity.name,
        score,
      }
    })
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
    .slice(0, 50)
    .map((entity) => entity.name)
}

const systemPrompt = `You extract structured mythology knowledge graph data from source transcript chunks.

Return only valid JSON in this exact shape:
{
  "chunk_extractions": [
    {
      "chunk_id": "string",
      "chunk_index": 0,
      "entities": [
        {
          "type": "symbol | figure | narrative | culture | trope",
          "name": "canonical entity name",
          "aliases": ["alternate names"],
          "description": "short neutral description grounded in the chunk"
        }
      ],
      "claims": [
        {
          "statement": "specific claim grounded in the chunk",
          "entities_involved": ["canonical entity names"],
          "relationship_type": "symbolizes | appears_in | belongs_to | parallels | instantiates | supports",
          "evidence_summary": "brief explanation of the source evidence"
        }
      ]
    }
  ]
}

Use the provided canonical entity list when a mention clearly maps to an existing entity. Do not invent evidence beyond the chunk text. If a chunk has no useful graph data, return empty entities and claims for that chunk.`

const userPrompt = (chunks: ChunkRow[], relevantEntities: string[]) => {
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

const callClaude = async (
  chunks: ChunkRow[],
  relevantEntities: string[]
): Promise<{ parsed: BatchExtraction | null; rawText: string }> => {
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-4-6'
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
      'x-api-key': requireEnv('ANTHROPIC_API_KEY'),
    },
    body: JSON.stringify({
      max_tokens: 4000,
      messages: [
        {
          content: userPrompt(chunks, relevantEntities),
          role: 'user',
        },
      ],
      model,
      system: systemPrompt,
      temperature: 0,
    }),
  })
  const responseBody = (await response.json()) as ClaudeMessagesResponse

  if (!response.ok) {
    const message =
      typeof responseBody.error === 'object' && responseBody.error !== null
        ? JSON.stringify(responseBody.error)
        : `Claude returned ${response.status}.`
    throw new Error(message)
  }

  const rawText = extractTextContent(responseBody)
  let parsed: BatchExtraction | null = null

  try {
    const json = parseJsonFromText(rawText)
    const result = batchExtractionSchema.safeParse(json)
    parsed = result.success ? result.data : null
  } catch {
    parsed = null
  }

  return {
    parsed,
    rawText,
  }
}

const createValidationFailedExtraction = (chunk: ChunkRow, rawText: string) => {
  return {
    chunk_id: chunk.id,
    extraction_data: {
      chunk_index: chunk.chunk_index,
      claims: [],
      entities: [],
      raw_response: rawText,
      validation_failed: true,
    },
    status: 'pending',
  }
}

const toExtractionRow = (
  chunk: ChunkRow,
  batchExtraction: BatchExtraction | null,
  rawText: string
) => {
  if (!batchExtraction) {
    return createValidationFailedExtraction(chunk, rawText)
  }

  const extraction = batchExtraction.chunk_extractions.find((item) => {
    return item.chunk_id === chunk.id || item.chunk_index === chunk.chunk_index
  })

  if (!extraction) {
    return createValidationFailedExtraction(chunk, rawText)
  }

  return {
    chunk_id: chunk.id,
    extraction_data: {
      claims: extraction.claims,
      entities: extraction.entities,
      validation_failed: false,
    },
    status: 'pending',
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
    await updateSourceStage(supabase, sourceId, 'extracting')

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

    const { data: entities, error: entitiesError } = await supabase
      .from('entities')
      .select('name,aliases')
      .neq('status', 'archived')
      .limit(500)
      .returns<EntityNameRow[]>()

    if (entitiesError) {
      throw entitiesError
    }

    let createdExtractionCount = 0

    for (let index = 0; index < chunksWithoutExtractions.length; index += batchSize) {
      const batch = chunksWithoutExtractions.slice(index, index + batchSize)
      const relevantEntities = getRelevantEntityNames(entities ?? [], batch)
      const claudeResult = await callClaude(batch, relevantEntities)
      const extractionRows = batch.map((chunk) =>
        toExtractionRow(chunk, claudeResult.parsed, claudeResult.rawText)
      )

      const { error: insertError } = await supabase.from('extractions').insert(extractionRows)

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
      await updateSourceStage(supabase, sourceId, 'extracting_failed').catch(() => undefined)
    }

    return jsonResponse({ error: errorMessage(error) }, 500)
  }
})

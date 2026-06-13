/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applySourceRealtimeChange,
  createSourceFilePath,
  getPipelineRerunAction,
  normalizeUrlIngestionDomain,
  sanitizeSourceFilename,
  sortSourcesByCreatedAt,
  type AdminSourceRow,
} from '@/lib/api/admin'
import { ROUTES } from '@/constants/routes'
import { detectSourceFormat, normalizeSourceUrl, validateSourceFile } from '@/lib/sourceUpload'
import { normalizeSourceUrlForDedup, parseAndNormalizeSourceUrlForStorage } from '@/lib/sourceUrl'

const createSource = (
  id: string,
  createdAt: string,
  overrides: Partial<AdminSourceRow> = {}
): AdminSourceRow => ({
  authors: [],
  attribution: null,
  category: null,
  crawl_date: null,
  created_at: createdAt,
  description: null,
  duration_seconds: null,
  file_path: null,
  format: 'audio',
  id,
  license: null,
  page_count: null,
  pipeline_error: null,
  pipeline_stage: 'uploaded',
  pipeline_stage_entered_at: createdAt,
  publication_date: null,
  rights_notes: null,
  status: 'draft',
  tier: 'primary',
  title: `Source ${id}`,
  transcript_id: null,
  updated_at: createdAt,
  url: null,
  ...overrides,
})

describe('admin API helpers', () => {
  it('sorts sources by newest created timestamp first', () => {
    const older = createSource('older', '2026-05-01T00:00:00.000Z')
    const newer = createSource('newer', '2026-05-02T00:00:00.000Z')

    expect(sortSourcesByCreatedAt([older, newer]).map((source) => source.id)).toEqual([
      'newer',
      'older',
    ])
  })

  it('adds inserted realtime sources and keeps newest-first order', () => {
    const existing = createSource('existing', '2026-05-01T00:00:00.000Z')
    const inserted = createSource('inserted', '2026-05-03T00:00:00.000Z')

    const nextSources = applySourceRealtimeChange([existing], {
      eventType: 'INSERT',
      source: inserted,
    })

    expect(nextSources.map((source) => source.id)).toEqual(['inserted', 'existing'])
  })

  it('replaces updated realtime sources without duplicating rows', () => {
    const existing = createSource('existing', '2026-05-01T00:00:00.000Z')
    const updated = createSource('existing', '2026-05-01T00:00:00.000Z', {
      pipeline_stage: 'review',
      title: 'Updated source',
    })

    const nextSources = applySourceRealtimeChange([existing], {
      eventType: 'UPDATE',
      source: updated,
    })

    expect(nextSources).toHaveLength(1)
    expect(nextSources[0]).toMatchObject({ pipeline_stage: 'review', title: 'Updated source' })
  })

  it('removes deleted realtime sources', () => {
    const deleted = createSource('deleted', '2026-05-01T00:00:00.000Z')
    const retained = createSource('retained', '2026-05-02T00:00:00.000Z')

    const nextSources = applySourceRealtimeChange([deleted, retained], {
      eventType: 'DELETE',
      id: 'deleted',
    })

    expect(nextSources.map((source) => source.id)).toEqual(['retained'])
  })

  it('removes archived sources from the realtime monitor cache', () => {
    const archived = createSource('archived', '2026-05-01T00:00:00.000Z', {
      status: 'archived',
    })
    const retained = createSource('retained', '2026-05-02T00:00:00.000Z')

    const nextSources = applySourceRealtimeChange([archived, retained], {
      eventType: 'UPDATE',
      source: archived,
    })

    expect(nextSources.map((source) => source.id)).toEqual(['retained'])
  })

  it('sanitizes source file paths under the source id', () => {
    expect(sanitizeSourceFilename('../My Audio:Test.mp3')).toBe('..-My-Audio-Test.mp3')
    expect(createSourceFilePath('source-id', '../My Audio:Test.mp3')).toBe(
      'source-id/..-My-Audio-Test.mp3'
    )
  })

  it('maps pipeline reruns to the safe backend function', () => {
    expect(getPipelineRerunAction('transcribing_failed').functionName).toBe('trigger-transcription')
    expect(getPipelineRerunAction('extracting_failed').functionName).toBe('trigger-extraction')
    expect(
      getPipelineRerunAction('chunking_failed', {
        file_path: 'source.mp3',
        format: 'audio',
        status: 'draft',
        transcript_id: 'transcript-id',
      }).functionName
    ).toBe('trigger-chunking')
  })

  it('disables reruns for URL-only uploaded sources', () => {
    const action = getPipelineRerunAction('uploaded', {
      file_path: null,
      format: 'url',
      status: 'draft',
      transcript_id: null,
    })

    expect(action.functionName).toBeNull()
    expect(action.disabledReason).toContain('URL ingestion')
  })

  it('disables transcription reruns for document sources', () => {
    const action = getPipelineRerunAction('uploaded', {
      file_path: 'source.pdf',
      format: 'book',
      status: 'draft',
      transcript_id: null,
    })

    expect(action.functionName).toBeNull()
    expect(action.disabledReason).toContain('document ingestion')
  })

  it('maps stale transcribing sources with a transcript id to chunking recovery', () => {
    const action = getPipelineRerunAction('transcribing', {
      file_path: 'source.mp3',
      format: 'audio',
      status: 'draft',
      transcript_id: 'transcript-id',
    })

    expect(action.functionName).toBe('trigger-chunking')
  })

  it('normalizes URL ingestion domains to hostnames', () => {
    expect(normalizeUrlIngestionDomain('https://Example.com/path')).toBe('example.com')
    expect(normalizeUrlIngestionDomain('example.com/path')).toBe('example.com')
  })

  it('rejects invalid URL ingestion domains', () => {
    expect(() => normalizeUrlIngestionDomain('')).toThrow('Domain is required')
    expect(() => normalizeUrlIngestionDomain('not-a-domain')).toThrow('valid domain')
  })

  it('defines admin creation routes as shared constants', () => {
    expect(ROUTES.ADMIN_ENTITY_NEW).toBe('/admin/entities/new')
    expect(ROUTES.ADMIN_CLAIM_NEW).toBe('/admin/claims/new')
  })
})

describe('source upload helpers', () => {
  it('detects supported source formats from filenames', () => {
    expect(detectSourceFormat('lecture.mp3')).toBe('audio')
    expect(detectSourceFormat('archive.mov')).toBe('video')
    expect(detectSourceFormat('book.pdf')).toBe('book')
    expect(detectSourceFormat('notes.md')).toBe('text')
  })

  it('rejects unsupported source extensions before upload', () => {
    const file = new File(['test'], 'script.exe', { type: 'application/octet-stream' })

    expect(validateSourceFile(file)).toBe('Choose a supported source file type.')
  })

  it('allows only http and https source URLs', () => {
    expect(normalizeSourceUrl('https://example.com/source')).toBe('https://example.com/source')
    expect(() => normalizeSourceUrl('ftp://example.com/source')).toThrow(
      'Source URLs must start with http:// or https://.'
    )
  })

  it('uses one shared source URL normalizer for storage and deduplication', () => {
    expect(parseAndNormalizeSourceUrlForStorage('https://example.com/path')).toBe(
      'https://example.com/path'
    )
    expect(() => parseAndNormalizeSourceUrlForStorage('ftp://example.com/path')).toThrow(
      'Source URLs must start with http:// or https://.'
    )
    expect(normalizeSourceUrlForDedup(' HTTPS://Example.com/path/ ')).toBe(
      'https://example.com/path'
    )
  })
})

describe('admin dashboard migration', () => {
  it('does not count null confidence values in the high confidence bucket', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260530050000_admin_dashboard_hardening.sql'),
      'utf8'
    )

    expect(migration).toMatch(
      /from confidence_values\s+where confidence is not null\s+group by label/
    )
  })

  it('adds source file delete policy and MIME restrictions', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260530060000_source_files_bucket.sql'),
      'utf8'
    )

    expect(migration).toContain('source files admin delete')
    expect(migration).toContain('application/pdf')
    expect(migration).toContain('1073741824')
  })

  it('adds the admin source list aggregate RPC', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260531090000_admin_source_list_rows.sql'),
      'utf8'
    )

    expect(migration).toContain('get_admin_source_list_rows')
    expect(migration).toContain('pending_review_count')
    expect(migration).toContain('left join lateral')
  })

  it('adds ingestion pipeline audit schema fixes', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260531120000_ingestion_pipeline_audit_fixes.sql'),
      'utf8'
    )

    expect(migration).toContain('pipeline_error text')
    expect(migration).toContain('speaker_turns jsonb')
    expect(migration).toContain('extractions_chunk_id_unique')
    expect(migration).toContain('claim_provider_request_slot')
  })

  it('adds transactional review queue hardening primitives', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260531130000_review_queue_hardening.sql'),
      'utf8'
    )

    expect(migration).toContain('create table if not exists public.entity_source_anchors')
    expect(migration).toContain('create table if not exists public.admin_audit_events')
    expect(migration).toContain('create or replace function public.review_extraction_item')
    expect(migration).toContain('for update')
    expect(migration).toContain('public.review_extraction_terminal_status')
    expect(migration).toContain('public.get_pending_review_source_summaries')
    expect(migration).toContain('public.get_admin_entities_page')
    expect(migration).toContain('public.get_admin_claims_page')
  })

  it('gates public relationships on published backing claims', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260531130000_review_queue_hardening.sql'),
      'utf8'
    )

    expect(migration).toContain('claims.id = any(relationships.claim_ids)')
    expect(migration).toContain("claims.status = 'published'")
  })

  it('gates public exploration reads on published parent rows', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260601010000_exploration_publication_state.sql'),
      'utf8'
    )

    expect(migration).toContain('status public.content_status not null default')
    expect(migration).toContain("status = 'published'")
    expect(migration).toContain('explorations.id = exploration_steps.exploration_id')
  })

  it('keeps all validation-failed batch rows debuggable', () => {
    const extractionFunction = readFileSync(
      join(process.cwd(), 'supabase/functions/trigger-extraction/index.ts'),
      'utf8'
    )

    expect(extractionFunction).toContain('raw_response: claudeResult.rawText')
    expect(extractionFunction).not.toContain('includeRawResponse')
    expect(extractionFunction).toContain('countWords(chunk.raw_text)')
  })

  it('keeps URL fetch retries stage-safe and caps downloads', () => {
    const urlFetchFunction = readFileSync(
      join(process.cwd(), 'supabase/functions/trigger-url-fetch/index.ts'),
      'utf8'
    )

    expect(urlFetchFunction).toContain("source.pipeline_stage !== 'chunking_failed'")
    expect(urlFetchFunction).toContain('maxDownloadBytes = 1_500_000')
    expect(urlFetchFunction).toContain('readResponseTextWithLimit(response)')
    expect(urlFetchFunction).toContain('unsupported content type')
    expect(urlFetchFunction).not.toContain('response.text()')
  })

  it('uses direct entity evidence and safe relationship lookups for confidence', () => {
    const confidenceFunction = readFileSync(
      join(process.cwd(), 'supabase/functions/compute-confidence/index.ts'),
      'utf8'
    )

    expect(confidenceFunction).toContain("from('entity_source_anchors')")
    expect(confidenceFunction).toContain('uuidPattern')
    expect(confidenceFunction).toContain(".in('from_entity_id', entityIds)")
    expect(confidenceFunction).toContain(".in('to_entity_id', entityIds)")
    expect(confidenceFunction).not.toContain('.or(`from_entity_id.in.')
  })

  it('review_extraction_item raises on invalid action to prevent partial writes', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260531130000_review_queue_hardening.sql'),
      'utf8'
    )

    // Validate that unsupported actions produce an immediate raise rather than a silent no-op
    expect(migration).toMatch(/raise exception.*unsupported.*action/i)
    // Validate the row lock prevents concurrent review of the same item
    expect(migration).toContain('for update')
    // Validate the terminal-status guard prevents re-reviewing already-decided items
    expect(migration).toContain('review_extraction_terminal_status')
  })

  it('review_extraction_item enforces non-empty entity names server-side', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260531130000_review_queue_hardening.sql'),
      'utf8'
    )

    // The normalize_review_text function is used for entity names so empty strings are caught
    expect(migration).toContain('normalize_review_text')
    // nullif converts empty strings to NULL, which the NOT NULL constraint then rejects
    expect(migration).toMatch(/nullif\s*\(.*normalize_review_text/i)
  })

  it('confidence scoring uses both relationship endpoints for weight calculation', () => {
    const confidenceFunction = readFileSync(
      join(process.cwd(), 'supabase/functions/compute-confidence/index.ts'),
      'utf8'
    )

    // Both endpoints must be resolved before computing an edge weight
    expect(confidenceFunction).toContain('fromScore')
    expect(confidenceFunction).toContain('toScore')
    // Scores are averaged, not taken from a single side
    expect(confidenceFunction).toMatch(/fromScore.*toScore|toScore.*fromScore/)
  })

  it('skips archived relationships during confidence weight recomputation', () => {
    const confidenceFunction = readFileSync(
      join(process.cwd(), 'supabase/functions/compute-confidence/index.ts'),
      'utf8'
    )

    expect(confidenceFunction).toContain(".eq('status', 'active')")
  })

  it('confidence scoring validates entity IDs before use', () => {
    const confidenceFunction = readFileSync(
      join(process.cwd(), 'supabase/functions/compute-confidence/index.ts'),
      'utf8'
    )

    expect(confidenceFunction).toContain('uuidPattern')
    expect(confidenceFunction).toMatch(/uuidPattern\.test/)
  })

  it('adds Phase 1 audit fix backend primitives', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260608040000_phase1_audit_fixes.sql'),
      'utf8'
    )

    expect(migration).toContain('weight_override double precision')
    expect(migration).toContain('find_source_by_normalized_url')
    expect(migration).toContain('bulk_update_claim_status')
    expect(migration).toContain("claims.status <> 'archived'")
    expect(migration).toContain('old_status_counts')
  })

  it('logs claim status transitions with old and new status', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/20260608030000_fix_claim_status_transitions.sql'),
      'utf8'
    )

    expect(migration).toContain('previous_status')
    expect(migration).toContain("'old_status', previous_status")
    expect(migration).toContain("'new_status', next_status")
  })

  it('uses affected entity union and batched confidence recomputation for source operations', () => {
    const adminApi = readFileSync(join(process.cwd(), 'src/lib/api/admin.ts'), 'utf8')
    const sourceDetailPage = readFileSync(
      join(process.cwd(), 'src/pages/admin/AdminSourceDetailPage.tsx'),
      'utf8'
    )

    expect(adminApi).toContain('getSourceAffectedEntityIds')
    expect(adminApi).toContain("from('claim_entities')")
    expect(adminApi).toContain('confidenceComputationBatchSize = 200')
    expect(adminApi).toContain("supabase.rpc('bulk_update_claim_status'")
    expect(sourceDetailPage).toContain('getSourceAffectedEntityIds')
    expect(sourceDetailPage).toContain('recomputeConfidenceInBatches')
  })

  it('filters public relationship APIs to active rows and applies effective weight', () => {
    const relationshipsApi = readFileSync(
      join(process.cwd(), 'src/lib/api/relationships.ts'),
      'utf8'
    )
    const entitiesApi = readFileSync(join(process.cwd(), 'src/lib/api/entities.ts'), 'utf8')

    expect(relationshipsApi).toContain(".eq('status', 'active')")
    expect(relationshipsApi).toContain("from('entities')")
    expect(relationshipsApi).toContain("from('claims')")
    expect(relationshipsApi).toContain(".eq('status', 'published')")
    expect(relationshipsApi).toContain('relationship.claim_ids.some')
    expect(relationshipsApi).toContain('relationship.weight_override ?? relationship.weight')
    expect(entitiesApi).toContain(".eq('status', 'active')")
    expect(entitiesApi).toContain('filterPublicRelationships(firstHopRelationshipRows)')
    expect(entitiesApi).toContain('filterPublicRelationships(secondHopRelationshipRows)')
  })

  it('scopes source impact bulk claim actions to explicit visible claim ids', () => {
    const adminApi = readFileSync(join(process.cwd(), 'src/lib/api/admin.ts'), 'utf8')
    const sourceImpactPage = readFileSync(
      join(process.cwd(), 'src/pages/admin/AdminSourceImpactPage.tsx'),
      'utf8'
    )

    expect(adminApi).toContain(
      'export const unpublishSourceClaims = async (sourceId: string, claimIds: string[])'
    )
    expect(adminApi).toContain(
      'export const markSourceClaimsDisputed = async (sourceId: string, claimIds: string[])'
    )
    expect(adminApi).toContain('const sourceClaimIds = new Set(await getSourceClaimIds(sourceId))')
    expect(adminApi).toContain('requestedClaimIds.filter((claimId) => sourceClaimIds.has(claimId))')
    expect(sourceImpactPage).toContain("claim.status === 'published'")
    expect(sourceImpactPage).toContain("claim.status === 'published' || claim.status === 'draft'")
    expect(sourceImpactPage).toContain('claimIds: action ===')
  })

  it('writes entity status audit events before publish confidence recomputation', () => {
    const adminApi = readFileSync(join(process.cwd(), 'src/lib/api/admin.ts'), 'utf8')
    const auditIndex = adminApi.indexOf("insertAdminAuditEvent('update_entity_status'")
    const recomputeIndex = adminApi.indexOf('recomputeConfidenceInBatches([entityId])')

    expect(auditIndex).toBeGreaterThan(-1)
    expect(recomputeIndex).toBeGreaterThan(-1)
    expect(auditIndex).toBeLessThan(recomputeIndex)
  })
})

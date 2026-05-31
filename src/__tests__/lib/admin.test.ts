/// <reference types="node" />

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applySourceRealtimeChange,
  createSourceFilePath,
  getPipelineRerunAction,
  sanitizeSourceFilename,
  sortSourcesByCreatedAt,
  type AdminSourceRow,
} from '@/lib/api/admin'
import { detectSourceFormat, normalizeSourceUrl, validateSourceFile } from '@/lib/sourceUpload'

const createSource = (
  id: string,
  createdAt: string,
  overrides: Partial<AdminSourceRow> = {}
): AdminSourceRow => ({
  authors: [],
  created_at: createdAt,
  description: null,
  duration_seconds: null,
  file_path: null,
  format: 'audio',
  id,
  page_count: null,
  pipeline_stage: 'uploaded',
  pipeline_stage_entered_at: createdAt,
  publication_date: null,
  status: 'draft',
  tier: 'primary',
  title: `Source ${id}`,
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
    expect(getPipelineRerunAction('transcribing_failed').functionName).toBe(
      'trigger-transcription'
    )
    expect(getPipelineRerunAction('extracting_failed').functionName).toBe('trigger-extraction')
    expect(getPipelineRerunAction('chunking_failed').functionName).toBeNull()
  })

  it('disables reruns for URL-only uploaded sources', () => {
    const action = getPipelineRerunAction('uploaded', {
      file_path: null,
      format: 'url',
      status: 'draft',
    })

    expect(action.functionName).toBeNull()
    expect(action.disabledReason).toContain('URL ingestion')
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
})

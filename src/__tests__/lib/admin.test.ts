import { describe, expect, it } from 'vitest'
import {
  applySourceRealtimeChange,
  sortSourcesByCreatedAt,
  type AdminSourceRow,
} from '@/lib/api/admin'

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
})

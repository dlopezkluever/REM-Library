import { describe, expect, it } from 'vitest'
import { formatAnchorLocator, formatChicagoCitation, formatInformalCitation } from '@/lib/citations'
import type { SourceAnchorRow, SourceRow } from '@/lib/api/sources'

const makeAnchor = (overrides: Partial<SourceAnchorRow> = {}): SourceAnchorRow =>
  ({
    id: 'anchor-1',
    source_id: 'source-1',
    start_timestamp_sec: null,
    end_timestamp_sec: null,
    start_page: null,
    end_page: null,
    transcript_excerpt: null,
    speaker: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as unknown as SourceAnchorRow

const makeSource = (overrides: Partial<SourceRow> = {}): SourceRow =>
  ({
    id: 'source-1',
    title: 'The Stolen Fire',
    authors: ['Jane Goodall'],
    publication_date: '2021-05-01',
    format: 'audio',
    tier: 'primary',
    url: null,
    file_path: null,
    duration_seconds: null,
    page_count: null,
    pipeline_stage: 'published',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as unknown as SourceRow

describe('formatAnchorLocator', () => {
  it('formats a timestamp range', () => {
    const anchor = makeAnchor({ start_timestamp_sec: 90, end_timestamp_sec: 125 })
    expect(formatAnchorLocator(anchor)).toBe('00:01:30–00:02:05')
  })

  it('collapses identical start and end timestamps', () => {
    const anchor = makeAnchor({ start_timestamp_sec: 90, end_timestamp_sec: 90 })
    expect(formatAnchorLocator(anchor)).toBe('00:01:30')
  })

  it('formats a page range', () => {
    const anchor = makeAnchor({ start_page: 12, end_page: 14 })
    expect(formatAnchorLocator(anchor)).toBe('pp. 12–14')
  })

  it('formats a single page', () => {
    const anchor = makeAnchor({ start_page: 12 })
    expect(formatAnchorLocator(anchor)).toBe('p. 12')
  })

  it('returns null when there is no locator', () => {
    expect(formatAnchorLocator(makeAnchor())).toBeNull()
  })
})

describe('formatChicagoCitation', () => {
  it('formats author, title, format, full date, and locator', () => {
    const citation = formatChicagoCitation({
      anchor: makeAnchor({ start_timestamp_sec: 90 }),
      source: makeSource(),
    })
    expect(citation).toBe('Goodall, Jane. "The Stolen Fire." Audio, 2021-05-01. 00:01:30.')
  })

  it('keeps year-only source dates clean', () => {
    const citation = formatChicagoCitation({
      anchor: makeAnchor(),
      source: makeSource({ publication_date: '2021' }),
    })
    expect(citation).toBe('Goodall, Jane. "The Stolen Fire." Audio, 2021.')
  })

  it('marks multiple authors with et al.', () => {
    const citation = formatChicagoCitation({
      anchor: makeAnchor(),
      source: makeSource({ authors: ['Jane Goodall', 'Carl Sagan'] }),
    })
    expect(citation).toContain('Goodall, Jane, et al.')
  })

  it('omits author and year when absent', () => {
    const citation = formatChicagoCitation({
      anchor: makeAnchor(),
      source: makeSource({ authors: [], publication_date: null }),
    })
    expect(citation).toBe('"The Stolen Fire." Audio.')
  })
})

describe('formatInformalCitation', () => {
  it('includes title, author, tier, and locator', () => {
    const citation = formatInformalCitation({
      anchor: makeAnchor({ start_page: 12 }),
      source: makeSource({ format: 'book', tier: 'secondary' }),
    })
    expect(citation).toBe('The Stolen Fire by Jane Goodall (Tier 2) — p. 12')
  })
})

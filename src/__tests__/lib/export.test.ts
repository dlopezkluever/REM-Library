import { describe, expect, it } from 'vitest'
import { buildClaimExport, buildEntityExport } from '@/lib/export'
import type { CitationInput } from '@/lib/citations'
import type { EntityRow } from '@/lib/api/entities'
import type { ClaimWithAuthor } from '@/lib/api/claims'

const entity = {
  id: 'entity-1',
  type: 'symbol',
  name: 'Fire',
  slug: 'fire',
  aliases: ['Flame'],
  description: 'The divine spark captured in material form.',
  confidence_score: 0.82,
  confidence_override: null,
} as unknown as EntityRow

const claim = {
  id: 'claim-1',
  statement: 'Fire parallels the stolen divine spark.',
  detailed_argument: 'A longer argument about the theft of fire.',
  confidence_score: 0.7,
  confidence_override: null,
  status: 'published',
  created_at: '2026-01-01T00:00:00Z',
  profiles: { display_name: 'Jane Goodall' },
} as unknown as ClaimWithAuthor

const evidence: CitationInput[] = [
  {
    anchor: {
      id: 'anchor-1',
      start_timestamp_sec: 90,
      end_timestamp_sec: null,
      start_page: null,
      end_page: null,
    },
    source: {
      id: 'source-1',
      title: 'The Stolen Fire',
      authors: ['Jane Goodall'],
      publication_date: '2021-05-01',
      format: 'audio',
      tier: 'primary',
    },
  } as unknown as CitationInput,
]

describe('buildEntityExport', () => {
  it('produces Markdown with headings, metadata, connections, and sources', () => {
    const output = buildEntityExport(
      {
        entity,
        connections: [
          { name: 'Prometheus', relationshipType: 'symbolizes' },
          { name: 'Vulcan', relationshipType: 'symbolizes' },
          { name: 'Genesis 3', relationshipType: 'appears_in' },
        ],
        evidence,
      },
      { format: 'markdown', citationStyle: 'informal' }
    )

    expect(output).toContain('# Fire')
    expect(output).toContain('**Type:** Symbol')
    expect(output).toContain('**Also known as:** Flame')
    expect(output).toContain('**Confidence:** 82%')
    expect(output).toContain('## Connections')
    expect(output).toContain('**symbolizes:**')
    expect(output).toContain('- Prometheus')
    expect(output).toContain('1. The Stolen Fire by Jane Goodall (Tier 1) — 00:01:30')
  })

  it('prefers the confidence override', () => {
    const output = buildEntityExport(
      { entity: { ...entity, confidence_override: 0.5 }, connections: [], evidence: [] },
      { format: 'plain', citationStyle: 'informal' }
    )
    expect(output).toContain('Confidence: 50%')
    expect(output).not.toContain('**')
  })

  it('deduplicates repeated source anchors and uses an absolute canonical URL when provided', () => {
    const output = buildEntityExport(
      {
        canonicalUrl: 'https://mythograph.example/entity/fire',
        entity,
        connections: [],
        evidence: [evidence[0], evidence[0]],
      },
      { format: 'markdown', citationStyle: 'informal' }
    )

    expect(output.match(/The Stolen Fire/g)).toHaveLength(1)
    expect(output).toContain('Exported from Mythograph · https://mythograph.example/entity/fire')
  })
})

describe('buildClaimExport', () => {
  it('uses footnote references in Markdown', () => {
    const output = buildClaimExport(
      {
        claim,
        entities: [{ name: 'Fire', type: 'symbol' }],
        evidence,
      },
      { format: 'markdown', citationStyle: 'chicago' }
    )

    expect(output).toContain('Fire parallels the stolen divine spark. [^1]')
    expect(output).toContain('## Entities Involved')
    expect(output).toContain('- Fire (Symbol)')
    expect(output).toContain('[^1]: Goodall, Jane. "The Stolen Fire." Audio, 2021-05-01. 00:01:30.')
    expect(output).toContain('**Author:** Jane Goodall')
  })

  it('uses numbered citations in plain text', () => {
    const output = buildClaimExport(
      { claim, entities: [], evidence },
      { format: 'plain', citationStyle: 'informal' }
    )
    expect(output).not.toContain('[^1]')
    expect(output).toContain('1. The Stolen Fire by Jane Goodall (Tier 1) — 00:01:30')
  })
})

import { describe, expect, it } from 'vitest'
import {
  enrichSplitError,
  findHighlightSpan,
  validateClaimInput,
  validateEntityInput,
} from '@/lib/reviewUtils'

describe('findHighlightSpan', () => {
  it('returns exact span for a verbatim substring', () => {
    const text = 'The ancient serpent represents chaos in early mythology.'
    const passage = 'represents chaos'
    const span = findHighlightSpan(text, passage)
    expect(span).not.toBeNull()
    expect(text.slice(span![0], span![1])).toBe('represents chaos')
  })

  it('returns a fuzzy span when the passage is paraphrased', () => {
    // Key words 'serpent', 'chaos', 'mythology' appear close together in the text
    const text =
      'The ancient serpent symbolizes chaos in early mythology and represents cosmic disorder.'
    const passage = 'serpent represents chaos mythology'
    const span = findHighlightSpan(text, passage)
    expect(span).not.toBeNull()
    const highlighted = text.slice(span![0], span![1]).toLowerCase()
    // The best-scoring window should capture at least half the significant passage words
    const passageWords = ['serpent', 'chaos', 'mythology', 'represents']
    const matchCount = passageWords.filter((w) => highlighted.includes(w)).length
    expect(matchCount).toBeGreaterThanOrEqual(2)
  })

  it('returns null when the passage shares fewer than 40% of words with any window', () => {
    const text = 'A short passage about rivers and mountains.'
    const passage = 'quantum mechanics entanglement photon wavelength'
    expect(findHighlightSpan(text, passage)).toBeNull()
  })

  it('returns null for an empty passage', () => {
    expect(findHighlightSpan('some text here', '')).toBeNull()
    expect(findHighlightSpan('some text here', '   ')).toBeNull()
  })

  it('returns null when the passage is longer than the text', () => {
    expect(findHighlightSpan('short', 'this is a much longer passage than the text')).toBeNull()
  })

  it('prefers exact match over fuzzy when both exist', () => {
    const text = 'The hero undergoes transformation and the hero emerges renewed.'
    const passage = 'hero undergoes transformation'
    const span = findHighlightSpan(text, passage)
    expect(span).not.toBeNull()
    expect(text.slice(span![0], span![1])).toBe('hero undergoes transformation')
  })
})

describe('validateEntityInput', () => {
  it('returns an error for null input', () => {
    expect(validateEntityInput(null)).toBe('Entity name is required.')
  })

  it('returns an error for an empty name', () => {
    expect(
      validateEntityInput({ aliases: [], description: null, name: '', type: 'symbol' })
    ).toBe('Entity name is required.')
  })

  it('returns an error for a whitespace-only name', () => {
    expect(
      validateEntityInput({ aliases: [], description: null, name: '   ', type: 'symbol' })
    ).toBe('Entity name is required.')
  })

  it('returns null for a valid entity input', () => {
    expect(
      validateEntityInput({ aliases: [], description: null, name: 'The World Tree', type: 'symbol' })
    ).toBeNull()
  })
})

describe('validateClaimInput', () => {
  it('returns an error for null input', () => {
    expect(validateClaimInput(null)).toBe('Claim statement is required.')
  })

  it('returns an error for an empty statement', () => {
    expect(
      validateClaimInput({
        entitiesInvolved: ['Entity A'],
        evidenceSummary: 'some evidence',
        relationshipType: 'symbolizes',
        statement: '',
      })
    ).toBe('Claim statement is required.')
  })

  it('returns an error when no entities are involved', () => {
    expect(
      validateClaimInput({
        entitiesInvolved: [],
        evidenceSummary: 'some evidence',
        relationshipType: 'symbolizes',
        statement: 'A symbolizes B',
      })
    ).toBe('At least one involved entity is required.')
  })

  it('returns null for a valid claim input', () => {
    expect(
      validateClaimInput({
        entitiesInvolved: ['The World Tree'],
        evidenceSummary: 'The tree connects all realms',
        relationshipType: 'symbolizes',
        statement: 'The World Tree symbolizes cosmic order',
      })
    ).toBeNull()
  })
})

describe('enrichSplitError', () => {
  it('prefixes the error with "First entity" when the first name matches', () => {
    const result = enrichSplitError(
      'Entity "Odin" already exists as published. Use Merge instead.',
      'Odin',
      'Thor'
    )
    expect(result).toMatch(/^First entity —/)
    expect(result).toContain('already exists as published')
  })

  it('prefixes the error with "Second entity" when the second name matches', () => {
    const result = enrichSplitError(
      'Entity "Thor" already exists as published. Use Merge instead.',
      'Odin',
      'Thor'
    )
    expect(result).toMatch(/^Second entity —/)
  })

  it('returns the original message when neither name matches', () => {
    const msg = 'Only entity extractions can be split.'
    expect(enrichSplitError(msg, 'Odin', 'Thor')).toBe(msg)
  })

  it('is case-insensitive when matching entity names', () => {
    const result = enrichSplitError(
      'Entity "odin" already exists as draft. Use Merge instead.',
      'Odin',
      'Thor'
    )
    expect(result).toMatch(/^First entity —/)
  })
})

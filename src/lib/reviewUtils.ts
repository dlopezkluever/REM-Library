import type { SaveClaimReviewInput, SaveEntityReviewInput } from '@/lib/api/admin'

const extractSignificantWords = (text: string): string[] => {
  const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? []
  return [...new Set(words)]
}

/**
 * Returns the [start, end] char indices of the passage's best fuzzy match
 * within text, or null if no match scores above the 0.4 word-overlap threshold.
 *
 * Uses a fixed-length sliding window equal to the passage length, scoring
 * windows by the fraction of significant passage words they contain.
 */
export const findHighlightSpan = (text: string, passage: string): [number, number] | null => {
  const lower = text.toLowerCase()
  const lowerPassage = passage.toLowerCase().trim()

  if (!lowerPassage) return null

  // Exact match is always preferred
  const exact = lower.indexOf(lowerPassage)
  if (exact !== -1) {
    return [exact, exact + lowerPassage.length]
  }

  const passageWords = extractSignificantWords(lowerPassage)
  if (passageWords.length === 0) return null

  // Try windows at the passage length and up to 1.5x to handle spread paraphrasing
  const baselen = lowerPassage.length
  const maxWindowLen = Math.ceil(baselen * 1.5)
  if (baselen < 4 || baselen > lower.length) return null

  let bestScore = 0.39 // minimum threshold to qualify as a match
  let bestStart = -1
  let bestLen = baselen

  for (let windowLen = baselen; windowLen <= maxWindowLen; windowLen += Math.max(1, Math.floor(baselen * 0.1))) {
    if (windowLen > lower.length) break
    for (let i = 0; i <= lower.length - windowLen; i++) {
      const window = lower.slice(i, i + windowLen)
      let hits = 0
      for (const word of passageWords) {
        if (window.includes(word)) hits++
      }
      // Penalise wider windows slightly so exact-length wins ties
      const score = (hits / passageWords.length) * (baselen / windowLen)
      if (score > bestScore) {
        bestScore = score
        bestStart = i
        bestLen = windowLen
      }
    }
  }

  if (bestStart === -1) return null
  return [bestStart, bestStart + bestLen]
}

export const validateEntityInput = (value: SaveEntityReviewInput | null): string | null => {
  if (!value || !value.name.trim()) {
    return 'Entity name is required.'
  }

  return null
}

export const validateClaimInput = (value: SaveClaimReviewInput | null): string | null => {
  if (!value || !value.statement.trim()) {
    return 'Claim statement is required.'
  }

  if (value.entitiesInvolved.length === 0) {
    return 'At least one involved entity is required.'
  }

  return null
}

/**
 * Returns a human-readable label for a split RPC error that names an entity.
 * Matches the entity name from the DB error message against the two split
 * drafts and prepends "First entity — " or "Second entity — " accordingly.
 */
export const enrichSplitError = (
  message: string,
  firstName: string,
  secondName: string
): string => {
  const lower = message.toLowerCase()
  const firstLower = firstName.trim().toLowerCase()
  const secondLower = secondName.trim().toLowerCase()

  if (firstLower && lower.includes(`entity "${firstLower}"`)) {
    return `First entity — ${message}`
  }

  if (secondLower && lower.includes(`entity "${secondLower}"`)) {
    return `Second entity — ${message}`
  }

  return message
}

import type { SourceAnchorRow, SourceRow } from '@/lib/api/sources'
import type { SourceFormat } from '@/types/domain'
import { formatTimestamp } from '@/lib/format'

export type CitationStyle = 'informal' | 'chicago'

export interface CitationInput {
  anchor: SourceAnchorRow
  source: SourceRow
}

const FORMAT_LABELS: Record<SourceFormat, string> = {
  audio: 'Audio',
  video: 'Video',
  text: 'Text',
  book: 'Book',
  url: 'Web',
}

export const formatAnchorLocator = (anchor: SourceAnchorRow): string | null => {
  const start = formatTimestamp(anchor.start_timestamp_sec)
  if (start) {
    const end = formatTimestamp(anchor.end_timestamp_sec)
    return end && end !== start ? `${start}–${end}` : start
  }

  if (anchor.start_page != null) {
    const end = anchor.end_page
    return end && end !== anchor.start_page
      ? `pp. ${anchor.start_page}–${end}`
      : `p. ${anchor.start_page}`
  }

  return null
}

const formatYear = (date: string | null): string | null => {
  if (!date) {
    return null
  }
  const year = date.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : null
}

const formatAuthorChicago = (authors: string[]): string | null => {
  const primary = authors[0]?.trim()
  if (!primary) {
    return null
  }

  const parts = primary.split(/\s+/)
  let formatted = primary
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    const rest = parts.slice(0, -1).join(' ')
    formatted = `${last}, ${rest}`
  }

  if (authors.length > 1) {
    formatted += ', et al.'
  }

  return formatted
}

export const formatChicagoCitation = ({ anchor, source }: CitationInput): string => {
  const segments: string[] = []

  const author = formatAuthorChicago(source.authors)
  if (author) {
    segments.push(`${author}.`)
  }

  segments.push(`"${source.title}."`)

  let formatDate = FORMAT_LABELS[source.format]
  const year = formatYear(source.publication_date)
  if (year) {
    formatDate += `, ${year}`
  }
  segments.push(`${formatDate}.`)

  const locator = formatAnchorLocator(anchor)
  if (locator) {
    segments.push(`${locator}.`)
  }

  return segments.join(' ')
}

export const formatInformalCitation = ({ anchor, source }: CitationInput): string => {
  const parts: string[] = [source.title]
  if (source.authors.length > 0) {
    parts.push(`by ${source.authors.join(', ')}`)
  }
  parts.push(`(${source.tier === 'primary' ? 'Tier 1' : 'Tier 2'})`)

  let citation = parts.join(' ')
  const locator = formatAnchorLocator(anchor)
  if (locator) {
    citation += ` — ${locator}`
  }

  return citation
}

export const formatCitation = (input: CitationInput, style: CitationStyle): string => {
  return style === 'chicago' ? formatChicagoCitation(input) : formatInformalCitation(input)
}

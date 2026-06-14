import type { EntityRow } from '@/lib/api/entities'
import type { ClaimWithAuthor } from '@/lib/api/claims'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import { formatCitation, type CitationInput, type CitationStyle } from '@/lib/citations'
import { formatEnumLabel } from '@/lib/format'
import type { EntityType } from '@/types/domain'

export type ExportFormat = 'markdown' | 'plain'

export interface ExportOptions {
  format: ExportFormat
  citationStyle: CitationStyle
}

export interface EntityExportConnection {
  name: string
  relationshipType: string | null
}

export interface EntityExportInput {
  entity: EntityRow
  connections: EntityExportConnection[]
  evidence: CitationInput[]
  canonicalUrl?: string
}

export interface ClaimExportInput {
  claim: ClaimWithAuthor
  entities: { name: string; type: EntityType }[]
  evidence: CitationInput[]
  canonicalUrl?: string
}

interface Formatter {
  h1: (text: string) => string
  h2: (text: string) => string
  bold: (text: string) => string
  bullet: (text: string) => string
}

const makeFormatter = (format: ExportFormat): Formatter => {
  if (format === 'markdown') {
    return {
      h1: (text) => `# ${text}`,
      h2: (text) => `## ${text}`,
      bold: (text) => `**${text}**`,
      bullet: (text) => `- ${text}`,
    }
  }

  return {
    h1: (text) => `${text}\n${'='.repeat(text.length)}`,
    h2: (text) => text.toUpperCase(),
    bold: (text) => text,
    bullet: (text) => `- ${text}`,
  }
}

const relationshipLabel = (type: string | null): string =>
  type ? formatEnumLabel(type) : 'related'

const formatPercent = (value: number): string =>
  `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%`

const entityConfidence = (entity: EntityRow): number =>
  entity.confidence_override ?? entity.confidence_score

const claimConfidence = (claim: ClaimWithAuthor): number =>
  claim.confidence_override ?? claim.confidence_score

const finalize = (lines: string[]): string =>
  `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`

export const dedupeCitationInputs = (evidence: CitationInput[]): CitationInput[] => {
  const seen = new Set<string>()

  return evidence.filter((item) => {
    const sourceId = item.source.id ?? item.source.title
    const anchorId = item.anchor.id ?? formatCitation(item, 'informal')
    const key = `${sourceId}:${anchorId}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

export const buildEntityExport = (input: EntityExportInput, options: ExportOptions): string => {
  const { entity, connections } = input
  const evidence = dedupeCitationInputs(input.evidence)
  const fmt = makeFormatter(options.format)
  const lines: string[] = []

  lines.push(fmt.h1(entity.name))
  lines.push('')
  lines.push(`${fmt.bold('Type:')} ${ENTITY_LABELS[entity.type]}`)
  if (entity.aliases.length > 0) {
    lines.push(`${fmt.bold('Also known as:')} ${entity.aliases.join(', ')}`)
  }
  lines.push(`${fmt.bold('Confidence:')} ${formatPercent(entityConfidence(entity))}`)
  lines.push('')

  if (entity.description) {
    lines.push(fmt.h2('Description'))
    lines.push('')
    lines.push(entity.description)
    lines.push('')
  }

  if (connections.length > 0) {
    lines.push(fmt.h2('Connections'))
    lines.push('')
    for (const [type, names] of groupConnections(connections)) {
      lines.push(fmt.bold(`${relationshipLabel(type)}:`))
      for (const name of names) {
        lines.push(fmt.bullet(name))
      }
      lines.push('')
    }
  }

  if (evidence.length > 0) {
    lines.push(fmt.h2('Sources'))
    lines.push('')
    evidence.forEach((item, index) => {
      lines.push(`${index + 1}. ${formatCitation(item, options.citationStyle)}`)
    })
    lines.push('')
  }

  lines.push('')
  lines.push(`Exported from Mythograph · ${input.canonicalUrl ?? `/entity/${entity.slug}`}`)

  return finalize(lines)
}

export const buildClaimExport = (input: ClaimExportInput, options: ExportOptions): string => {
  const { claim, entities, evidence } = input
  const fmt = makeFormatter(options.format)
  const useFootnotes = options.format === 'markdown'
  const lines: string[] = []

  lines.push(fmt.h1('Claim'))
  lines.push('')

  let statement = claim.statement
  if (useFootnotes && evidence.length > 0) {
    statement += ` ${evidence.map((_, index) => `[^${index + 1}]`).join('')}`
  }
  lines.push(statement)
  lines.push('')

  if (claim.detailed_argument) {
    lines.push(fmt.h2('Argument'))
    lines.push('')
    lines.push(claim.detailed_argument)
    lines.push('')
  }

  lines.push(`${fmt.bold('Confidence:')} ${formatPercent(claimConfidence(claim))}`)
  lines.push(`${fmt.bold('Author:')} ${claim.profiles?.display_name ?? 'Unknown researcher'}`)
  lines.push(`${fmt.bold('Status:')} ${claim.status}`)
  lines.push('')

  if (entities.length > 0) {
    lines.push(fmt.h2('Entities Involved'))
    lines.push('')
    for (const entity of entities) {
      lines.push(fmt.bullet(`${entity.name} (${ENTITY_LABELS[entity.type]})`))
    }
    lines.push('')
  }

  if (evidence.length > 0) {
    lines.push(fmt.h2('Sources'))
    lines.push('')
    evidence.forEach((item, index) => {
      const citation = formatCitation(item, options.citationStyle)
      lines.push(useFootnotes ? `[^${index + 1}]: ${citation}` : `${index + 1}. ${citation}`)
    })
    lines.push('')
  }

  lines.push('')
  lines.push(`Exported from Mythograph · ${input.canonicalUrl ?? `/claim/${claim.id}`}`)

  return finalize(lines)
}

const groupConnections = (connections: EntityExportConnection[]): Map<string | null, string[]> => {
  const groups = new Map<string | null, string[]>()
  for (const connection of connections) {
    const existing = groups.get(connection.relationshipType)
    if (existing) {
      existing.push(connection.name)
    } else {
      groups.set(connection.relationshipType, [connection.name])
    }
  }
  return groups
}

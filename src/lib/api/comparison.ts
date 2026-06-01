import {
  getEntityBySlug,
  getEntityNeighborhood,
  type EntityRow,
  type RelationshipRow,
} from '@/lib/api/entities'
import { getClaimsForEntity, type ClaimWithAuthor } from '@/lib/api/claims'
import { getSourceEvidenceForClaims, type SourceAnchorEvidence } from '@/lib/api/sources'
import type { RelationshipType } from '@/types/domain'

export interface ComparisonConnection {
  entity: EntityRow
  relationshipType: RelationshipType | null
}

export interface ComparisonEntity {
  slug: string
  entity: EntityRow
  connections: ComparisonConnection[]
  claims: ClaimWithAuthor[]
  evidence: SourceAnchorEvidence[]
  sourceCount: number
}

export const getComparisonEntity = async (slug: string): Promise<ComparisonEntity> => {
  const entity = await getEntityBySlug(slug)
  const neighborhood = await getEntityNeighborhood(entity.id, 1)
  const connections = buildConnections(entity.id, neighborhood.entities, neighborhood.relationships)

  const claims = await getClaimsForEntity(entity.id)
  const evidence = await getSourceEvidenceForClaims(claims.map((claim) => claim.id))
  const sourceCount = new Set(evidence.map((item) => item.source.id)).size

  return { slug, entity, connections, claims, evidence, sourceCount }
}

const buildConnections = (
  entityId: string,
  entities: EntityRow[],
  relationships: RelationshipRow[]
): ComparisonConnection[] => {
  return entities
    .filter((entity) => entity.id !== entityId)
    .map((connected) => {
      const relationship = relationships.find(
        (item) =>
          (item.from_entity_id === entityId && item.to_entity_id === connected.id) ||
          (item.to_entity_id === entityId && item.from_entity_id === connected.id)
      )

      return { entity: connected, relationshipType: relationship?.type ?? null }
    })
}

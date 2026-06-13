import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { AttestationBar } from '@/components/entity/AttestationBar'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { EntityChip } from '@/components/entity/EntityChip'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { getEntityPreviewWithClaims, getPublishedEntities } from '@/lib/api/entities'
import { getAllPublishedRelationships } from '@/lib/api/relationships'
import { truncateText } from '@/lib/format'
import { useGraphStore } from '@/stores/graphStore'
import type { InterpretationFrame } from '@/types/domain'

const frameLabels: Record<InterpretationFrame, string> = {
  canonical_rem: 'Canonical REM',
  disputed_alternative: 'Disputed alternative',
  external_academic: 'External academic',
  historical_record: 'Historical record',
  literary_artistic: 'Literary & artistic',
  supporting_context: 'Supporting context',
}

export const GraphSidePanel = () => {
  const activeNodeId = useGraphStore((state) => state.activeNodeId)
  const setActiveNodeId = useGraphStore((state) => state.setActiveNodeId)

  const { data: entities = [] } = useQuery({
    queryKey: ['entities', 'published'],
    queryFn: () => getPublishedEntities(),
    staleTime: 60_000,
  })

  const { data: relationships = [] } = useQuery({
    queryKey: ['relationships', 'published'],
    queryFn: getAllPublishedRelationships,
    staleTime: 60_000,
  })

  const activeEntityRow = entities.find((entity) => entity.id === activeNodeId)

  const { data: preview } = useQuery({
    queryKey: ['entity', activeNodeId, 'preview-claims'],
    queryFn: () => getEntityPreviewWithClaims(activeNodeId ?? ''),
    enabled: activeNodeId !== null && activeEntityRow !== undefined,
    staleTime: 60_000,
  })
  const entity = preview?.entity ?? activeEntityRow
  const previewClaims = preview?.previewClaims ?? []

  const topConnections = useMemo(() => {
    if (!activeNodeId) {
      return []
    }

    const entityById = new Map(
      entities.map((connectedEntity) => [connectedEntity.id, connectedEntity])
    )

    return relationships
      .filter(
        (relationship) =>
          relationship.from_entity_id === activeNodeId || relationship.to_entity_id === activeNodeId
      )
      .sort((first, second) => second.weight - first.weight)
      .slice(0, 3)
      .flatMap((relationship) => {
        const connectedId =
          relationship.from_entity_id === activeNodeId
            ? relationship.to_entity_id
            : relationship.from_entity_id
        const connectedEntity = entityById.get(connectedId)

        if (!connectedEntity) {
          return []
        }

        return [
          {
            entity: connectedEntity,
            relationshipLabel: relationship.type.replace(/_/g, ' '),
          },
        ]
      })
  }, [activeNodeId, entities, relationships])

  const sourceCount = useMemo(() => {
    if (!activeNodeId) {
      return 0
    }

    const claimIds = new Set(
      relationships
        .filter(
          (relationship) =>
            relationship.from_entity_id === activeNodeId ||
            relationship.to_entity_id === activeNodeId
        )
        .flatMap((relationship) => relationship.claim_ids)
    )

    return claimIds.size
  }, [activeNodeId, relationships])

  return (
    <Sheet open={activeNodeId !== null} onOpenChange={(open) => !open && setActiveNodeId(null)}>
      <SheetContent className="w-[min(88vw,320px)] border-l-0.5 border-black/10 p-5 shadow-none">
        {entity ? (
          <div className="flex h-full flex-col gap-5">
            <SheetHeader>
              <div className="mb-2 flex items-center gap-3">
                {entity.image_url ? (
                  <img
                    alt=""
                    className="h-12 w-12 rounded border-0.5 border-black/10 object-cover"
                    src={entity.image_url}
                  />
                ) : null}
                <EntityBadge type={entity.type} />
              </div>
              <SheetTitle className="pr-8 font-display text-[24px] uppercase leading-tight tracking-normal">
                {entity.name}
              </SheetTitle>
            </SheetHeader>

            <AttestationBar
              score={entity.confidence_override ?? entity.confidence_score}
              sourceCount={sourceCount}
            />

            <p className="font-body text-[13px] leading-reading text-ink/75">
              {entity.description ?? 'No summary has been published for this entity yet.'}
            </p>

            {previewClaims.length > 0 ? (
              <div className="flex flex-col gap-2">
                <p className="font-display text-[8px] uppercase tracking-label text-ink/45">
                  Key interpretations
                </p>
                <div className="grid gap-2">
                  {previewClaims.map((claim) => (
                    <Link
                      key={claim.id}
                      className="rounded border border-0.5 border-black/[0.09] bg-white p-3 hover:bg-stone/60"
                      to={`/claim/${claim.id}`}
                    >
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {claim.is_canonical ? (
                          <span className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-display text-[7px] uppercase tracking-badge text-amber-800">
                            Canonical
                          </span>
                        ) : null}
                        {claim.interpretation_frame ? (
                          <span className="rounded border border-black/10 bg-stone px-1.5 py-0.5 font-display text-[7px] uppercase tracking-badge text-[#666]">
                            {frameLabels[claim.interpretation_frame]}
                          </span>
                        ) : null}
                      </div>
                      <p className="font-body text-[12px] leading-meta text-ink">
                        {truncateText(claim.statement, 120)}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <p className="font-display text-[8px] uppercase tracking-label text-ink/45">
                Connections
              </p>
              <div className="flex flex-wrap gap-2">
                {topConnections.length > 0 ? (
                  topConnections.map(({ entity: connectedEntity, relationshipLabel }) => (
                    <EntityChip
                      key={connectedEntity.id}
                      name={connectedEntity.name}
                      relationshipLabel={relationshipLabel}
                      slug={connectedEntity.slug}
                      type={connectedEntity.type}
                    />
                  ))
                ) : (
                  <p className="font-body text-[12px] italic text-[#888]">
                    No connections documented yet.
                  </p>
                )}
              </div>
            </div>

            <Link
              to={`/entity/${entity.slug}`}
              className="mt-auto inline-flex items-center gap-2 border-t-0.5 border-black/10 pt-4 font-body text-[12px] text-verdigris hover:text-verdigris-dark"
            >
              View full entry
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <p className="font-body text-sm text-[#888]">Select a node to inspect its entry.</p>
        )}
      </SheetContent>
    </Sheet>
  )
}

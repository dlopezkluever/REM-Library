import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MarkdownProse } from '@/components/content/MarkdownProse'
import { AttestationBar } from '@/components/entity/AttestationBar'
import { ConfidenceBadge } from '@/components/entity/ConfidenceBadge'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { EntityChip } from '@/components/entity/EntityChip'
import { MiniGraph } from '@/components/entity/MiniGraph'
import { SourceAnchorRow } from '@/components/source/SourceAnchorRow'
import { Skeleton } from '@/components/ui/skeleton'
import { CompareButton } from '@/components/compare/CompareButton'
import { ExportDialog } from '@/components/export/ExportDialog'
import { CopyLinkButton } from '@/components/common/CopyLinkButton'
import { buildEntityExport } from '@/lib/export'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import { getClaimsForEntity } from '@/lib/api/claims'
import { getEntityBySlug, getEntityNeighborhood } from '@/lib/api/entities'
import { getSourceEvidenceForClaims } from '@/lib/api/sources'
import { truncateText } from '@/lib/format'
import type { ClaimWithAuthor } from '@/lib/api/claims'
import type { InterpretationFrame } from '@/types/domain'

const relationshipLabel = (type: string) => type.replace(/_/g, ' ')

const frameLabels: Record<InterpretationFrame, string> = {
  canonical_rem: 'Canonical REM',
  disputed_alternative: 'Disputed alternative',
  external_academic: 'External academic',
  historical_record: 'Historical record',
  literary_artistic: 'Literary & artistic',
  supporting_context: 'Supporting context',
}

const getEffectiveConfidence = (claim: ClaimWithAuthor) =>
  claim.confidence_override ?? claim.confidence_score

const claimSort = (firstClaim: ClaimWithAuthor, secondClaim: ClaimWithAuthor) => {
  if (firstClaim.is_canonical !== secondClaim.is_canonical) {
    return firstClaim.is_canonical ? -1 : 1
  }

  return getEffectiveConfidence(secondClaim) - getEffectiveConfidence(firstClaim)
}

const ClaimSection = ({
  claims,
  disputed = false,
  heroFirst = false,
  title,
}: {
  claims: ClaimWithAuthor[]
  disputed?: boolean
  heroFirst?: boolean
  title: string
}) => {
  if (claims.length === 0) {
    return null
  }

  return (
    <section className="space-y-3">
      <div>
        <h3 className="font-display text-[10px] uppercase tracking-label text-ink">{title}</h3>
        {disputed ? (
          <p className="mt-1 font-body text-xs text-terracotta-dark">
            These readings are marked as disputed by curators.
          </p>
        ) : null}
      </div>
      <div className="overflow-hidden rounded-lg border-0.5 border-black/10 bg-white">
        {claims.map((claim, index) => {
          const hero = heroFirst && index === 0 && claim.is_canonical

          return (
            <Link
              key={claim.id}
              to={`/claim/${claim.id}`}
              className={`block border-b-0.5 border-black/[0.06] p-4 transition-colors last:border-b-0 hover:bg-stone/60 ${
                hero ? 'border-l-4 border-l-verdigris bg-verdigris-light/40' : ''
              }`}
            >
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {claim.is_canonical ? (
                      <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-display text-[8px] uppercase tracking-badge text-amber-800">
                        Canonical
                      </span>
                    ) : null}
                    {claim.interpretation_frame ? (
                      <span className="rounded border border-black/10 bg-stone px-2 py-0.5 font-display text-[8px] uppercase tracking-badge text-[#666]">
                        {frameLabels[claim.interpretation_frame]}
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`font-body leading-meta text-ink ${
                      hero ? 'text-[15px]' : 'text-[13px]'
                    }`}
                  >
                    {truncateText(claim.statement, hero ? 260 : 180)}
                  </p>
                  <p className="mt-1 font-body text-[11px] italic text-[#777]">
                    {claim.profiles?.display_name ?? 'Unknown researcher'}
                  </p>
                </div>
                <ConfidenceBadge score={getEffectiveConfidence(claim)} />
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default function EntityDetailPage() {
  const { slug } = useParams()

  const entityQuery = useQuery({
    queryKey: ['entity', slug],
    queryFn: () => getEntityBySlug(slug ?? ''),
    enabled: Boolean(slug),
    staleTime: 60_000,
  })

  const neighborhoodQuery = useQuery({
    queryKey: ['entity', entityQuery.data?.id, 'neighborhood'],
    queryFn: () => getEntityNeighborhood(entityQuery.data?.id ?? '', 1),
    enabled: Boolean(entityQuery.data?.id),
    staleTime: 60_000,
  })

  const claimsQuery = useQuery({
    queryKey: ['entity', entityQuery.data?.id, 'claims'],
    queryFn: () => getClaimsForEntity(entityQuery.data?.id ?? '', { includeDisputed: true }),
    enabled: Boolean(entityQuery.data?.id),
    staleTime: 60_000,
  })

  const evidenceQuery = useQuery({
    queryKey: ['entity', entityQuery.data?.id, 'source-evidence'],
    queryFn: () => {
      const claims = claimsQuery.data

      return getSourceEvidenceForClaims([
        ...(claims?.publishedClaims ?? []).map((claim) => claim.id),
        ...(claims?.disputedClaims ?? []).map((claim) => claim.id),
      ])
    },
    enabled: Boolean(claimsQuery.data),
    staleTime: 60_000,
  })

  if (entityQuery.isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,720px)_174px]">
        <div>
          <Skeleton className="mb-3 h-8 w-64" />
          <Skeleton className="mb-6 h-4 w-96 max-w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  if (entityQuery.isError || !entityQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-12">
        <h1 className="font-display text-[24px] text-ink">Entity Not Found</h1>
        <p className="mt-3 font-body text-[13px] text-[#666]">
          This entity does not exist or has not been published yet.
        </p>
        <Link className="mt-5 inline-block font-body text-[12px] text-verdigris" to="/encyclopedia">
          Back to encyclopedia
        </Link>
      </div>
    )
  }

  const entity = entityQuery.data
  const confidence = entity.confidence_override ?? entity.confidence_score
  const evidence = evidenceQuery.data ?? []
  const sourceCount = new Set(evidence.map((item) => item.source.id)).size
  const connectedEntities = (neighborhoodQuery.data?.entities ?? []).filter(
    (connectedEntity) => connectedEntity.id !== entity.id
  )
  const relationships = neighborhoodQuery.data?.relationships ?? []
  const publishedClaims = claimsQuery.data?.publishedClaims ?? []
  const disputedClaims = claimsQuery.data?.disputedClaims ?? []
  const coreClaims = publishedClaims
    .filter((claim) => claim.is_canonical || claim.interpretation_frame === 'canonical_rem')
    .sort(claimSort)
  const coreClaimIds = new Set(coreClaims.map((claim) => claim.id))
  const claimsByFrame = (frame: InterpretationFrame) =>
    publishedClaims
      .filter((claim) => !coreClaimIds.has(claim.id) && claim.interpretation_frame === frame)
      .sort(claimSort)
  const otherClaims = publishedClaims
    .filter((claim) => !coreClaimIds.has(claim.id) && claim.interpretation_frame === null)
    .sort(claimSort)

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,720px)_174px]">
      <article>
        <nav className="mb-6 font-body text-[11px] text-[#777]">
          <Link className="hover:text-ink" to="/encyclopedia">
            Encyclopedia
          </Link>
          <span className="mx-2">/</span>
          <span>{ENTITY_LABELS[entity.type]}</span>
          <span className="mx-2">/</span>
          <span className="text-ink">{entity.name}</span>
        </nav>

        <header className="border-b-0.5 border-black/10 pb-6">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[28px] leading-tight text-ink">{entity.name}</h1>
            <EntityBadge type={entity.type} />
          </div>
          {entity.aliases.length > 0 ? (
            <p className="font-body text-[12px] italic text-[#666]">
              Also known as {entity.aliases.join(', ')}
            </p>
          ) : null}
          <div className="mt-5">
            <AttestationBar score={confidence} sourceCount={sourceCount} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <CompareButton slug={entity.slug} />
            <ExportDialog
              title="Export entity"
              buildExport={(options) =>
                buildEntityExport(
                  {
                    canonicalUrl: window.location.href,
                    entity,
                    connections: connectedEntities.map((connectedEntity) => {
                      const relationship = relationships.find(
                        (item) =>
                          (item.from_entity_id === entity.id &&
                            item.to_entity_id === connectedEntity.id) ||
                          (item.to_entity_id === entity.id &&
                            item.from_entity_id === connectedEntity.id)
                      )

                      return {
                        name: connectedEntity.name,
                        relationshipType: relationship?.type ?? null,
                      }
                    }),
                    evidence,
                  },
                  options
                )
              }
            />
            <CopyLinkButton />
          </div>
        </header>

        <section className="py-7">
          <MarkdownProse
            value={entity.description ?? 'No long-form description has been published yet.'}
          />
        </section>

        <section className="border-t-0.5 border-black/10 py-6">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Connected Entities
          </h2>
          {connectedEntities.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {connectedEntities.map((connectedEntity) => {
                const relationship = relationships.find(
                  (item) =>
                    (item.from_entity_id === entity.id &&
                      item.to_entity_id === connectedEntity.id) ||
                    (item.to_entity_id === entity.id && item.from_entity_id === connectedEntity.id)
                )

                return (
                  <EntityChip
                    key={connectedEntity.id}
                    name={connectedEntity.name}
                    relationshipLabel={
                      relationship ? relationshipLabel(relationship.type) : undefined
                    }
                    slug={connectedEntity.slug}
                    type={connectedEntity.type}
                  />
                )
              })}
            </div>
          ) : (
            <p className="font-body text-[12px] text-[#666]">
              No connections documented for this entity.
            </p>
          )}
        </section>

        <section className="border-t-0.5 border-black/10 py-6">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Claims
          </h2>
          {claimsQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {publishedClaims.length > 0 || disputedClaims.length > 0 ? (
            <div className="space-y-6">
              <ClaimSection claims={coreClaims} heroFirst title="Core Interpretation" />
              <ClaimSection
                claims={claimsByFrame('supporting_context')}
                title="Supporting Context"
              />
              <ClaimSection
                claims={claimsByFrame('external_academic')}
                title="External Academic Perspectives"
              />
              <ClaimSection claims={claimsByFrame('historical_record')} title="Historical Record" />
              <ClaimSection
                claims={claimsByFrame('literary_artistic')}
                title="Literary & Artistic"
              />
              <ClaimSection claims={otherClaims} title="Other Claims" />
              <ClaimSection claims={disputedClaims} disputed title="Disputed Readings" />
            </div>
          ) : null}
          {!claimsQuery.isLoading && publishedClaims.length === 0 && disputedClaims.length === 0 ? (
            <p className="font-body text-[12px] text-[#666]">
              No claims reference this entity yet.
            </p>
          ) : null}
        </section>

        <section className="border-t-0.5 border-black/10 py-6">
          <h2 className="mb-4 font-display text-[11px] uppercase tracking-label text-ink">
            Sources
          </h2>
          {evidenceQuery.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {evidence.length > 0 ? (
            <div className="grid gap-3">
              {evidence.map((item) => (
                <SourceAnchorRow key={`${item.claimId}-${item.anchor.id}`} evidence={item} />
              ))}
            </div>
          ) : null}
          {!evidenceQuery.isLoading && evidence.length === 0 ? (
            <p className="font-body text-[12px] text-[#666]">No sources linked yet.</p>
          ) : null}
        </section>
      </article>

      <aside className="hidden lg:block">
        <div className="sticky top-16">
          <h2 className="mb-3 font-display text-[9px] uppercase tracking-label text-[#777]">
            Neighborhood
          </h2>
          <MiniGraph entityId={entity.id} />
        </div>
      </aside>
    </div>
  )
}

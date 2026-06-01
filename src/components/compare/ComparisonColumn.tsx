import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { ComparisonEntity } from '@/lib/api/comparison'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { AttestationBar } from '@/components/entity/AttestationBar'
import { ConfidenceBadge } from '@/components/entity/ConfidenceBadge'
import { EntityChip } from '@/components/entity/EntityChip'
import { truncateText } from '@/lib/format'
import { cn } from '@/lib/utils'

interface ComparisonColumnProps {
  data: ComparisonEntity
  onRemove: () => void
  canRemove: boolean
  sharedEntityIds: Set<string>
}

export const ComparisonColumn = ({
  data,
  onRemove,
  canRemove,
  sharedEntityIds,
}: ComparisonColumnProps) => {
  const { entity, connections, sourceCount } = data
  const confidence = entity.confidence_override ?? entity.confidence_score

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border-0.5 border-black/10 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <Link
          to={`/entity/${entity.slug}`}
          className="font-display text-[20px] leading-tight text-ink hover:text-verdigris"
        >
          {entity.name}
        </Link>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${entity.name} from comparison`}
            className="shrink-0 rounded p-1 text-[#888] transition-colors hover:bg-black/[0.04] hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {entity.aliases.length > 0 ? (
        <p className="mt-1 font-body text-[11px] italic text-[#666]">{entity.aliases.join(', ')}</p>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        <EntityBadge type={entity.type} />
        <ConfidenceBadge score={confidence} />
      </div>

      <div className="mt-3">
        <AttestationBar score={confidence} sourceCount={sourceCount} />
      </div>

      <p className="mt-4 font-body text-[13px] leading-reading text-ink">
        {entity.description ? (
          truncateText(entity.description, 280)
        ) : (
          <span className="italic text-[#888]">No description available.</span>
        )}
      </p>

      <div className="mt-4">
        <h3 className="font-display text-[9px] uppercase tracking-label text-[#777]">
          Connections ({connections.length})
        </h3>
        {connections.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {connections.map((connection) => {
              const relationshipLabel = connection.relationshipType
                ? connection.relationshipType.replace(/_/g, ' ')
                : undefined
              return (
                <span
                  key={`${connection.relationshipType ?? 'rel'}-${connection.entity.id}`}
                  className={cn(
                    sharedEntityIds.has(connection.entity.id) &&
                      'rounded ring-1 ring-verdigris ring-offset-1'
                  )}
                >
                  <EntityChip
                    name={connection.entity.name}
                    slug={connection.entity.slug}
                    type={connection.entity.type}
                    relationshipLabel={relationshipLabel}
                  />
                </span>
              )
            })}
          </div>
        ) : (
          <p className="mt-2 font-body text-[12px] italic text-[#888]">No connections documented.</p>
        )}
      </div>
    </div>
  )
}

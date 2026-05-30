import { Link } from 'react-router-dom'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { ENTITY_COLORS } from '@/constants/entityTypes'
import { truncateText } from '@/lib/format'
import type { EntityRow } from '@/lib/api/entities'

interface EntityCardProps {
  entity: EntityRow
}

export const EntityCard = ({ entity }: EntityCardProps) => {
  const confidence = entity.confidence_override ?? entity.confidence_score
  const colors = ENTITY_COLORS[entity.type]

  return (
    <Link
      to={`/entity/${entity.slug}`}
      className="group flex min-h-36 flex-col justify-between rounded-lg border-0.5 border-black/10 bg-white p-4 transition-colors hover:border-verdigris/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-[18px] leading-tight text-ink">{entity.name}</h2>
        <EntityBadge type={entity.type} />
      </div>
      <p className="mt-4 line-clamp-2 font-body text-[12px] italic leading-meta text-[#666]">
        {truncateText(entity.description, 118) || 'No description has been published yet.'}
      </p>
      <div className="mt-5 flex items-center gap-2 font-body text-[10px] text-[#777]">
        <span
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: colors.node,
            opacity: Math.max(0.45, confidence),
          }}
        />
        <span>{Math.round(confidence * 100)}% confidence</span>
      </div>
    </Link>
  )
}

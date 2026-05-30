import { Link } from 'react-router-dom'
import { ENTITY_COLORS } from '@/constants/entityTypes'
import { cn } from '@/lib/utils'
import type { EntityType } from '@/types/domain'

interface EntityChipProps {
  name: string
  slug: string
  type: EntityType
  relationshipLabel?: string
  className?: string
}

export const EntityChip = ({ name, slug, type, relationshipLabel, className }: EntityChipProps) => {
  const colors = ENTITY_COLORS[type]

  return (
    <Link
      to={`/entity/${slug}`}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded border border-black/10 bg-white px-2.5 py-1 font-body text-[11px] text-ink transition-colors hover:border-verdigris/60',
        className
      )}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: colors.node }}
      />
      <span className="truncate">{name}</span>
      {relationshipLabel ? (
        <span className="shrink-0 font-display text-[6.5px] uppercase tracking-badge text-[#888]">
          {relationshipLabel}
        </span>
      ) : null}
    </Link>
  )
}

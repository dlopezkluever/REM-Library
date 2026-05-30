import { ENTITY_COLORS, ENTITY_LABELS } from '@/constants/entityTypes'
import type { EntityType } from '@/types/domain'

interface EntityBadgeProps {
  type: EntityType
}

export const EntityBadge = ({ type }: EntityBadgeProps) => {
  const colors = ENTITY_COLORS[type]

  return (
    <span
      className="inline-flex items-center rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-badge"
      style={{
        backgroundColor: colors.badgeBg,
        borderColor: colors.badgeBorder,
        color: colors.badgeText,
      }}
    >
      {ENTITY_LABELS[type]}
    </span>
  )
}

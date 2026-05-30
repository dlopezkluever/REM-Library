import { cn } from '@/lib/utils'

interface ConfidenceBadgeProps {
  score: number
  className?: string
}

export const ConfidenceBadge = ({ className, score }: ConfidenceBadgeProps) => {
  const normalizedScore = Math.min(Math.max(score, 0), 1)
  const tone =
    normalizedScore >= 0.8
      ? 'border-verdigris/50 bg-verdigris-light text-verdigris-dark'
      : normalizedScore >= 0.5
        ? 'border-tan/50 bg-tan-light text-tan-dark'
        : 'border-black/15 bg-white text-[#666]'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded border px-2 py-0.5 font-display text-[9px] uppercase tracking-badge',
        tone,
        className
      )}
    >
      {Math.round(normalizedScore * 100)}%
    </span>
  )
}

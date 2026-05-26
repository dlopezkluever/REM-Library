import { cn } from '@/lib/utils'

interface AttestationBarProps {
  score: number
  sourceCount: number
}

export const AttestationBar = ({ score, sourceCount }: AttestationBarProps) => {
  const normalizedScore = Math.min(Math.max(score, 0), 1)
  const filledSegments = Math.round(normalizedScore * 5)

  return (
    <div className="flex w-full max-w-52 flex-col gap-1.5">
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 5 }, (_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 rounded-full border border-verdigris/40',
              index < filledSegments ? 'bg-verdigris' : 'bg-transparent'
            )}
          />
        ))}
      </div>
      <p className="font-body text-[11px] text-[#666]">
        {filledSegments} of 5 &middot; {sourceCount} {sourceCount === 1 ? 'source' : 'sources'}
      </p>
    </div>
  )
}

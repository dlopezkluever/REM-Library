/* eslint-disable react-refresh/only-export-components */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-badge',
  {
    variants: {
      variant: {
        default: 'border-verdigris bg-verdigris-light text-verdigris-dark',
        outline: 'border-black/15 bg-transparent text-ink',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { badgeVariants }

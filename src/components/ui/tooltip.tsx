/* eslint-disable react-refresh/only-export-components */
import type * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

export const TooltipProvider = TooltipPrimitive.Provider
export const Tooltip = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = ({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) => {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded border border-white/10 bg-charcoal px-2 py-1 font-body text-xs text-stone shadow-md',
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

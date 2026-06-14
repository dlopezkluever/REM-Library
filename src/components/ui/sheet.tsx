/* eslint-disable react-refresh/only-export-components */
import type * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

export const SheetContent = ({
  className,
  children,
  side = 'right',
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: 'left' | 'right'
}) => {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-charcoal/60 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'fixed top-0 z-50 h-full w-[min(88vw,420px)] border-black/10 bg-stone p-6 text-ink shadow-xl',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded text-[#888] hover:text-ink">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return <div className={cn('flex flex-col gap-1.5', className)} {...props} />
}

export const SheetTitle = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) => {
  return (
    <DialogPrimitive.Title
      className={cn('font-display text-xl leading-none text-ink', className)}
      {...props}
    />
  )
}

export const SheetDescription = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) => {
  return (
    <DialogPrimitive.Description
      className={cn('font-body text-sm text-[#666]', className)}
      {...props}
    />
  )
}

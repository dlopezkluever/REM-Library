import { useEffect } from 'react'
import { useToastStore, type Toast } from '@/stores/toastStore'
import { cn } from '@/lib/utils'

const DISMISS_MS = 2400

export const Toaster = () => {
  const toasts = useToastStore((state) => state.toasts)

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

const ToastItem = ({ toast }: { toast: Toast }) => {
  const removeToast = useToastStore((state) => state.removeToast)

  useEffect(() => {
    const timer = window.setTimeout(() => removeToast(toast.id), DISMISS_MS)
    return () => window.clearTimeout(timer)
  }, [toast.id, removeToast])

  return (
    <button
      type="button"
      onClick={() => removeToast(toast.id)}
      className={cn(
        'pointer-events-auto rounded border-0.5 px-4 py-2 font-body text-[12px] shadow-lg transition-opacity',
        toast.variant === 'error'
          ? 'border-terracotta/40 bg-terracotta-light text-terracotta-dark'
          : 'border-verdigris/40 bg-verdigris-light text-verdigris-dark'
      )}
    >
      {toast.message}
    </button>
  )
}

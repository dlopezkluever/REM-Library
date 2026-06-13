import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const formatOverrideValue = (value: number | null) => (value === null ? '' : value.toFixed(2))

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Override could not be saved.'
}

interface ConfidenceOverrideInputProps {
  computedScore: number
  disabled?: boolean
  label: string
  onSave: (override: number | null) => Promise<unknown>
  override: number | null
}

export const ConfidenceOverrideInput = ({
  computedScore,
  disabled = false,
  label,
  onSave,
  override,
}: ConfidenceOverrideInputProps) => {
  const [inputValue, setInputValue] = useState(formatOverrideValue(override))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const handleBlur = async () => {
    const trimmedValue = inputValue.trim()
    const nextOverride = trimmedValue === '' ? null : Number(trimmedValue)

    if (
      nextOverride !== null &&
      (!Number.isFinite(nextOverride) || nextOverride < 0 || nextOverride > 1)
    ) {
      setStatus('error')
      setMessage('Use a value from 0.00 to 1.00.')
      return
    }

    if (nextOverride === override) {
      setInputValue(formatOverrideValue(override))
      setStatus('idle')
      setMessage(null)
      return
    }

    setStatus('saving')
    setMessage(null)

    try {
      await onSave(nextOverride)
      setInputValue(formatOverrideValue(nextOverride))
      setStatus('saved')
      setMessage('Saved')
    } catch (error) {
      setStatus('error')
      setMessage(getErrorMessage(error))
    }
  }

  return (
    <div className="w-32 space-y-1">
      <Input
        aria-label={`Override confidence for ${label}`}
        className={cn(
          'h-8 px-2 text-xs',
          override !== null && 'border-amber-300 bg-amber-50 text-amber-900'
        )}
        disabled={disabled || status === 'saving'}
        inputMode="decimal"
        placeholder={`${computedScore.toFixed(2)} (auto)`}
        value={inputValue}
        onBlur={() => void handleBlur()}
        onChange={(event) => {
          setInputValue(event.target.value)
          setStatus('idle')
          setMessage(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />
      <p
        className={cn(
          'min-h-4 font-body text-[11px]',
          status === 'error' ? 'text-terracotta-dark' : 'text-[#777]',
          status === 'saved' && 'text-verdigris-dark'
        )}
      >
        {status === 'saving'
          ? 'Saving...'
          : (message ?? (override !== null ? `auto ${computedScore.toFixed(2)}` : ''))}
      </p>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { MarkdownProse } from '@/components/content/MarkdownProse'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ExplorationStepRow } from '@/lib/api/explorations'

interface ExplorationPlayerProps {
  title: string
  steps: ExplorationStepRow[]
  onExit?: () => void
}

const noop = () => undefined

export const ExplorationPlayer = ({ title, steps, onExit }: ExplorationPlayerProps) => {
  const [stepIndex, setStepIndex] = useState(0)

  const total = steps.length
  const safeIndex = Math.min(stepIndex, Math.max(total - 1, 0))
  const currentStep = steps[safeIndex]

  const goPrevious = useCallback(() => {
    setStepIndex((current) => Math.max(current - 1, 0))
  }, [])

  const goNext = useCallback(() => {
    setStepIndex((current) => Math.min(current + 1, Math.max(total - 1, 0)))
  }, [total])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        goPrevious()
      } else if (event.key === 'ArrowRight') {
        goNext()
      } else if (event.key === 'Escape' && onExit) {
        onExit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [goNext, goPrevious, onExit])

  return (
    <div className="relative h-full w-full overflow-hidden bg-canvas">
      <GraphCanvas
        focusedNodeId={null}
        highlightNodeIds={currentStep?.focus_entity_ids ?? []}
        onFocusBlocked={noop}
        onFocusedNodeSettled={noop}
      />

      <div className="pointer-events-none absolute inset-0 z-30 flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4">
          <p className="pointer-events-auto rounded border-0.5 border-white/10 bg-charcoal/80 px-3 py-1.5 font-display text-[10px] uppercase tracking-label text-white/70 backdrop-blur-md">
            {title}
          </p>
          {onExit ? (
            <button
              aria-label="Exit exploration"
              className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded border-0.5 border-white/10 bg-charcoal/80 text-white/70 backdrop-blur-md transition-colors hover:text-white"
              type="button"
              onClick={onExit}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="mt-auto flex justify-center p-4">
          {total === 0 ? (
            <Card className="pointer-events-auto w-[min(92vw,560px)] border-white/10 bg-stone/95 backdrop-blur-md">
              <CardContent className="p-5">
                <p className="font-body text-sm italic text-[#777]">
                  This exploration has no steps yet.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="pointer-events-auto w-[min(92vw,560px)] border-white/10 bg-stone/95 shadow-xl backdrop-blur-md">
              <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
                <CardTitle className="text-[15px]">
                  Step {safeIndex + 1} of {total}
                </CardTitle>
                <div className="flex items-center gap-1.5">
                  {steps.map((step, index) => (
                    <span
                      key={step.id}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full transition-colors',
                        index === safeIndex ? 'bg-verdigris' : 'bg-black/15'
                      )}
                    />
                  ))}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <MarkdownProse
                  className="max-h-[34vh] overflow-auto"
                  value={currentStep?.prose_text ?? ''}
                />
                <div className="flex items-center justify-between gap-3 border-t-0.5 border-black/10 pt-3">
                  <button
                    className="inline-flex items-center gap-1.5 font-body text-[12px] text-ink/70 transition-colors hover:text-ink disabled:opacity-35"
                    disabled={safeIndex === 0}
                    type="button"
                    onClick={goPrevious}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 font-body text-[12px] text-verdigris transition-colors hover:text-verdigris-dark disabled:opacity-35"
                    disabled={safeIndex >= total - 1}
                    type="button"
                    onClick={goNext}
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

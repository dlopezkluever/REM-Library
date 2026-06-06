import { useMemo, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { toast } from '@/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/clipboard'
import type { ExportFormat, ExportOptions } from '@/lib/export'
import type { CitationStyle } from '@/lib/citations'
import { cn } from '@/lib/utils'

interface ExportDialogProps {
  title: string
  buildExport: (options: ExportOptions) => string
  triggerLabel?: string
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: 'markdown', label: 'Markdown' },
  { value: 'plain', label: 'Plain text' },
]

const CITATION_OPTIONS: { value: CitationStyle; label: string }[] = [
  { value: 'informal', label: 'Informal (Mythograph)' },
  { value: 'chicago', label: 'Chicago-style' },
]

export const ExportDialog = ({ title, buildExport, triggerLabel = 'Export' }: ExportDialogProps) => {
  const [open, setOpen] = useState(false)
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('informal')

  const output = useMemo(
    () => buildExport({ format, citationStyle }),
    [buildExport, format, citationStyle]
  )

  const handleCopy = async () => {
    const copied = await copyToClipboard(output)
    if (copied) {
      toast.success('Copied to clipboard')
      setOpen(false)
    } else {
      toast.error('Could not copy to clipboard')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-3.5 w-3.5" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[min(92vw,640px)]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Choose a format and citation style, then copy the result to your clipboard.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <OptionGroup legend="Format" options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
          <OptionGroup
            legend="Citation style"
            options={CITATION_OPTIONS}
            value={citationStyle}
            onChange={setCitationStyle}
          />

          <div>
            <span className="font-display text-[9px] uppercase tracking-label text-[#777]">
              Preview
            </span>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded border-0.5 border-black/10 bg-white p-3 font-body text-[11px] leading-meta text-ink">
              {output}
            </pre>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={handleCopy}>
            <Copy className="h-3.5 w-3.5" />
            Copy to clipboard
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface OptionGroupProps<T extends string> {
  legend: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}

const OptionGroup = <T extends string>({ legend, options, value, onChange }: OptionGroupProps<T>) => {
  return (
    <div>
      <span className="font-display text-[9px] uppercase tracking-label text-[#777]">{legend}</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded border-0.5 px-3 py-1.5 font-body text-[12px] transition-colors',
              value === option.value
                ? 'border-verdigris bg-verdigris-light text-verdigris-dark'
                : 'border-black/15 bg-white text-[#666] hover:border-verdigris/60'
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

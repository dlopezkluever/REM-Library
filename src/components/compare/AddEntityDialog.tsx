import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { EntityBadge } from '@/components/entity/EntityBadge'
import { useEntitySearch } from '@/hooks/useEntitySearch'

interface AddEntityDialogProps {
  onSelect: (slug: string) => void
  excludeSlugs: string[]
  disabled?: boolean
}

export const AddEntityDialog = ({ onSelect, excludeSlugs, disabled }: AddEntityDialogProps) => {
  const [open, setOpen] = useState(false)
  const { query, setQuery, results, isLoading } = useEntitySearch()
  const hasQuery = query.trim().length > 0

  const handleSelect = (slug: string) => {
    onSelect(slug)
    setQuery('')
    setOpen(false)
  }

  const visibleResults = results.filter((result) => !excludeSlugs.includes(result.slug))

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Plus className="h-3.5 w-3.5" />
          Add entity to compare
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add entity to compare</DialogTitle>
          <DialogDescription>
            Search for a symbol, figure, narrative, culture, or trope.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#888]" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search entities..."
            className="pl-9"
          />
        </div>

        <div className="mt-3 max-h-72 overflow-auto">
          {!hasQuery ? (
            <p className="px-1 py-3 font-body text-[12px] text-[#888]">
              Type to search for an entity.
            </p>
          ) : isLoading ? (
            <p className="px-1 py-3 font-body text-[12px] text-[#888]">Searching...</p>
          ) : visibleResults.length === 0 ? (
            <p className="px-1 py-3 font-body text-[12px] text-[#888]">No matching entities.</p>
          ) : (
            <ul className="space-y-1">
              {visibleResults.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(result.slug)}
                    className="flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left transition-colors hover:bg-black/[0.04]"
                  >
                    <span className="font-body text-[13px] text-ink">{result.name}</span>
                    <EntityBadge type={result.type} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

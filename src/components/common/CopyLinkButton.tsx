import { Link2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { copyToClipboard } from '@/lib/clipboard'

interface CopyLinkButtonProps {
  url?: string
  label?: string
  className?: string
}

export function CopyLinkButton({ url, label = 'Copy link', className }: CopyLinkButtonProps) {
  const handleCopy = async () => {
    const href = url ?? window.location.href
    const copied = await copyToClipboard(href)
    if (copied) toast.success('Link copied')
    else toast.error('Could not copy link')
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className={className}>
      <Link2 className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}

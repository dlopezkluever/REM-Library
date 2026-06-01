import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { appendCompareSlug, buildCompareSearch } from '@/lib/comparison'
import { useUiStore } from '@/stores/uiStore'

interface CompareButtonProps {
  slug: string
}

export const CompareButton = ({ slug }: CompareButtonProps) => {
  const navigate = useNavigate()
  const comparisonSlugs = useUiStore((state) => state.comparisonSlugs)

  const handleClick = () => {
    const slugs = comparisonSlugs.length > 0 ? appendCompareSlug(comparisonSlugs, slug) : [slug]
    navigate(`${ROUTES.COMPARE}${buildCompareSearch(slugs)}`)
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick}>
      <ArrowLeftRight className="h-3.5 w-3.5" />
      Compare
    </Button>
  )
}

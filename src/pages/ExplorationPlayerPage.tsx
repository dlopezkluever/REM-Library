import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExplorationPlayer } from '@/components/graph/ExplorationPlayer'
import { ROUTES } from '@/constants/routes'
import { getExplorationById } from '@/lib/api/explorations'

export default function ExplorationPlayerPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const explorationQuery = useQuery({
    queryKey: ['exploration', id],
    queryFn: () => getExplorationById(id ?? ''),
    enabled: Boolean(id),
    staleTime: 60_000,
  })

  const exitToList = () => navigate(ROUTES.EXPLORATIONS)

  if (explorationQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <p className="font-display text-[10px] uppercase tracking-label text-white/45">
          Loading exploration
        </p>
      </div>
    )
  }

  if (explorationQuery.isError || !explorationQuery.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas">
        <p className="font-body text-sm text-white/55">This exploration could not be found.</p>
        <button
          className="font-body text-[12px] text-verdigris-light hover:text-white"
          type="button"
          onClick={exitToList}
        >
          Back to explorations
        </button>
      </div>
    )
  }

  const { exploration, steps } = explorationQuery.data

  return <ExplorationPlayer title={exploration.title} steps={steps} onExit={exitToList} />
}

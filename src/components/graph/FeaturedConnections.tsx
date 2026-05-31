import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Compass } from 'lucide-react'
import { ROUTES } from '@/constants/routes'
import { getFeaturedConnections } from '@/lib/api/featuredConnections'

export const FeaturedConnections = () => {
  const { data: featuredConnections = [] } = useQuery({
    queryKey: ['featured-connections'],
    queryFn: getFeaturedConnections,
    staleTime: 60_000,
  })

  return (
    <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-20 flex flex-col gap-2">
      {featuredConnections.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-3">
          {featuredConnections.map((connection) => (
            <article
              key={connection.id}
              className="rounded border-0.5 px-2.5 py-2 backdrop-blur-sm"
              style={{
                backgroundColor: `${connection.entity_color}1A`,
                borderColor: `${connection.entity_color}42`,
              }}
            >
              <h2
                className="mb-1 font-display text-[8px] uppercase tracking-badge"
                style={{ color: connection.entity_color }}
              >
                {connection.title}
              </h2>
              <p className="line-clamp-2 font-body text-[10px] leading-meta text-white/45">
                {connection.description}
              </p>
            </article>
          ))}
        </div>
      ) : null}

      <Link
        to={ROUTES.EXPLORATIONS}
        className="inline-flex w-fit items-center gap-1.5 rounded border-0.5 border-white/10 bg-charcoal/70 px-3 py-1.5 font-display text-[9px] uppercase tracking-label text-white/60 backdrop-blur-sm transition-colors hover:text-white"
      >
        <Compass className="h-3 w-3" />
        Follow a guided exploration
      </Link>
    </div>
  )
}

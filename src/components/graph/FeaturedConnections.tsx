import { useQuery } from '@tanstack/react-query'
import { getFeaturedConnections } from '@/lib/api/featuredConnections'

export const FeaturedConnections = () => {
  const { data: featuredConnections = [] } = useQuery({
    queryKey: ['featured-connections'],
    queryFn: getFeaturedConnections,
    staleTime: 60_000,
  })

  if (featuredConnections.length === 0) {
    return null
  }

  return (
    <div className="pointer-events-auto absolute inset-x-4 bottom-4 z-20 grid gap-2 md:grid-cols-3">
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
  )
}

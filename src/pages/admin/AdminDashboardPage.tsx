import { useQuery } from '@tanstack/react-query'
import { PipelineMonitor } from '@/components/admin/PipelineMonitor'
import { getAdminContentStats, getAdminDashboardCounts } from '@/lib/api/admin'
import { cn } from '@/lib/utils'

const numberFormatter = new Intl.NumberFormat('en-US')

const statCards = [
  { key: 'publishedEntities', label: 'Published Entities' },
  { key: 'publishedClaims', label: 'Published Claims' },
  { key: 'totalSources', label: 'Total Sources' },
  { key: 'pendingReview', label: 'Pending Review' },
] as const

const entityTypeLabels = {
  symbol: 'Symbols',
  figure: 'Figures',
  narrative: 'Narratives',
  culture: 'Cultures',
  trope: 'Tropes',
}

const entityTypeColors = {
  symbol: '#4A7C6F',
  figure: '#A0522D',
  narrative: '#8B7355',
  culture: '#8A5A9A',
  trope: '#6B5FA0',
}

interface StatPanelProps {
  children: React.ReactNode
  className?: string
  title: string
}

const StatPanel = ({ children, className, title }: StatPanelProps) => {
  return (
    <section
      className={cn('rounded border border-0.5 border-black/[0.09] bg-white p-5', className)}
    >
      <h2 className="mb-4 font-display text-[10px] uppercase tracking-label text-[#777]">
        {title}
      </h2>
      {children}
    </section>
  )
}

interface BarChartDatum {
  color?: string
  label: string
  value: number
}

interface BarChartProps {
  data: BarChartDatum[]
  title: string
}

const BarChart = ({ data, title }: BarChartProps) => {
  const maxValue = Math.max(...data.map((item) => item.value), 1)
  const width = 360
  const rowHeight = 34
  const labelWidth = 92
  const chartWidth = width - labelWidth - 48
  const height = data.length * rowHeight

  return (
    <svg
      aria-labelledby={`${title}-title ${title}-desc`}
      className="h-auto w-full"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <title id={`${title}-title`}>{title}</title>
      <desc id={`${title}-desc`}>Horizontal bar chart showing counts for {title}.</desc>
      {data.map((item, index) => {
        const y = index * rowHeight + 7
        const barWidth = Math.max((item.value / maxValue) * chartWidth, item.value > 0 ? 3 : 0)

        return (
          <g key={item.label}>
            <text
              fill="#777"
              fontFamily="Lora, Georgia, serif"
              fontSize="11"
              textAnchor="end"
              x={labelWidth - 10}
              y={y + 12}
            >
              {item.label}
            </text>
            <rect
              fill="rgba(0,0,0,0.06)"
              height="12"
              rx="2"
              width={chartWidth}
              x={labelWidth}
              y={y}
            />
            <rect
              fill={item.color ?? '#4A7C6F'}
              height="12"
              rx="2"
              width={barWidth}
              x={labelWidth}
              y={y}
            />
            <text
              fill="#1C1917"
              fontFamily="Lora, Georgia, serif"
              fontSize="11"
              x={labelWidth + chartWidth + 10}
              y={y + 12}
            >
              {item.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function AdminDashboardPage() {
  const countsQuery = useQuery({
    queryKey: ['admin', 'dashboard-counts'],
    queryFn: getAdminDashboardCounts,
  })

  const contentStatsQuery = useQuery({
    queryKey: ['admin', 'content-stats'],
    queryFn: getAdminContentStats,
  })

  const counts = countsQuery.data
  const contentStats = contentStatsQuery.data

  const entitiesByType =
    contentStats?.entitiesByType.map((item) => ({
      label: entityTypeLabels[item.type],
      value: item.count,
      color: entityTypeColors[item.type],
    })) ?? []

  const confidenceDistribution =
    contentStats?.confidenceDistribution.map((item) => ({
      label: item.label,
      value: item.count,
      color: '#4A7C6F',
    })) ?? []

  const draftStatus = contentStats?.statusCounts.find((item) => item.status === 'draft')
  const publishedStatus = contentStats?.statusCounts.find((item) => item.status === 'published')
  const draftPublishedCounts = [
    {
      label: 'Draft',
      value: (draftStatus?.entities ?? 0) + (draftStatus?.claims ?? 0),
      color: '#6B5FA0',
    },
    {
      label: 'Published',
      value: (publishedStatus?.entities ?? 0) + (publishedStatus?.claims ?? 0),
      color: '#4A7C6F',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl uppercase text-ink">Dashboard</h1>
        <p className="mt-1 font-body text-sm text-[#777]">
          Pipeline status, review load, and graph publication health.
        </p>
      </div>

      {countsQuery.error ? (
        <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
          <p className="font-body text-sm text-terracotta-dark">Dashboard counts could not load.</p>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <div
            key={card.key}
            className="rounded border border-0.5 border-black/[0.09] bg-white p-5"
          >
            <p className="font-display text-[9px] uppercase tracking-label text-[#777]">
              {card.label}
            </p>
            <p className="mt-3 font-body text-3xl text-ink">
              {countsQuery.isLoading || !counts ? '...' : numberFormatter.format(counts[card.key])}
            </p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-sm uppercase tracking-label text-ink">
              Pipeline Monitor
            </h2>
            <p className="mt-1 font-body text-xs text-[#777]">
              Sources ordered by newest ingestion record, updated from Supabase Realtime.
            </p>
          </div>
        </div>
        <PipelineMonitor />
      </section>

      <section>
        <div className="mb-3">
          <h2 className="font-display text-sm uppercase tracking-label text-ink">Content Stats</h2>
        </div>

        {contentStatsQuery.error ? (
          <div className="rounded border border-0.5 border-terracotta/30 bg-terracotta-light p-4">
            <p className="font-body text-sm text-terracotta-dark">Content stats could not load.</p>
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            <StatPanel title="Entities By Type">
              {contentStatsQuery.isLoading ? (
                <p className="font-body text-sm text-[#777]">Loading chart...</p>
              ) : (
                <BarChart data={entitiesByType} title="entities-by-type" />
              )}
            </StatPanel>
            <StatPanel title="Confidence Distribution">
              {contentStatsQuery.isLoading ? (
                <p className="font-body text-sm text-[#777]">Loading chart...</p>
              ) : (
                <BarChart data={confidenceDistribution} title="confidence-distribution" />
              )}
            </StatPanel>
            <StatPanel title="Draft Vs Published">
              {contentStatsQuery.isLoading ? (
                <p className="font-body text-sm text-[#777]">Loading chart...</p>
              ) : (
                <BarChart data={draftPublishedCounts} title="draft-vs-published" />
              )}
            </StatPanel>
          </div>
        )}
      </section>
    </div>
  )
}

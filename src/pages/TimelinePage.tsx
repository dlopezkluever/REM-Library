import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import { GraphSidePanel } from '@/components/graph/GraphSidePanel'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ENTITY_COLORS } from '@/constants/entityTypes'
import {
  getPublishedCultureEntities,
  getTimelineEntities,
  type EntityRow,
} from '@/lib/api/entities'
import { getAllPublishedRelationships } from '@/lib/api/relationships'
import {
  computeTimelineDomain,
  formatTimelineYear,
  TIMELINE_ERAS,
  yearToX,
} from '@/lib/timeline/eras'
import { getPinchZoom, getPointerDistance } from '@/lib/timeline/pinchZoom'
import { cn } from '@/lib/utils'
import { useGraphStore } from '@/stores/graphStore'

type TimelineTypeFilter = 'all' | 'narrative' | 'figure'

const TIMELINE_HEIGHT = 460
const ERA_LABEL_HEIGHT = 56
const PLOT_TOP = ERA_LABEL_HEIGHT + 24
const PLOT_BOTTOM = TIMELINE_HEIGHT - 48
const LANE_COUNT = 6
const SIDE_PADDING = 32
const MIN_ZOOM = 1
const MAX_ZOOM = 8
const LABEL_ZOOM_THRESHOLD = 2
const HIGH_CONFIDENCE = 0.75

const typeTabs: Array<{ label: string; value: TimelineTypeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Narratives', value: 'narrative' },
  { label: 'Figures', value: 'figure' },
]

export default function TimelinePage() {
  const [typeFilter, setTypeFilter] = useState<TimelineTypeFilter>('all')
  const [selectedCultureIds, setSelectedCultureIds] = useState<string[]>([])
  const [cultureMenuOpen, setCultureMenuOpen] = useState(false)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [baseWidth, setBaseWidth] = useState(960)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)
  const activeNodeId = useGraphStore((state) => state.activeNodeId)
  const setActiveNodeId = useGraphStore((state) => state.setActiveNodeId)

  const entitiesQuery = useQuery({
    queryKey: ['timeline', 'entities'],
    queryFn: getTimelineEntities,
    staleTime: 60_000,
  })

  const culturesQuery = useQuery({
    queryKey: ['entities', 'published', 'cultures'],
    queryFn: getPublishedCultureEntities,
    staleTime: 60_000,
  })

  const relationshipsQuery = useQuery({
    queryKey: ['relationships', 'published'],
    queryFn: getAllPublishedRelationships,
    staleTime: 60_000,
  })

  // Clear the shared graph selection when leaving the timeline so the side
  // panel does not reopen on the graph page.
  useEffect(() => () => setActiveNodeId(null), [setActiveNodeId])

  // Track the available width so the timeline fills the viewport at zoom 1.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) {
      return undefined
    }

    const updateWidth = () => setBaseWidth(Math.max(node.clientWidth - SIDE_PADDING * 2, 480))
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  // Pinch-to-zoom (trackpad) arrives as a wheel event with ctrlKey set.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) {
      return undefined
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return
      }

      event.preventDefault()
      setZoom((current) => {
        const next = current * (event.deltaY < 0 ? 1.12 : 0.89)
        return Math.min(Math.max(next, MIN_ZOOM), MAX_ZOOM)
      })
    }

    node.addEventListener('wheel', handleWheel, { passive: false })

    return () => node.removeEventListener('wheel', handleWheel)
  }, [])

  const relatedToSelectedCulture = useMemo(() => {
    const related = new Set<string>()

    if (selectedCultureIds.length === 0) {
      return related
    }

    ;(relationshipsQuery.data ?? []).forEach((relationship) => {
      if (
        relationship.type === 'belongs_to' &&
        selectedCultureIds.includes(relationship.to_entity_id)
      ) {
        related.add(relationship.from_entity_id)
      }
    })

    return related
  }, [relationshipsQuery.data, selectedCultureIds])

  const filteredEntities = useMemo(() => {
    return (entitiesQuery.data ?? []).filter((entity) => {
      const passesType = typeFilter === 'all' || entity.type === typeFilter
      const passesCulture =
        selectedCultureIds.length === 0 || relatedToSelectedCulture.has(entity.id)

      return passesType && passesCulture
    })
  }, [entitiesQuery.data, relatedToSelectedCulture, selectedCultureIds, typeFilter])

  const domain = useMemo(
    () =>
      computeTimelineDomain(
        filteredEntities
          .map((entity) => entity.date_sort_year)
          .filter((year): year is number => year !== null)
      ),
    [filteredEntities]
  )

  const plotWidth = Math.round(baseWidth * zoom)
  const laneGap = (PLOT_BOTTOM - PLOT_TOP) / Math.max(LANE_COUNT - 1, 1)

  const handleDotClick = (entity: EntityRow) => {
    setActiveNodeId(entity.id)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !activePointersRef.current.has(event.pointerId)) {
      return
    }

    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const pointers = Array.from(activePointersRef.current.values())

    if (pointers.length < 2) {
      pinchRef.current = null
      return
    }

    event.preventDefault()
    const distance = getPointerDistance(pointers[0], pointers[1])

    if (!pinchRef.current) {
      pinchRef.current = { distance, zoom }
      return
    }

    setZoom(
      getPinchZoom({
        currentDistance: distance,
        maxZoom: MAX_ZOOM,
        minZoom: MIN_ZOOM,
        startDistance: pinchRef.current.distance,
        startZoom: pinchRef.current.zoom,
      })
    )
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId)
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null
    }
  }

  const cultures = culturesQuery.data ?? []
  const isLoading = entitiesQuery.isLoading

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl uppercase tracking-normal text-ink">Timeline</h1>
        <p className="mt-2 max-w-2xl font-body text-sm leading-reading text-[#666]">
          Narratives and figures plotted across the eras. Scroll horizontally to pan, and pinch or
          use the zoom controls to reveal more labels.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as TimelineTypeFilter)}
        >
          <TabsList>
            {typeTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              className="inline-flex items-center gap-2 rounded border-0.5 border-black/15 bg-white px-3 py-1.5 font-body text-[12px] text-ink hover:border-verdigris/50"
              type="button"
              onClick={() => setCultureMenuOpen((current) => !current)}
            >
              {selectedCultureIds.length > 0
                ? `${selectedCultureIds.length} culture${selectedCultureIds.length === 1 ? '' : 's'}`
                : 'All cultures'}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {cultureMenuOpen ? (
              <div className="absolute right-0 z-30 mt-1 max-h-64 w-60 overflow-auto rounded border-0.5 border-black/15 bg-white p-2 shadow-lg">
                {cultures.length > 0 ? (
                  cultures.map((culture) => (
                    <label
                      key={culture.id}
                      className="flex items-center justify-between gap-3 rounded px-2 py-1.5 font-body text-[12px] text-ink hover:bg-black/[0.03]"
                    >
                      {culture.name}
                      <input
                        checked={selectedCultureIds.includes(culture.id)}
                        className="h-4 w-4 accent-verdigris"
                        type="checkbox"
                        onChange={(event) =>
                          setSelectedCultureIds((current) =>
                            event.target.checked
                              ? [...current, culture.id]
                              : current.filter((id) => id !== culture.id)
                          )
                        }
                      />
                    </label>
                  ))
                ) : (
                  <p className="px-2 py-1.5 font-body text-[12px] italic text-[#888]">
                    No cultures published yet.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-1 rounded border-0.5 border-black/15 bg-white p-1">
            <button
              aria-label="Zoom out"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[#888] hover:bg-black/5 hover:text-ink disabled:opacity-30"
              disabled={zoom <= MIN_ZOOM}
              type="button"
              onClick={() => setZoom((current) => Math.max(current / 1.4, MIN_ZOOM))}
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center font-body text-[11px] text-[#777]">
              {Math.round(zoom * 100)}%
            </span>
            <button
              aria-label="Zoom in"
              className="inline-flex h-7 w-7 items-center justify-center rounded text-[#888] hover:bg-black/5 hover:text-ink disabled:opacity-30"
              disabled={zoom >= MAX_ZOOM}
              type="button"
              onClick={() => setZoom((current) => Math.min(current * 1.4, MAX_ZOOM))}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-lg border-0.5 border-black/10 bg-white px-8 py-4"
        style={{ touchAction: 'pan-x' }}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerLeave={handlePointerEnd}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        {isLoading ? (
          <div className="h-[460px] animate-pulse rounded bg-black/[0.03]" />
        ) : entitiesQuery.isError ? (
          <div className="flex h-[460px] items-center justify-center">
            <p className="font-body text-sm text-terracotta-dark">Could not load the timeline.</p>
          </div>
        ) : filteredEntities.length === 0 ? (
          <div className="flex h-[460px] items-center justify-center">
            <p className="font-body text-sm text-[#777]">
              No dated narratives or figures match these filters yet.
            </p>
          </div>
        ) : (
          <svg
            height={TIMELINE_HEIGHT}
            role="img"
            width={plotWidth}
            aria-label="Chronological timeline of narratives and figures"
          >
            {/* Era bands */}
            {TIMELINE_ERAS.map((era) => {
              const x = yearToX(era.startYear, domain, plotWidth)
              const endX = yearToX(era.endYear, domain, plotWidth)
              const width = Math.max(endX - x, 0)

              return (
                <g key={era.key}>
                  <rect fill={era.color} height={TIMELINE_HEIGHT} width={width} x={x} y={0} />
                  <line
                    stroke="rgba(0,0,0,0.08)"
                    strokeWidth={1}
                    x1={x}
                    x2={x}
                    y1={0}
                    y2={TIMELINE_HEIGHT}
                  />
                  <text
                    className="font-display uppercase"
                    fill="#999"
                    fontSize={10}
                    letterSpacing={1}
                    x={x + 10}
                    y={22}
                  >
                    {era.label}
                  </text>
                  <text fill="#bbb" fontSize={9} x={x + 10} y={38}>
                    {formatTimelineYear(era.startYear)}
                  </text>
                </g>
              )
            })}

            {/* Baseline */}
            <line
              stroke="rgba(0,0,0,0.12)"
              strokeWidth={1}
              x1={0}
              x2={plotWidth}
              y1={(PLOT_TOP + PLOT_BOTTOM) / 2}
              y2={(PLOT_TOP + PLOT_BOTTOM) / 2}
            />

            {/* Entity dots */}
            {filteredEntities.map((entity, index) => {
              const year = entity.date_sort_year
              if (year === null) {
                return null
              }

              const x = yearToX(year, domain, plotWidth)
              const y = PLOT_TOP + (index % LANE_COUNT) * laneGap
              const confidence = entity.confidence_override ?? entity.confidence_score
              const radius = 4 + confidence * 4
              const color = ENTITY_COLORS[entity.type].node
              const isHovered = hoveredId === entity.id
              const showLabel =
                isHovered || zoom >= LABEL_ZOOM_THRESHOLD || confidence >= HIGH_CONFIDENCE

              return (
                <g
                  key={entity.id}
                  className="cursor-pointer"
                  onClick={() => handleDotClick(entity)}
                  onMouseEnter={() => setHoveredId(entity.id)}
                  onMouseLeave={() =>
                    setHoveredId((current) => (current === entity.id ? null : current))
                  }
                >
                  <line
                    stroke={color}
                    strokeOpacity={0.25}
                    strokeWidth={1}
                    x1={x}
                    x2={x}
                    y1={(PLOT_TOP + PLOT_BOTTOM) / 2}
                    y2={y}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    fill={color}
                    fillOpacity={isHovered ? 1 : 0.85}
                    r={isHovered ? radius + 2 : radius}
                    stroke="#fff"
                    strokeWidth={1.5}
                  />
                  {showLabel ? (
                    <text
                      className="font-body"
                      fill={isHovered ? '#1a1a1a' : '#555'}
                      fontSize={11}
                      x={x + radius + 4}
                      y={y + 4}
                    >
                      {entity.name}
                      <tspan fill="#aaa" fontSize={9}>
                        {`  ${formatTimelineYear(year)}`}
                      </tspan>
                    </text>
                  ) : null}
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <p
        className={cn(
          'mt-3 font-body text-[11px] text-[#999]',
          filteredEntities.length === 0 && 'hidden'
        )}
      >
        Showing {filteredEntities.length} dated{' '}
        {filteredEntities.length === 1 ? 'entity' : 'entities'}. Click a dot to inspect it.
      </p>

      {activeNodeId ? <GraphSidePanel /> : null}
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ENTITY_COLORS, ENTITY_LABELS } from '@/constants/entityTypes'
import { getPublishedCultureEntities, getPublishedEntities } from '@/lib/api/entities'
import { getAllPublishedRelationships } from '@/lib/api/relationships'
import { useGraphStore } from '@/stores/graphStore'
import type { EntityType } from '@/types/domain'

const ENTITY_TYPES: EntityType[] = ['symbol', 'figure', 'narrative', 'culture', 'trope']

export const GraphFilters = () => {
  const [open, setOpen] = useState(false)
  const filterState = useGraphStore((state) => state.filterState)
  const setEntityTypeEnabled = useGraphStore((state) => state.setEntityTypeEnabled)
  const setConfidenceThreshold = useGraphStore((state) => state.setConfidenceThreshold)
  const setCultureIds = useGraphStore((state) => state.setCultureIds)
  const resetFilters = useGraphStore((state) => state.resetFilters)

  const { data: entities = [] } = useQuery({
    queryKey: ['entities', 'published'],
    queryFn: () => getPublishedEntities(),
    staleTime: 60_000,
  })

  const { data: cultures = [] } = useQuery({
    queryKey: ['entities', 'published', 'cultures'],
    queryFn: getPublishedCultureEntities,
    staleTime: 60_000,
  })

  const { data: relationships = [] } = useQuery({
    queryKey: ['relationships', 'published'],
    queryFn: getAllPublishedRelationships,
    staleTime: 60_000,
  })

  const typeCounts = useMemo(() => {
    const relatedToSelectedCulture = new Set<string>()

    if (filterState.cultureIds.length > 0) {
      relationships.forEach((relationship) => {
        if (relationship.type !== 'belongs_to') {
          return
        }

        if (filterState.cultureIds.includes(relationship.to_entity_id)) {
          relatedToSelectedCulture.add(relationship.from_entity_id)
          relatedToSelectedCulture.add(relationship.to_entity_id)
        }
      })
    }

    return ENTITY_TYPES.reduce<Record<EntityType, number>>(
      (counts, type) => {
        counts[type] = entities.filter((entity) => {
          const confidence = entity.confidence_override ?? entity.confidence_score
          const passesConfidence = confidence >= filterState.confidenceThreshold
          const passesCulture =
            filterState.cultureIds.length === 0 ||
            filterState.cultureIds.includes(entity.id) ||
            relatedToSelectedCulture.has(entity.id)

          return entity.type === type && passesConfidence && passesCulture
        }).length

        return counts
      },
      {
        culture: 0,
        figure: 0,
        narrative: 0,
        symbol: 0,
        trope: 0,
      }
    )
  }, [entities, filterState.confidenceThreshold, filterState.cultureIds, relationships])

  return (
    <div className="pointer-events-auto absolute right-4 top-4 z-30">
      <Button
        aria-label="Toggle graph filters"
        className="border-white/15 bg-charcoal/80 text-white hover:bg-white/10"
        size="icon"
        type="button"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
      >
        <Filter className="h-4 w-4" />
      </Button>

      {open ? (
        <section className="mt-2 w-[min(calc(100vw-2rem),280px)] rounded border-0.5 border-white/10 bg-charcoal/90 p-4 text-white backdrop-blur-md">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-[9px] uppercase tracking-label text-white/60">
              Filters
            </h2>
            <button
              className="font-body text-[11px] text-white/42 hover:text-white/75"
              type="button"
              onClick={resetFilters}
            >
              Reset filters
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {ENTITY_TYPES.map((type) => {
                const colors = ENTITY_COLORS[type]
                const disabled = typeCounts[type] === 0 && filterState.entityTypes[type]

                return (
                  <label
                    key={type}
                    className="flex items-center justify-between gap-3 font-body text-[12px] text-white/70"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: disabled ? '#555' : colors.node }}
                      />
                      {ENTITY_LABELS[type]}
                    </span>
                    <input
                      checked={filterState.entityTypes[type]}
                      className="h-4 w-4 accent-verdigris disabled:opacity-35"
                      disabled={disabled}
                      type="checkbox"
                      onChange={(event) => setEntityTypeEnabled(type, event.target.checked)}
                    />
                  </label>
                )
              })}
            </div>

            <label className="flex flex-col gap-2 border-t-0.5 border-white/10 pt-3 font-body text-[12px] text-white/70">
              <span>Confidence &gt;= {filterState.confidenceThreshold.toFixed(2)}</span>
              <input
                max={1}
                min={0}
                step={0.05}
                type="range"
                value={filterState.confidenceThreshold}
                onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
              />
            </label>

            <div className="border-t-0.5 border-white/10 pt-3">
              <p className="mb-2 font-body text-[12px] text-white/70">Culture / tradition</p>
              <div className="max-h-36 overflow-auto pr-1">
                {cultures.length > 0 ? (
                  cultures.map((culture) => (
                    <label
                      key={culture.id}
                      className="flex items-center justify-between gap-3 py-1 font-body text-[12px] text-white/60"
                    >
                      {culture.name}
                      <input
                        checked={filterState.cultureIds.includes(culture.id)}
                        className="h-4 w-4 accent-verdigris"
                        type="checkbox"
                        onChange={(event) => {
                          const nextCultureIds = event.target.checked
                            ? [...filterState.cultureIds, culture.id]
                            : filterState.cultureIds.filter((cultureId) => cultureId !== culture.id)
                          setCultureIds(nextCultureIds)
                        }}
                      />
                    </label>
                  ))
                ) : (
                  <p className="font-body text-[12px] italic text-white/35">
                    No cultures have been published yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}

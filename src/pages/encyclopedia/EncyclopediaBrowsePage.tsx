import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EntityCard } from '@/components/entity/EntityCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ENTITY_LABELS } from '@/constants/entityTypes'
import { getPublishedEntities } from '@/lib/api/entities'
import type { EntityType } from '@/types/domain'

const tabs: Array<{ label: string; value: EntityType | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Symbols', value: 'symbol' },
  { label: 'Figures', value: 'figure' },
  { label: 'Narratives', value: 'narrative' },
  { label: 'Cultures', value: 'culture' },
  { label: 'Tropes', value: 'trope' },
]

const skeletons = Array.from({ length: 12 }, (_, index) => index)

export default function EncyclopediaBrowsePage() {
  const [activeTab, setActiveTab] = useState<EntityType | 'all'>('all')

  const entitiesQuery = useQuery({
    queryKey: ['entities', 'published', 'browse'],
    queryFn: () => getPublishedEntities(),
    staleTime: 60_000,
  })

  const filteredEntities = useMemo(() => {
    const entities = entitiesQuery.data ?? []
    const filtered =
      activeTab === 'all' ? entities : entities.filter((entity) => entity.type === activeTab)

    return [...filtered].sort((first, second) => first.name.localeCompare(second.name))
  }, [activeTab, entitiesQuery.data])

  const emptyLabel = activeTab === 'all' ? 'entities' : `${ENTITY_LABELS[activeTab]}s`

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-8">
      <div className="mb-7">
        <p className="mb-2 font-display text-[8px] uppercase tracking-label text-[#777]">
          Encyclopedia
        </p>
        <h1 className="font-display text-[28px] leading-tight text-ink">Published Entities</h1>
      </div>

      <div className="mb-6 border-b-0.5 border-black/10 pb-3">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as EntityType | 'all')}>
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {entitiesQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skeletons.map((item) => (
            <div
              key={item}
              className="flex min-h-36 flex-col justify-between rounded-lg border-0.5 border-black/10 bg-white p-4"
            >
              <div className="flex justify-between gap-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-16" />
              </div>
              <Skeleton className="mt-5 h-9 w-full" />
              <Skeleton className="mt-5 h-3 w-28" />
            </div>
          ))}
        </div>
      ) : null}

      {entitiesQuery.isError ? (
        <div className="rounded-lg border-0.5 border-terracotta/40 bg-white p-5 font-body text-[13px] text-terracotta">
          Could not load published entities.
        </div>
      ) : null}

      {!entitiesQuery.isLoading && !entitiesQuery.isError && filteredEntities.length === 0 ? (
        <div className="rounded-lg border-0.5 border-black/10 bg-white p-8 text-center">
          <p className="font-display text-[11px] uppercase tracking-label text-ink">
            No {emptyLabel} have been published yet.
          </p>
          <p className="mt-2 font-body text-[12px] italic text-[#777]">
            The encyclopedia will fill in as the graph is curated.
          </p>
        </div>
      ) : null}

      {!entitiesQuery.isLoading && !entitiesQuery.isError && filteredEntities.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredEntities.map((entity) => (
            <EntityCard key={entity.id} entity={entity} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { EntityType } from '@/types/domain'

export interface GraphFilterState {
  entityTypes: Record<EntityType, boolean>
  confidenceThreshold: number
  cultureIds: string[]
}

interface GraphStore {
  activeNodeId: string | null
  hoveredNodeId: string | null
  filterState: GraphFilterState
  setActiveNodeId: (activeNodeId: string | null) => void
  setHoveredNodeId: (hoveredNodeId: string | null) => void
  setEntityTypeEnabled: (type: EntityType, enabled: boolean) => void
  setConfidenceThreshold: (confidenceThreshold: number) => void
  setCultureIds: (cultureIds: string[]) => void
  resetFilters: () => void
  clearInteraction: () => void
}

export const DEFAULT_GRAPH_FILTERS: GraphFilterState = {
  confidenceThreshold: 0,
  cultureIds: [],
  entityTypes: {
    symbol: true,
    figure: true,
    narrative: true,
    culture: true,
    trope: true,
  },
}

export const useGraphStore = create<GraphStore>()(
  persist(
    (set) => ({
      activeNodeId: null,
      filterState: DEFAULT_GRAPH_FILTERS,
      hoveredNodeId: null,
      clearInteraction: () => set({ activeNodeId: null, hoveredNodeId: null }),
      resetFilters: () => set({ filterState: DEFAULT_GRAPH_FILTERS }),
      setActiveNodeId: (activeNodeId) => set({ activeNodeId }),
      setConfidenceThreshold: (confidenceThreshold) =>
        set((state) => ({
          filterState: {
            ...state.filterState,
            confidenceThreshold,
          },
        })),
      setCultureIds: (cultureIds) =>
        set((state) => ({
          filterState: {
            ...state.filterState,
            cultureIds,
          },
        })),
      setEntityTypeEnabled: (type, enabled) =>
        set((state) => ({
          filterState: {
            ...state.filterState,
            entityTypes: {
              ...state.filterState.entityTypes,
              [type]: enabled,
            },
          },
        })),
      setHoveredNodeId: (hoveredNodeId) => set({ hoveredNodeId }),
    }),
    {
      name: 'mythograph-graph-filters',
      partialize: (state) => ({ filterState: state.filterState }),
    }
  )
)

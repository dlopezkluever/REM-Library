import { create } from 'zustand'
import { appendCompareSlug } from '@/lib/comparison'

interface UiState {
  comparisonSlugs: string[]
  setComparisonSlugs: (slugs: string[]) => void
  addComparisonSlug: (slug: string) => void
  clearComparison: () => void
}

export const useUiStore = create<UiState>((set) => ({
  comparisonSlugs: [],
  setComparisonSlugs: (slugs) => set({ comparisonSlugs: slugs }),
  addComparisonSlug: (slug) =>
    set((state) => ({ comparisonSlugs: appendCompareSlug(state.comparisonSlugs, slug) })),
  clearComparison: () => set({ comparisonSlugs: [] }),
}))

import { lazy, Suspense, type ReactNode } from 'react'

export const ExplorationsPage = lazy(() => import('@/pages/ExplorationsPage'))
export const ExplorationPlayerPage = lazy(() => import('@/pages/ExplorationPlayerPage'))
export const TimelinePage = lazy(() => import('@/pages/TimelinePage'))
export const ComparisonPage = lazy(() => import('@/pages/compare/ComparisonPage'))
export const AdminExplorationEditor = lazy(() => import('@/pages/admin/AdminExplorationEditor'))

const RouteFallback = () => (
  <div className="flex min-h-64 items-center justify-center">
    <p className="font-display text-[10px] uppercase tracking-label text-[#888]">Loading</p>
  </div>
)

export const LazyRoute = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<RouteFallback />}>{children}</Suspense>
)

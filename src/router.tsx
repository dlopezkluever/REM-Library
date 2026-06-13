import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAdmin } from '@/components/auth/RequireAdmin'
import { AppShell } from '@/components/layout/AppShell'
import { ContentShell } from '@/components/layout/ContentShell'
import { AdminShell } from '@/components/layout/AdminShell'
import GraphPage from '@/pages/GraphPage'
import EncyclopediaBrowsePage from '@/pages/encyclopedia/EncyclopediaBrowsePage'
import EntityDetailPage from '@/pages/entity/EntityDetailPage'
import ClaimDetailPage from '@/pages/claim/ClaimDetailPage'
import SourceLibraryPage from '@/pages/sources/SourceLibraryPage'
import SourceDetailPage from '@/pages/sources/SourceDetailPage'
import SearchPage from '@/pages/search/SearchPage'
import AdminLoginPage from '@/pages/admin/AdminLoginPage'
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage'
import AdminSourceListPage from '@/pages/admin/AdminSourceListPage'
import AdminSourceNewPage from '@/pages/admin/AdminSourceNewPage'
import AdminSourceDetailPage from '@/pages/admin/AdminSourceDetailPage'
import AdminSourceImpactPage from '@/pages/admin/AdminSourceImpactPage'
import AdminReviewQueuePage from '@/pages/admin/AdminReviewQueuePage'
import AdminEntityManagerPage from '@/pages/admin/AdminEntityManagerPage'
import AdminEntityNewPage from '@/pages/admin/AdminEntityNewPage'
import AdminClaimManagerPage from '@/pages/admin/AdminClaimManagerPage'
import AdminClaimNewPage from '@/pages/admin/AdminClaimNewPage'
import AdminRelationshipManagerPage from '@/pages/admin/AdminRelationshipManagerPage'
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage'
import AdminUrlDomainsPage from '@/pages/admin/AdminUrlDomainsPage'
import ErrorPage from '@/pages/ErrorPage'
import {
  AdminExplorationEditor,
  ComparisonPage,
  ExplorationPlayerPage,
  ExplorationsPage,
  LazyRoute,
  TimelinePage,
} from '@/routes/phase6Routes'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/', element: <GraphPage /> },
      {
        path: '/explorations/:id',
        element: (
          <LazyRoute>
            <ExplorationPlayerPage />
          </LazyRoute>
        ),
      },
    ],
  },
  {
    element: <ContentShell />,
    errorElement: <ErrorPage />,
    children: [
      { path: '/encyclopedia', element: <EncyclopediaBrowsePage /> },
      { path: '/entity/:slug', element: <EntityDetailPage /> },
      { path: '/claim/:id', element: <ClaimDetailPage /> },
      { path: '/sources', element: <SourceLibraryPage /> },
      { path: '/source/:id', element: <SourceDetailPage /> },
      { path: '/sources/:id', element: <SourceDetailPage /> },
      { path: '/search', element: <SearchPage /> },
      {
        path: '/explorations',
        element: (
          <LazyRoute>
            <ExplorationsPage />
          </LazyRoute>
        ),
      },
      {
        path: '/timeline',
        element: (
          <LazyRoute>
            <TimelinePage />
          </LazyRoute>
        ),
      },
      {
        path: '/compare',
        element: (
          <LazyRoute>
            <ComparisonPage />
          </LazyRoute>
        ),
      },
    ],
  },
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
    errorElement: <ErrorPage />,
  },
  {
    element: <RequireAdmin />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { path: '/admin', element: <Navigate to="/admin/dashboard" replace /> },
          { path: '/admin/dashboard', element: <AdminDashboardPage /> },
          { path: '/admin/sources', element: <AdminSourceListPage /> },
          { path: '/admin/sources/new', element: <AdminSourceNewPage /> },
          { path: '/admin/sources/:id', element: <AdminSourceDetailPage /> },
          { path: '/admin/sources/:id/impact', element: <AdminSourceImpactPage /> },
          { path: '/admin/review', element: <AdminReviewQueuePage /> },
          { path: '/admin/entities', element: <AdminEntityManagerPage /> },
          { path: '/admin/entities/new', element: <AdminEntityNewPage /> },
          { path: '/admin/claims', element: <AdminClaimManagerPage /> },
          { path: '/admin/claims/new', element: <AdminClaimNewPage /> },
          { path: '/admin/relationships', element: <AdminRelationshipManagerPage /> },
          {
            path: '/admin/explorations/new',
            element: (
              <LazyRoute>
                <AdminExplorationEditor />
              </LazyRoute>
            ),
          },
          { path: '/admin/settings', element: <AdminSettingsPage /> },
          { path: '/admin/settings/url-domains', element: <AdminUrlDomainsPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <ErrorPage />,
  },
])

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
import AdminReviewQueuePage from '@/pages/admin/AdminReviewQueuePage'
import AdminEntityManagerPage from '@/pages/admin/AdminEntityManagerPage'
import AdminSettingsPage from '@/pages/admin/AdminSettingsPage'
import ErrorPage from '@/pages/ErrorPage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <ErrorPage />,
    children: [{ path: '/', element: <GraphPage /> }],
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
          { path: '/admin/review', element: <AdminReviewQueuePage /> },
          { path: '/admin/entities', element: <AdminEntityManagerPage /> },
          { path: '/admin/settings', element: <AdminSettingsPage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <ErrorPage />,
  },
])

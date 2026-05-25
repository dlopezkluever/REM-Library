import { createBrowserRouter } from 'react-router-dom'
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

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [{ path: '/', element: <GraphPage /> }],
  },
  {
    element: <ContentShell />,
    children: [
      { path: '/encyclopedia', element: <EncyclopediaBrowsePage /> },
      { path: '/entity/:slug', element: <EntityDetailPage /> },
      { path: '/claim/:id', element: <ClaimDetailPage /> },
      { path: '/sources', element: <SourceLibraryPage /> },
      { path: '/sources/:id', element: <SourceDetailPage /> },
      { path: '/search', element: <SearchPage /> },
    ],
  },
  {
    path: '/admin/login',
    element: <AdminLoginPage />,
  },
  {
    element: <AdminShell />,
    children: [
      { path: '/admin', element: <AdminDashboardPage /> },
      { path: '/admin/sources', element: <AdminSourceListPage /> },
      { path: '/admin/sources/new', element: <AdminSourceNewPage /> },
      { path: '/admin/review', element: <AdminReviewQueuePage /> },
      { path: '/admin/entities', element: <AdminEntityManagerPage /> },
      { path: '/admin/settings', element: <AdminSettingsPage /> },
    ],
  },
])

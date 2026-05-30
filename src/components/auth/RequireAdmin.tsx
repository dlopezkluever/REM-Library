import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'

export const RequireAdmin = () => {
  const location = useLocation()
  const session = useAuthStore((state) => state.session)
  const role = useAuthStore((state) => state.role)
  const isLoading = useAuthStore((state) => state.isLoading)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone text-ink">
        <p className="font-display text-sm uppercase tracking-label text-[#888]">Loading</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone text-ink">
        <p className="font-body text-sm text-[#888]">No admin profile is linked to this account.</p>
      </div>
    )
  }

  return <Outlet />
}

import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { useAuthStore } from '@/stores/authStore'

export const RequireAdmin = () => {
  const location = useLocation()
  const session = useAuthStore((state) => state.session)
  const role = useAuthStore((state) => state.role)
  const isLoading = useAuthStore((state) => state.isLoading)
  const error = useAuthStore((state) => state.error)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone text-ink">
        <p className="font-display text-sm uppercase tracking-label text-[#888]">Loading</p>
      </div>
    )
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone px-4 text-ink">
        <div className="max-w-sm text-center">
          <p className="font-body text-sm text-terracotta-dark">{error}</p>
          <Link
            className="mt-4 inline-flex font-display text-[10px] uppercase tracking-label text-ink underline"
            to={ROUTES.ADMIN_LOGIN}
          >
            Return to admin login
          </Link>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!role || role === 'contributor') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone text-ink">
        <p className="font-body text-sm text-[#888]">
          {error ?? 'This account does not have internal admin access.'}
        </p>
      </div>
    )
  }

  return <Outlet />
}

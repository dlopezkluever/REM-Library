import { ROUTES } from '@/constants/routes'

interface AdminRedirectState {
  from?: {
    hash?: string
    pathname?: string
    search?: string
  }
}

export const getAdminRedirectDestination = (state: unknown) => {
  const from = (state as AdminRedirectState | null)?.from
  const pathname = from?.pathname

  if (
    !pathname ||
    (pathname !== '/admin' && !pathname.startsWith('/admin/')) ||
    pathname === ROUTES.ADMIN_LOGIN
  ) {
    return ROUTES.ADMIN_DASHBOARD
  }

  return `${pathname}${from.search ?? ''}${from.hash ?? ''}`
}

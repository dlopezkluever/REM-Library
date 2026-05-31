import { describe, expect, it } from 'vitest'
import { ROUTES } from '@/constants/routes'
import { getAdminRedirectDestination } from '@/lib/adminRedirect'

describe('AdminLoginPage redirect destination', () => {
  it('uses the requested admin route when it is internal', () => {
    expect(
      getAdminRedirectDestination({
        from: {
          hash: '#focused',
          pathname: ROUTES.ADMIN_CLAIMS,
          search: '?source=123',
        },
      })
    ).toBe('/admin/claims?source=123#focused')
  })

  it('falls back to the dashboard for non-admin or login routes', () => {
    expect(getAdminRedirectDestination({ from: { pathname: '/source/123' } })).toBe(
      ROUTES.ADMIN_DASHBOARD
    )
    expect(getAdminRedirectDestination({ from: { pathname: ROUTES.ADMIN_LOGIN } })).toBe(
      ROUTES.ADMIN_DASHBOARD
    )
    expect(getAdminRedirectDestination({ from: { pathname: '/administrator' } })).toBe(
      ROUTES.ADMIN_DASHBOARD
    )
  })
})

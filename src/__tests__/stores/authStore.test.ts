import type { Session } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createSession = (userId: string) =>
  ({
    access_token: `token-${userId}`,
    expires_at: Date.now() + 3600,
    expires_in: 3600,
    refresh_token: `refresh-${userId}`,
    token_type: 'bearer',
    user: {
      app_metadata: {},
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      id: userId,
      user_metadata: {},
    },
  }) as Session

const importAuthStore = async ({
  getSession = vi.fn(),
  maybeSingle = vi.fn(),
}: {
  getSession?: ReturnType<typeof vi.fn>
  maybeSingle?: ReturnType<typeof vi.fn>
}) => {
  const profileQuery = {
    eq: vi.fn(() => profileQuery),
    maybeSingle,
    select: vi.fn(() => profileQuery),
  }
  const supabase = {
    auth: {
      getSession,
    },
    from: vi.fn(() => profileQuery),
  }

  vi.doMock('@/lib/supabase/client', () => ({ supabase }))

  return import('@/stores/authStore')
}

describe('authStore', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('does not stay loading when session hydration fails', async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: { session: null },
      error: new Error('network unavailable'),
    })
    const { useAuthStore } = await importAuthStore({ getSession })

    await useAuthStore.getState().hydrate()

    expect(useAuthStore.getState()).toMatchObject({
      error: 'Unable to verify the current admin session.',
      isLoading: false,
      role: null,
      session: null,
    })
  })

  it('keeps the session but clears the role when profile lookup fails', async () => {
    const session = createSession('user-1')
    const maybeSingle = vi.fn().mockRejectedValue(new Error('profile query failed'))
    const { useAuthStore } = await importAuthStore({ maybeSingle })

    await useAuthStore.getState().setSession(session)

    expect(useAuthStore.getState()).toMatchObject({
      error: 'Unable to load the admin profile for this account.',
      isLoading: false,
      role: null,
      session,
    })
  })

  it('ignores stale role lookups that resolve after a newer session', async () => {
    const olderSession = createSession('user-1')
    const newerSession = createSession('user-2')
    let resolveOlderLookup: (value: { data: { role: 'super_admin' }; error: null }) => void = () =>
      undefined
    const maybeSingle = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveOlderLookup = resolve
        })
      )
      .mockResolvedValueOnce({ data: { role: 'editor' }, error: null })
    const { useAuthStore } = await importAuthStore({ maybeSingle })

    const olderRequest = useAuthStore.getState().setSession(olderSession)
    const newerRequest = useAuthStore.getState().setSession(newerSession)

    await newerRequest
    resolveOlderLookup({ data: { role: 'super_admin' }, error: null })
    await olderRequest

    expect(useAuthStore.getState()).toMatchObject({
      error: null,
      isLoading: false,
      role: 'editor',
      session: newerSession,
    })
  })
})

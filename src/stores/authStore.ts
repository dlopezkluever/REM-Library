import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import type { Enums } from '@/types/database'

export type AdminRole = Enums<'admin_role'>

interface AuthState {
  session: Session | null
  role: AdminRole | null
  isLoading: boolean
  error: string | null
  hydrate: () => Promise<void>
  setSession: (session: Session | null) => Promise<void>
  clearSession: () => void
}

let authRequestId = 0

const getRoleForSession = async (session: Session | null) => {
  if (!session) {
    return null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.role ?? null
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  role: null,
  isLoading: true,
  error: null,
  hydrate: async () => {
    const requestId = (authRequestId += 1)
    set({ error: null, isLoading: true })

    try {
      const { data, error } = await supabase.auth.getSession()

      if (requestId !== authRequestId) {
        return
      }

      if (error) {
        set({
          session: null,
          role: null,
          isLoading: false,
          error: 'Unable to verify the current admin session.',
        })
        return
      }

      try {
        const role = await getRoleForSession(data.session)

        if (requestId === authRequestId) {
          set({ session: data.session, role, isLoading: false, error: null })
        }
      } catch {
        if (requestId === authRequestId) {
          set({
            session: data.session,
            role: null,
            isLoading: false,
            error: 'Unable to load the admin profile for this account.',
          })
        }
      }
    } catch {
      if (requestId === authRequestId) {
        set({
          session: null,
          role: null,
          isLoading: false,
          error: 'Unable to verify the current admin session.',
        })
      }
    }
  },
  setSession: async (session) => {
    const requestId = (authRequestId += 1)
    set({ error: null, isLoading: true })

    if (!session) {
      set({ session: null, role: null, isLoading: false, error: null })
      return
    }

    try {
      const role = await getRoleForSession(session)

      if (requestId === authRequestId) {
        set({ session, role, isLoading: false, error: null })
      }
    } catch {
      if (requestId === authRequestId) {
        set({
          session,
          role: null,
          isLoading: false,
          error: 'Unable to load the admin profile for this account.',
        })
      }
    }
  },
  clearSession: () => {
    authRequestId += 1
    set({ session: null, role: null, isLoading: false, error: null })
  },
}))

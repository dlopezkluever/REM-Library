import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase/client'
import type { Enums } from '@/types/database'

export type AdminRole = Enums<'admin_role'>

interface AuthState {
  session: Session | null
  role: AdminRole | null
  isLoading: boolean
  hydrate: () => Promise<void>
  setSession: (session: Session | null) => Promise<void>
  clearSession: () => void
}

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
  hydrate: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase.auth.getSession()

    if (error) {
      set({ session: null, role: null, isLoading: false })
      throw error
    }

    const role = await getRoleForSession(data.session)
    set({ session: data.session, role, isLoading: false })
  },
  setSession: async (session) => {
    set({ isLoading: true })
    const role = await getRoleForSession(session)
    set({ session, role, isLoading: false })
  },
  clearSession: () => set({ session: null, role: null, isLoading: false }),
}))

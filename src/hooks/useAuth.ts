import { useAuthStore } from '@/stores/authStore'
import { supabase } from '@/lib/supabase/client'

export const useAuth = () => {
  const { session, role, isLoading, error, hydrate, setSession, clearSession } = useAuthStore()

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      throw error
    }

    await setSession(data.session)
    return data.session
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()

    if (error) {
      throw error
    }

    clearSession()
  }

  return {
    session,
    user: session?.user ?? null,
    role,
    isLoading,
    error,
    hydrate,
    signIn,
    signOut,
  }
}

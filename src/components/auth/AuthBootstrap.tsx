import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/authStore'

interface AuthBootstrapProps {
  children: ReactNode
}

export const AuthBootstrap = ({ children }: AuthBootstrapProps) => {
  const hydrate = useAuthStore((state) => state.hydrate)
  const setSession = useAuthStore((state) => state.setSession)
  const clearSession = useAuthStore((state) => state.clearSession)

  useEffect(() => {
    void hydrate()

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        void setSession(session)
        return
      }

      clearSession()
    })

    return () => {
      data.subscription.unsubscribe()
    }
  }, [clearSession, hydrate, setSession])

  return <>{children}</>
}

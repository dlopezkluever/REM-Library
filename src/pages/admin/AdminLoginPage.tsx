import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { getAdminRedirectDestination } from '@/lib/adminRedirect'
import { ROUTES } from '@/constants/routes'

export default function AdminLoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const redirectDestination = getAdminRedirectDestination(location.state)

  useEffect(() => {
    if (session) {
      navigate(redirectDestination, { replace: true })
    }
  }, [navigate, redirectDestination, session])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      await signIn(email, password)
      navigate(redirectDestination, { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to sign in.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone px-4 text-ink">
      <form
        className="w-full max-w-sm rounded border border-black/10 bg-stone p-6 shadow-sm"
        onSubmit={handleSubmit}
      >
        <div className="mb-6">
          <h1 className="font-display text-2xl text-ink">Admin Login</h1>
          <p className="mt-2 font-body text-sm text-[#666]">
            Sign in to manage Mythograph content.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block font-body text-sm text-ink">Email</span>
            <Input
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block font-body text-sm text-ink">Password</span>
            <Input
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
            />
          </label>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded border border-terracotta/30 bg-terracotta-light px-3 py-2 font-body text-sm text-terracotta-dark">
            {errorMessage}
          </p>
        ) : null}

        <Button className="mt-6 w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Signing in' : 'Sign in'}
        </Button>
        <Link className="mt-4 block text-center font-body text-xs text-verdigris" to={ROUTES.REGISTER}>
          Create contributor account
        </Link>
      </form>
    </div>
  )
}

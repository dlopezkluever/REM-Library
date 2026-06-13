import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/constants/routes'
import { supabase } from '@/lib/supabase/client'

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setErrorMessage(null)
    setIsSubmitting(true)

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName.trim() || null,
          },
          emailRedirectTo: `${window.location.origin}${ROUTES.GRAPH}`,
        },
      })

      if (error) {
        throw error
      }

      setMessage('Check your email to verify the account before submitting suggestions.')
      setDisplayName('')
      setEmail('')
      setPassword('')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Registration failed.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-sm items-center px-5 py-10">
      <form
        className="w-full rounded border border-0.5 border-black/10 bg-white p-6"
        onSubmit={handleSubmit}
      >
        <div className="mb-6">
          <h1 className="font-display text-2xl text-ink">Create Account</h1>
          <p className="mt-2 font-body text-sm text-[#666]">
            Contributor accounts can submit claims, corrections, and flags for review.
          </p>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block font-body text-sm text-ink">Display name</span>
            <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-body text-sm text-ink">Email</span>
            <Input
              required
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block font-body text-sm text-ink">Password</span>
            <Input
              required
              autoComplete="new-password"
              minLength={8}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        </div>

        {message ? (
          <p className="mt-4 rounded border border-verdigris/30 bg-verdigris-light px-3 py-2 font-body text-sm text-verdigris-dark">
            {message}
          </p>
        ) : null}
        {errorMessage ? (
          <p className="mt-4 rounded border border-terracotta/30 bg-terracotta-light px-3 py-2 font-body text-sm text-terracotta-dark">
            {errorMessage}
          </p>
        ) : null}

        <Button className="mt-6 w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Creating account' : 'Create account'}
        </Button>
        <Link className="mt-4 block text-center font-body text-xs text-verdigris" to={ROUTES.ADMIN_LOGIN}>
          Sign in
        </Link>
      </form>
    </div>
  )
}

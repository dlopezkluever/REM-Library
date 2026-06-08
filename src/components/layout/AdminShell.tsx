import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  BookOpen,
  Compass,
  FileText,
  GitPullRequestDraft,
  GitBranch,
  LogOut,
  ScrollText,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

const navItems = [
  { to: ROUTES.ADMIN_DASHBOARD, label: 'Dashboard', icon: BarChart3 },
  { to: ROUTES.ADMIN_SOURCES, label: 'Sources', icon: BookOpen },
  { to: ROUTES.ADMIN_REVIEW, label: 'Review Queue', icon: GitPullRequestDraft },
  { to: ROUTES.ADMIN_ENTITIES, label: 'Entities', icon: ScrollText },
  { to: ROUTES.ADMIN_CLAIMS, label: 'Claims', icon: FileText },
  { to: ROUTES.ADMIN_RELATIONSHIPS, label: 'Relationships', icon: GitBranch },
  { to: ROUTES.ADMIN_EXPLORATION_NEW, label: 'New Exploration', icon: Compass },
  { to: ROUTES.ADMIN_SETTINGS, label: 'Settings', icon: Settings },
]

export const AdminShell = () => {
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const [signOutError, setSignOutError] = useState<string | null>(null)

  const handleSignOut = async () => {
    setSignOutError(null)

    try {
      await signOut()
      navigate(ROUTES.ADMIN_LOGIN, { replace: true })
    } catch {
      setSignOutError('Sign out failed.')
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone text-ink">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-b-0.5 border-b-black/[0.09] bg-stone px-[22px]">
        <Link
          className="font-display text-[13px] uppercase tracking-wordmark text-ink"
          to={ROUTES.GRAPH}
        >
          Mythograph
        </Link>
        <div className="flex items-center gap-3">
          {signOutError ? (
            <p className="font-body text-xs text-terracotta-dark">{signOutError}</p>
          ) : null}
          <p className="max-w-[280px] truncate font-body text-xs text-[#777]">
            {user?.email ?? 'Admin user'}
          </p>
          <Button size="sm" type="button" variant="outline" onClick={handleSignOut}>
            <LogOut aria-hidden="true" className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="w-[200px] shrink-0 border-r border-r-0.5 border-r-black/[0.09] p-4">
          <nav className="flex flex-col gap-1" aria-label="Admin">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded px-3 py-2 font-body text-xs transition-colors',
                    isActive
                      ? 'bg-verdigris/10 text-verdigris'
                      : 'text-[#777] hover:bg-black/[0.03] hover:text-ink'
                  )
                }
                to={to}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

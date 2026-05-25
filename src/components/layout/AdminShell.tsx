import { Outlet, NavLink } from 'react-router-dom'
import { NavBar } from '@/components/layout/NavBar'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

export const AdminShell = () => {
  return (
    <div className="flex flex-col min-h-screen bg-stone text-ink">
      <NavBar variant="light" />
      <div className="flex flex-1">
        <aside className="w-[200px] shrink-0 border-r border-r-0.5 border-r-black/[0.09] p-4">
          <nav className="flex flex-col gap-1">
            {[
              { to: ROUTES.ADMIN_DASHBOARD, label: 'Dashboard' },
              { to: ROUTES.ADMIN_SOURCES, label: 'Sources' },
              { to: ROUTES.ADMIN_REVIEW, label: 'Review Queue' },
              { to: ROUTES.ADMIN_ENTITIES, label: 'Entities' },
              { to: ROUTES.ADMIN_SETTINGS, label: 'Settings' },
            ].map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'font-body text-xs px-3 py-2 rounded transition-colors',
                    isActive ? 'bg-verdigris/10 text-verdigris' : 'text-[#888] hover:text-ink'
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

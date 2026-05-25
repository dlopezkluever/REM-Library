import { Link, useLocation } from 'react-router-dom'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface NavBarProps {
  variant: 'dark' | 'light'
}

export const NavBar = ({ variant }: NavBarProps) => {
  const location = useLocation()
  const isDark = variant === 'dark'

  const navLinkClass = cn(
    'font-body text-xs transition-opacity duration-200',
    isDark ? 'text-white/40 hover:text-white/80' : 'text-[#888] hover:text-ink'
  )

  const activeLinkClass = cn('font-body text-xs', isDark ? 'text-white/82' : 'text-ink')

  const isActive = (path: string) => location.pathname === path

  return (
    <nav
      className={cn(
        'flex items-center justify-between px-[22px] h-10 shrink-0',
        isDark
          ? 'bg-charcoal border-b border-b-0.5 border-b-white/[0.07]'
          : 'bg-stone border-b border-b-0.5 border-b-black/[0.09]'
      )}
    >
      <Link
        to={ROUTES.GRAPH}
        className={cn(
          'font-display text-[13px] tracking-wordmark uppercase',
          isDark ? 'text-white/82' : 'text-ink'
        )}
      >
        Mythograph
      </Link>

      <div className="flex items-center gap-6">
        <Link
          to={ROUTES.ENCYCLOPEDIA}
          className={isActive(ROUTES.ENCYCLOPEDIA) ? activeLinkClass : navLinkClass}
        >
          Encyclopedia
        </Link>
        <Link
          to={ROUTES.SOURCES}
          className={isActive(ROUTES.SOURCES) ? activeLinkClass : navLinkClass}
        >
          Sources
        </Link>
        <Link
          to={ROUTES.SEARCH}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full border border-0.5 font-body text-xs transition-opacity duration-200',
            isDark
              ? 'border-white/20 text-white/40 hover:text-white/80'
              : 'border-black/18 text-[#888] hover:text-ink'
          )}
        >
          Search
        </Link>
      </div>
    </nav>
  )
}

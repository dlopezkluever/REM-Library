import { Link } from 'react-router-dom'

interface Crumb {
  label: string
  to?: string
}

interface BreadcrumbProps {
  crumbs: Crumb[]
}

export const Breadcrumb = ({ crumbs }: BreadcrumbProps) => {
  return (
    <div className="flex items-center gap-2 px-[22px] h-8 border-b border-b-0.5 border-b-black/[0.09]">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-[#888] text-xs font-body">/</span>}
          {crumb.to ? (
            <Link
              to={crumb.to}
              className="font-body text-xs text-terracotta hover:text-terracotta/80 transition-opacity"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="font-body text-xs text-ink">{crumb.label}</span>
          )}
        </span>
      ))}
    </div>
  )
}

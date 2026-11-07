import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

export function Breadcrumbs({ items, className }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('flex min-w-0 items-center gap-1.5 text-body', className)}>
      {items.map((it, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight size={14} className="shrink-0 text-text-tertiary" />}
            {last || !it.to ? (
              <span className={cn('truncate', last ? 'font-semibold text-text-primary' : 'text-text-secondary')}>{it.label}</span>
            ) : (
              <Link to={it.to} className="truncate text-text-secondary hover:text-text-primary">{it.label}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}

export function PageHeader({ title, description, actions, back, className }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className="min-w-0">
        {back && (
          <Link to={back.to} className="mb-1 inline-flex items-center gap-1 text-body-sm text-text-secondary hover:text-text-primary">
            <ArrowLeft size={14} /> {back.label}
          </Link>
        )}
        <h1 className="text-display text-text-primary">{title}</h1>
        {description && <p className="mt-1 text-body text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </div>
  )
}

/** Row used above tables: filters on the left, extras on the right */
export function FilterBar({ children, className }) {
  return <div className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center', className)}>{children}</div>
}

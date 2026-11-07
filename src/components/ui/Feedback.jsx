import { CircleAlert, FolderX } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Button } from './Button'

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-border', className)} />
}

export function TableSkeleton({ rows = 6, cols = 5 }) {
  return (
    <div className="divide-y divide-border-light">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-4', c === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ icon: Icon = FolderX, title = 'Nothing to show', description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-background text-text-tertiary">
        <Icon size={24} />
      </span>
      <p className="text-body-lg font-medium text-text-primary">{title}</p>
      {description && <p className="mt-1 max-w-sm text-body text-text-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message = 'We could not load this data. Please try again.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-danger-bg text-danger">
        <CircleAlert size={24} />
      </span>
      <p className="text-body-lg font-medium text-text-primary">{title}</p>
      <p className="mt-1 max-w-sm text-body text-text-secondary">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function InlineAlert({ tone = 'warning', title, children, className }) {
  const tones = {
    warning: 'border-warning/40 bg-warning-bg text-warning-text',
    danger: 'border-danger/40 bg-danger-bg text-danger-text',
    info: 'border-info/40 bg-info-bg text-info-text',
    success: 'border-success/40 bg-success-bg text-success-text',
  }
  return (
    <div role="alert" className={cn('flex gap-3 rounded-md border p-3 text-body-sm', tones[tone], className)}>
      <CircleAlert size={18} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

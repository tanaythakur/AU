import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Skeleton } from './Feedback'

export function Card({ className, padded = true, children, ...props }) {
  return (
    <div className={cn('min-w-0 rounded-lg border border-border bg-surface shadow-card', padded && 'p-6', className)} {...props}>
      {children}
    </div>
  )
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cn('mb-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-body-lg font-semibold text-text-primary">{title}</h2>
        {description && <p className="mt-0.5 text-body-sm text-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/**
 * KPI card. variant="primary" = large (36px number), "compact" = secondary row.
 * trend: number (percent). trendGoodWhen: 'up' | 'down' controls green/red meaning.
 */
export function StatCard({ label, value, icon: Icon, trend, trendGoodWhen = 'up', hint, variant = 'primary', loading, tone = 'neutral', className }) {
  const iconTone = {
    neutral: 'bg-background text-text-secondary',
    primary: 'bg-success-bg text-primary',
    warning: 'bg-warning-bg text-warning-text',
    danger: 'bg-danger-bg text-danger-text',
    info: 'bg-info-bg text-info-text',
  }[tone]
  const good = trend === undefined || trend === 0 ? null : (trend > 0) === (trendGoodWhen === 'up')
  return (
    <Card className={cn(variant === 'compact' ? 'p-4' : 'p-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-body font-medium text-text-secondary">{label}</p>
        {Icon && (
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', iconTone)}>
            <Icon size={18} />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className={cn('mt-3', variant === 'compact' ? 'h-8 w-20' : 'h-10 w-36')} />
      ) : (
        <p className={cn('mt-2 text-text-primary', variant === 'compact' ? 'text-h1' : 'text-kpi')}>{value}</p>
      )}
      {(trend !== undefined || hint) && !loading && (
        <div className="mt-2 flex items-center gap-2 text-body-sm">
          {trend !== undefined && trend !== 0 && (
            <span className={cn('inline-flex items-center gap-0.5 font-medium', good ? 'text-success-text' : 'text-danger-text')}>
              {trend > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              {Math.abs(trend)}%
            </span>
          )}
          {hint && <span className="text-text-secondary">{hint}</span>}
        </div>
      )}
    </Card>
  )
}

export function ChartCard({ title, description, action, children, loading, className, height = 280 }) {
  return (
    <Card className={cn('flex flex-col', className)} style={{ minHeight: height + 90 }}>
      <CardHeader title={title} description={description} action={action} />
      <div className="min-h-0 flex-1" style={{ height }}>
        {loading ? <Skeleton className="size-full" /> : children}
      </div>
    </Card>
  )
}

import { cn } from '@/utils/cn'

/** Underline tabs. tabs: [{key,label,count?}] */
export function Tabs({ tabs, value, onChange, className }) {
  return (
    <div className={cn('overflow-x-auto border-b border-border', className)}>
      <div role="tablist" className="flex min-w-max gap-6">
        {tabs.map((t) => {
          const active = t.key === value
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.key)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 pb-3 pt-1 text-body font-medium transition-colors',
                active ? 'border-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className={cn('rounded-full px-2 py-0.5 text-caption', active ? 'bg-success-bg text-success-text' : 'bg-border-light text-text-secondary')}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { plans } from '@/data/db'
import { students } from '@/data/db'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'

/** Plan cards: price and duration are shown automatically on selection. */
export function PlanPicker({ value, onChange }) {
  const active = plans.filter((p) => p.is_active)
  return (
    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Membership plan">
      {active.map((p) => {
        const on = value === p.id
        return (
          <button
            key={p.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(p.id)}
            className={cn('relative rounded-md border p-3 text-left transition-colors',
              on ? 'border-primary bg-success-bg' : 'border-border-heavy bg-surface hover:bg-background')}
          >
            {on && <Check size={16} className="absolute right-2 top-2 text-primary" />}
            <p className="text-body font-medium text-text-primary">{p.name}</p>
            <p className="text-caption text-text-secondary">{p.duration_months} month{p.duration_months > 1 ? 's' : ''}</p>
            <p className="mt-1 text-body-lg font-semibold text-text-primary">{formatINR(p.standard_price)}</p>
          </button>
        )
      })}
    </div>
  )
}

/** Searchable pick of an existing student (name or mobile). */
export function StudentPicker({ value, onChange }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const selected = students.find((s) => s.id === value)
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    return students.filter((s) => s.status === 'active' && (!t || s.full_name.toLowerCase().includes(t) || s.mobile.includes(t))).slice(0, 6)
  }, [q])

  if (selected)
    return (
      <div className="flex items-center justify-between rounded-md border border-border-heavy bg-surface px-3 py-2">
        <div>
          <p className="text-body font-medium">{selected.full_name}</p>
          <p className="text-caption text-text-secondary">{selected.mobile}</p>
        </div>
        <button type="button" aria-label="Change student" onClick={() => onChange('')} className="rounded p-1 text-text-tertiary hover:text-text-primary"><X size={16} /></button>
      </div>
    )
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
      <input
        autoFocus value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Search student by name or mobile" aria-label="Search student"
        className="h-10 w-full rounded-md border border-border-heavy bg-surface pl-9 pr-3 text-body shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-dropdown">
          {results.length === 0 && <li className="px-3 py-2 text-body-sm text-text-secondary">No student found</li>}
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => { onChange(s.id); setOpen(false); setQ('') }} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-background">
                <span className="text-body">{s.full_name}</span>
                <span className="text-caption text-text-secondary">{s.mobile}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

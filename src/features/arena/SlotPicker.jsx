import { useMemo } from 'react'
import { getSettings, bookedHours } from '@/services/store'
import { formatDuration, formatHour, istHour, slotLabel, todayISO } from '@/utils/format'
import { cn } from '@/utils/cn'
import { format } from 'date-fns'

/**
 * Hourly slot grid for one date. `value` is {start, end} (end exclusive, 24h integers) or null.
 * Only consecutive slots can be selected: a click next to the selection extends it, a click on its
 * first/last slot shrinks it, anything else starts a new selection.
 */
export default function SlotPicker({ date, value, onChange }) {
  const { open_hour, close_hour } = getSettings()
  const taken = useMemo(() => bookedHours(date), [date])
  const isToday = date === todayISO()
  const hours = Array.from({ length: Math.max(0, close_hour - open_hour) }, (_, i) => open_hour + i)

  const state = (h) => {
    if (taken.has(h)) return 'booked'
    if (isToday && h <= istHour()) return 'past' // already started
    return 'free'
  }
  const selected = (h) => value && h >= value.start && h < value.end

  const click = (h) => {
    if (state(h) !== 'free') return
    if (!value) return onChange({ start: h, end: h + 1 })
    if (selected(h)) {
      if (value.end - value.start === 1) return onChange(null)
      if (h === value.start) return onChange({ start: h + 1, end: value.end })
      if (h === value.end - 1) return onChange({ start: value.start, end: h })
      return onChange({ start: h, end: h + 1 })
    }
    if (h === value.end) return onChange({ ...value, end: h + 1 })
    if (h === value.start - 1) return onChange({ ...value, start: h })
    onChange({ start: h, end: h + 1 })
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Hourly slots">
        {hours.map((h) => {
          const st = state(h)
          const on = selected(h)
          return (
            <button
              key={h} type="button" disabled={st !== 'free'} aria-pressed={on} onClick={() => click(h)}
              title={st === 'booked' ? 'Already booked' : st === 'past' ? 'Time has passed' : undefined}
              className={cn('h-10 rounded-md border text-body-sm font-medium transition-colors',
                on ? 'border-primary bg-primary text-white shadow-sm'
                  : st === 'free' ? 'border-success/40 bg-success-bg text-success-text hover:border-primary'
                    : st === 'booked' ? 'cursor-not-allowed border-danger/30 bg-danger-bg text-danger-text'
                      : 'cursor-not-allowed border-border bg-border-light text-text-tertiary')}
            >
              {slotLabel(h)}
            </button>
          )
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
        <Key cls="bg-success-bg border-success/40" label="Available" />
        <Key cls="bg-danger-bg border-danger/30" label="Booked" />
        <Key cls="bg-border-light border-border" label="Unavailable" />
        <Key cls="bg-primary border-primary" label="Selected" />
      </ul>
      {value && (
        <p className="mt-3 rounded-md bg-background px-3 py-2 text-body-sm">
          <b>{formatHour(value.start)}</b> to <b>{formatHour(value.end)}</b> · {formatDuration(value.end - value.start)}
          <span className="text-text-secondary"> · {format(new Date(`${date}T00:00`), 'dd MMM yyyy')}</span>
        </p>
      )}
    </div>
  )
}

function Key({ cls, label }) {
  return <li className="flex items-center gap-1.5"><span className={cn('size-3 rounded-sm border', cls)} />{label}</li>
}

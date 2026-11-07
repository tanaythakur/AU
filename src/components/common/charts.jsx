import { formatCompactINR, formatINR } from '@/utils/format'

export const CHART = {
  collections: '#16a34a',
  expenses: '#0f172a',
  palette: ['#16a34a', '#0ea5e9', '#f59e0b', '#8b5cf6', '#64748b', '#ef4444'],
  grid: '#e2e8f0',
  axis: '#94a3b8',
}

export const axisProps = { tick: { fontSize: 12, fill: CHART.axis }, tickLine: false, axisLine: false }
export const currencyAxis = { ...axisProps, tickFormatter: formatCompactINR, width: 52 }

export function ChartTooltip({ active, payload, label, currency = true }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm shadow-dropdown">
      {label && <p className="mb-1 font-medium text-text-primary">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey || p.name} className="flex items-center gap-2 text-text-secondary">
          <span className="size-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />
          {p.name}: <span className="font-medium text-text-primary">{currency ? formatINR(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  )
}

export function ChartLegend({ items }) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
      {items.map((it) => (
        <li key={it.name} className="flex items-center gap-1.5 text-body-sm text-text-secondary">
          <span className="size-2.5 rounded-sm" style={{ background: it.color }} />
          {it.name}
        </li>
      ))}
    </ul>
  )
}

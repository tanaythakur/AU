import { useMemo, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Badge, DataTable, EmptyState, FilterBar, FilterSelect, SearchInput } from '@/components/ui'
import { auditLog, useStore } from '@/services/store'
import { formatDateTime } from '@/utils/format'

const TONE = { create: 'success', update: 'info', delete: 'danger', refund: 'warning', cancel: 'warning', export: 'neutral' }

/** Latest 500 changes (create, edit, delete, refund, cancel, export). Not period-filtered. */
export default function AuditPage() {
  const v = useStore()
  const [q, setQ] = useState('')
  const [entity, setEntity] = useState('all')
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return auditLog.filter((a) => entity === 'all' || a.entity === entity).filter((a) => !t || a.summary.toLowerCase().includes(t) || a.code.toLowerCase().includes(t))
  }, [q, entity, v])

  const columns = [
    { key: 'at', header: 'When', render: (a) => formatDateTime(a.at) },
    { key: 'actor', header: 'By' },
    { key: 'entity', header: 'Record', render: (a) => <div><p className="font-medium capitalize">{a.entity}</p><p className="text-caption text-text-secondary">{a.code}</p></div> },
    { key: 'action', header: 'Action', render: (a) => <Badge tone={TONE[a.action]} className="capitalize">{a.action}</Badge> },
    { key: 'summary', header: 'What happened', className: 'whitespace-normal', render: (a) => <span className="inline-block min-w-48">{a.summary}</span> },
    {
      key: 'changes', header: 'Before → after', className: 'whitespace-normal',
      render: (a) => (a.changes && a.action !== 'delete'
        ? <ul className="min-w-48 text-caption text-text-secondary">{Object.entries(a.changes).map(([k, [b, n]]) => <li key={k}><b className="text-text-primary">{k}</b>: {String(b) || '—'} → {String(n) || '—'}</li>)}</ul>
        : <span className="text-text-tertiary">—</span>),
    },
  ]
  return (
    <>
      <p className="mb-6 max-w-2xl text-body text-text-secondary">A permanent trail of who changed financial records and when. Entries are written by the database and cannot be edited or deleted from the app.</p>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search summary or ID" />
        <FilterSelect label="Record" value={entity} onChange={setEntity} options={[{ value: 'all', label: 'All records' }, ...['payment', 'expense', 'income', 'booking', 'membership', 'student', 'plan', 'settings', 'export'].map((e) => ({ value: e, label: e[0].toUpperCase() + e.slice(1) }))]} />
      </FilterBar>
      <DataTable columns={columns} rows={rows} minWidth={900} pageSize={12}
        empty={<EmptyState icon={ShieldCheck} title="No changes recorded yet" description="Create, edit or delete a financial record and it will appear here." />} />
    </>
  )
}

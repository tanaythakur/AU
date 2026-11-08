import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ArrowDownToLine, ArrowUpFromLine, BookOpen, Download, Landmark } from 'lucide-react'
import { Button, DataTable, EmptyState, FilterBar, FilterSelect, SearchInput, StatCard } from '@/components/ui'
import { ledger } from '@/services/accounting'
import { useStore } from '@/services/store'
import { downloadCSV, formatDate, formatINR } from '@/utils/format'
import { usePageLoading } from '@/hooks/usePageLoading'

export default function LedgerPage() {
  const v = useStore()
  const { range } = useOutletContext()
  const loading = usePageLoading()
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const led = useMemo(() => ledger(range), [range, v])
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return led.rows.filter((x) => type === 'all' || (type === 'in' ? x.income > 0 : x.expense > 0)).filter((x) => !t || x.description.toLowerCase().includes(t) || x.tx.toLowerCase().includes(t))
  }, [led, q, type])

  const columns = [
    { key: 'date', header: 'Date', render: (x) => formatDate(x.date) },
    { key: 'tx', header: 'Transaction ID', render: (x) => <span className="font-medium">{x.tx}</span> },
    { key: 'description', header: 'Description', className: 'whitespace-normal', render: (x) => <span className="min-w-56 inline-block">{x.description}</span> },
    { key: 'income', header: 'Income', align: 'right', render: (x) => (x.income ? <span className="text-success-text">{formatINR(x.income)}</span> : <span className="text-text-tertiary">—</span>) },
    { key: 'expense', header: 'Expense', align: 'right', render: (x) => (x.expense ? <span className="text-danger-text">{formatINR(x.expense)}</span> : <span className="text-text-tertiary">—</span>) },
    { key: 'method', header: 'Method' },
    { key: 'balance', header: 'Running balance', align: 'right', render: (x) => <span className="font-semibold">{formatINR(x.balance)}</span> },
  ]

  return (
    <>
      <p className="mb-6 max-w-2xl text-body text-text-secondary">Every settled money movement, oldest first. Pending bills and unpaid balances are not in the ledger until they are paid.</p>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard variant="compact" loading={loading} label="Opening balance" value={formatINR(led.opening)} icon={BookOpen} tone="neutral" hint="Before this period" />
        <StatCard variant="compact" loading={loading} label="Total income" value={formatINR(led.totalIn)} icon={ArrowDownToLine} tone="primary" />
        <StatCard variant="compact" loading={loading} label="Total expense" value={formatINR(led.totalOut)} icon={ArrowUpFromLine} tone="danger" hint="Incl. refunds" />
        <StatCard variant="compact" loading={loading} label="Closing balance" value={formatINR(led.closing)} icon={Landmark} tone="info" />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search description or ID" />
        <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'Income & expense' }, { value: 'in', label: 'Income only' }, { value: 'out', label: 'Expense only' }]} />
        <Button variant="secondary" icon={Download} onClick={() => downloadCSV('ledger.csv', rows.map((x) => ({ date: x.date, id: x.tx, description: x.description, income: x.income, expense: x.expense, method: x.method, balance: x.balance })))}>CSV</Button>
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} minWidth={900} pageSize={15}
        empty={<EmptyState icon={BookOpen} title="No transactions" description="Nothing was received or paid in this period." />} />
    </>
  )
}

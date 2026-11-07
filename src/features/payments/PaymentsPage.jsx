import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Ellipsis, IndianRupee, Printer, RotateCcw } from 'lucide-react'
import {
  ConfirmDialog, DataTable, DropdownMenu, EmptyState, FilterBar, FilterSelect, Button, PageHeader, SearchInput, StatCard, StatusBadge, useToast,
} from '@/components/ui'
import { PAYMENT_METHODS, PERIOD_OPTIONS, methodLabel, payments } from '@/data/mock'
import { inRange, payerName, paymentLinkLabel, paymentType, periodRange, refundPayment, useStore } from '@/services/store'
import { downloadCSV, formatDateTime, formatINR } from '@/utils/format'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Ledger only. Payments are created where they are collected (student, membership, arena). */
export default function PaymentsPage() {
  useDocumentTitle('Payments')
  const v = useStore()
  const navigate = useNavigate()
  const toast = useToast()
  const loading = useSimulatedLoading()
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('this_month')
  const [type, setType] = useState('all')
  const [method, setMethod] = useState('all')
  const [status, setStatus] = useState('all')
  const [refunding, setRefunding] = useState(null)

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const range = periodRange(period)
    return payments
      .filter((p) => inRange(p.payment_date, range))
      .filter((p) => type === 'all' || (type === 'membership' ? !!p.student_id : !!p.arena_booking_id))
      .filter((p) => method === 'all' || p.payment_method === method)
      .filter((p) => status === 'all' || p.status === status)
      .map((p) => ({ ...p, payer: payerName(p), link: paymentLinkLabel(p), type: paymentType(p) }))
      .filter((p) => !t || p.payer.toLowerCase().includes(t) || p.receipt_number.toLowerCase().includes(t) || p.reference_number.toLowerCase().includes(t))
      .sort((a, b) => b.payment_date.localeCompare(a.payment_date))
  }, [q, period, type, method, status, v])

  const sum = (s) => rows.filter((p) => p.status === s).reduce((t, p) => t + p.amount, 0)

  const columns = [
    { key: 'payment_date', header: 'Date', sortable: true, render: (p) => formatDateTime(p.payment_date) },
    {
      key: 'payer', header: 'Person', sortable: true,
      render: (p) => (
        <Link to={p.student_id ? `/students/${p.student_id}` : '/arena'} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">{p.payer}</Link>
      ),
    },
    { key: 'type', header: 'Type', render: (p) => <div><p>{p.type}</p><p className="max-w-52 truncate text-caption text-text-secondary">{p.link}</p></div> },
    { key: 'amount', header: 'Amount', sortable: true, align: 'right', render: (p) => <span className="font-semibold">{formatINR(p.amount)}</span> },
    { key: 'payment_method', header: 'Method', render: (p) => methodLabel(p.payment_method) },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge status={p.status} /> },
    { key: 'reference', header: 'Reference', render: (p) => <span className="text-text-secondary">{p.reference_number || p.receipt_number}</span> },
    {
      key: 'actions', header: '', align: 'right', width: 56,
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu
            triggerClassName="inline-flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-border-light"
            trigger={() => <Ellipsis size={16} />}
            items={[
              { label: 'View receipt', icon: Printer, to: `/payments/${p.id}/receipt` },
              ...(p.status === 'completed' ? [{ divider: true }, { label: 'Mark as refunded', icon: RotateCcw, danger: true, onClick: () => setRefunding(p) }] : []),
            ]}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Payments"
        description="Transaction history. New payments are collected from Students and Arena."
        actions={<Button variant="secondary" icon={Download} onClick={() => downloadCSV('payments.csv', rows.map((p) => ({ receipt: p.receipt_number, date: p.payment_date, person: p.payer, type: p.type, related_to: p.link, amount: p.amount, method: methodLabel(p.payment_method), reference: p.reference_number, status: p.status })))}>Export</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard variant="compact" label="Collected" value={formatINR(sum('completed'))} icon={IndianRupee} tone="primary" loading={loading} hint="Completed payments in filter" />
        <StatCard variant="compact" label="Refunded" value={formatINR(sum('refunded'))} tone="neutral" icon={RotateCcw} loading={loading} hint="Excluded from collections" />
        <StatCard variant="compact" label="Transactions" value={rows.length} tone="info" icon={IndianRupee} loading={loading} />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search person, receipt or reference" />
        <FilterSelect label="Period" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
        <FilterSelect label="Type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, { value: 'membership', label: 'Membership' }, { value: 'arena', label: 'Arena booking' }]} />
        <FilterSelect label="Method" value={method} onChange={setMethod} options={[{ value: 'all', label: 'All methods' }, ...PAYMENT_METHODS]} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'completed', label: 'Completed' }, { value: 'refunded', label: 'Refunded' }]} />
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} minWidth={980} onRowClick={(p) => navigate(`/payments/${p.id}/receipt`)}
        empty={<EmptyState icon={IndianRupee} title="No payments found" description="No transaction matches your filters." />} />
      <ConfirmDialog
        open={!!refunding} onClose={() => setRefunding(null)} title="Mark as refunded?"
        message={`${refunding?.receipt_number} (${formatINR(refunding?.amount)}) will stay in the ledger as refunded and stop counting as cash collected.`}
        confirmLabel="Mark refunded"
        onConfirm={() => { refundPayment(refunding.id); toast.success('Payment marked as refunded.'); setRefunding(null) }}
      />
    </>
  )
}

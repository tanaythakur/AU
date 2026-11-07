import { todayISO } from '@/utils/format'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Download, IndianRupee, MessageCircle, Plus, Trophy, X } from 'lucide-react'
import { Button, ConfirmDialog, DataTable, EmptyState, FilterBar, PageHeader, SearchInput, StatCard, StatusBadge, useToast } from '@/components/ui'
import { bookings } from '@/data/mock'
import { cancelBooking, enrichBooking, useStore } from '@/services/store'
import { downloadCSV, formatDate, formatHour, formatINR } from '@/utils/format'
import { bookingWhatsApp } from './whatsapp'
import { cn } from '@/utils/cn'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import BookingDrawer from './BookingDrawer'
import CollectDrawer from '@/features/payments/CollectDrawer'

const FILTERS = [{ key: 'all', label: 'All' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'due', label: 'Balance due' }]

export default function ArenaPage() {
  useDocumentTitle('Arena Bookings')
  const v = useStore()
  const toast = useToast()
  const loading = useSimulatedLoading()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [params, setParams] = useSearchParams()
  const newOpen = params.get('new') === '1'
  const setNewOpen = (o) => setParams(o ? { new: '1' } : {}, { replace: true })
  const [collect, setCollect] = useState(null)
  const [cancelling, setCancelling] = useState(null)

  const all = useMemo(() => bookings.map(enrichBooking).sort((a, b) => b.booking_date.localeCompare(a.booking_date) || b.start_hour - a.start_hour), [v])
  const today = todayISO()
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return all
      .filter((b) => !t || b.customer_name.toLowerCase().includes(t) || b.mobile.includes(t))
      .filter((b) => (filter === 'upcoming' ? b.booking_date >= today : filter === 'due' ? b.balance > 0 : true))
  }, [all, q, filter, today])

  const totals = {
    count: all.filter((b) => b.status !== 'cancelled').length,
    booked: all.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + b.total_amount, 0),
    paid: all.filter((b) => b.status !== 'cancelled').reduce((s, b) => s + b.paid, 0),
    due: all.reduce((s, b) => s + b.balance, 0),
  }

  const columns = [
    { key: 'booking_date', header: 'Date & time', sortable: true, render: (b) => <div><p>{formatDate(b.booking_date)}</p><p className="text-caption text-text-secondary">{formatHour(b.start_hour)} – {formatHour(b.end_hour)} · {b.hours}h</p></div> },
    { key: 'customer_name', header: 'Customer', sortable: true, render: (b) => <div><p className="font-medium">{b.customer_name}</p><p className="text-caption text-text-secondary">{b.mobile}</p></div> },
    { key: 'total_amount', header: 'Total', sortable: true, align: 'right', render: (b) => formatINR(b.total_amount) },
    { key: 'paid', header: 'Paid', align: 'right', render: (b) => formatINR(b.paid) },
    { key: 'balance', header: 'Balance', sortable: true, align: 'right', render: (b) => <span className={b.balance > 0 ? 'font-semibold text-danger-text' : 'text-text-secondary'}>{formatINR(b.balance)}</span> },
    { key: 'pay_status', header: 'Status', render: (b) => <StatusBadge status={b.pay_status} /> },
    {
      key: 'a', header: '', align: 'right',
      render: (b) => (
        <div className="flex items-center justify-end gap-1">
          {b.balance > 0 && <Button size="sm" variant="secondary" icon={IndianRupee} onClick={() => setCollect({ bookingId: b.id })}>Collect</Button>}
          {b.status !== 'cancelled' && b.booking_date >= today && <Button size="sm" variant="ghost" icon={X} onClick={() => setCancelling(b)} aria-label={`Cancel booking ${b.customer_name}`}>Cancel</Button>}
          <Button size="sm" variant="ghost" icon={MessageCircle} as="a" href={bookingWhatsApp(b)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${b.customer_name}`}>WhatsApp</Button>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Arena bookings"
        description="Hourly slots with advance and balance."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => downloadCSV('arena-bookings.csv', rows.map((b) => ({ date: b.booking_date, customer: b.customer_name, mobile: b.mobile, start: formatHour(b.start_hour), end: formatHour(b.end_hour), notes: b.details, total: b.total_amount, paid: b.paid, balance: b.balance })))}>Export</Button>
            <Button icon={Plus} onClick={() => setNewOpen(true)}>New Booking</Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard variant="compact" loading={loading} label="Bookings" value={totals.count} icon={Trophy} />
        <StatCard variant="compact" loading={loading} label="Total booked" value={formatINR(totals.booked)} tone="info" icon={IndianRupee} />
        <StatCard variant="compact" loading={loading} label="Received" value={formatINR(totals.paid)} tone="primary" icon={IndianRupee} />
        <StatCard variant="compact" loading={loading} label="Balance due" value={formatINR(totals.due)} tone="warning" icon={IndianRupee} />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search name or mobile" />
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={cn('rounded-full border px-3 py-1 text-body-sm font-medium', filter === f.key ? 'border-primary bg-success-bg text-success-text' : 'border-border-heavy bg-surface text-text-secondary hover:bg-background')}>{f.label}</button>
          ))}
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} minWidth={960}
        empty={<EmptyState icon={Trophy} title="No bookings" description="Create a booking in a few seconds." action={<Button icon={Plus} onClick={() => setNewOpen(true)}>New Booking</Button>} />} />
      <BookingDrawer open={newOpen} onClose={() => setNewOpen(false)} />
      <CollectDrawer target={collect} onClose={() => setCollect(null)} />
      <ConfirmDialog open={!!cancelling} onClose={() => setCancelling(null)} title="Cancel this booking?"
        message={`${cancelling?.customer_name}, ${cancelling ? formatDate(cancelling.booking_date) : ''} ${cancelling ? formatHour(cancelling.start_hour) + ' – ' + formatHour(cancelling.end_hour) : ''}. The time slots become available again. Any payment already received stays in the ledger; mark it refunded in Payments if you return the money.`}
        confirmLabel="Cancel booking" onConfirm={() => { cancelBooking(cancelling.id); toast.success('Booking cancelled. Slots released.'); setCancelling(null) }} />
    </>
  )
}

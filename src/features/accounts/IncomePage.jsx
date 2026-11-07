import { useMemo, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Coins, Download, Eye, HandCoins, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import {
  Button, ConfirmDialog, DataTable, EmptyState, FilterBar, FilterSelect, FormField, IconButton, Input, Modal, SearchInput, Select, StatCard, StatusBadge, Textarea, useToast,
} from '@/components/ui'
import { INCOME_CATEGORIES, PAYMENT_METHODS } from '@/data/mock'
import { incomeRecords } from '@/services/accounting'
import { deleteIncome, markIncomeReceived, saveIncome, useStore } from '@/services/store'
import { downloadCSV, formatDate, formatINR, todayISO } from '@/utils/format'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'

const CATS = ['Student fees', 'Arena bookings', ...INCOME_CATEGORIES]

export default function IncomePage() {
  const v = useStore()
  const { range } = useOutletContext()
  const loading = useSimulatedLoading(300)
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState(params.get('new') === '1' ? 'new' : null) // raw income entry | 'new'
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const close = () => { setEditing(null); if (params.get('new')) setParams({}, { replace: true }) }

  const all = useMemo(() => incomeRecords(range), [range, v])
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return all
      .filter((x) => cat === 'all' || x.category === cat)
      .filter((x) => status === 'all' || x.status === status)
      .filter((x) => !t || [x.title, x.code, x.reference, x.description].some((s) => (s || '').toLowerCase().includes(t)))
  }, [all, q, cat, status])
  const tot = (k) => rows.reduce((t, x) => t + x[k], 0)
  const methodName = (m) => PAYMENT_METHODS.find((x) => x.value === m)?.label || '—'

  const columns = [
    { key: 'code', header: 'ID', sortable: true, render: (x) => <span className="font-medium">{x.code}</span> },
    { key: 'title', header: 'Income', sortable: true, className: 'whitespace-normal', render: (x) => <div className="min-w-48"><p className="font-medium">{x.title}</p><p className="text-caption text-text-secondary">{x.category}</p></div> },
    { key: 'date', header: 'Date', sortable: true, render: (x) => formatDate(x.date) },
    { key: 'amount', header: 'Amount', sortable: true, align: 'right', render: (x) => <span className="font-semibold">{formatINR(x.amount)}</span> },
    { key: 'received', header: 'Received', align: 'right', render: (x) => formatINR(x.received) },
    { key: 'balance', header: 'Pending', align: 'right', render: (x) => <span className={x.balance > 0 ? 'font-medium text-danger-text' : 'text-text-tertiary'}>{formatINR(x.balance)}</span> },
    { key: 'method', header: 'Method', render: (x) => methodName(x.method) },
    { key: 'status', header: 'Status', render: (x) => <StatusBadge status={x.status} /> },
    {
      key: 'a', header: '', align: 'right',
      render: (x) => (
        <div className="flex items-center justify-end gap-0.5">
          <IconButton icon={Eye} label="View" size="sm" onClick={() => setViewing(x)} />
          {x.kind === 'manual' && <>
            {x.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => { markIncomeReceived(x.id); toast.success('Marked as received.') }}>Received</Button>}
            <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => setEditing(x.raw)} />
            <IconButton icon={Trash2} label="Delete" size="sm" onClick={() => setDeleting(x)} />
          </>}
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-body text-text-secondary">Fees and arena bookings appear here automatically. Add anything else (tournaments, sponsors) as manual income.</p>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Download} onClick={() => downloadCSV('income-register.csv', rows.map((x) => ({ id: x.code, title: x.title, category: x.category, amount: x.amount, received: x.received, pending: x.balance, date: x.date, method: methodName(x.method), status: x.status, reference: x.reference })))}>CSV</Button>
          <Button icon={Plus} onClick={() => setEditing('new')}>Add Income</Button>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard variant="compact" loading={loading} label="Total income" value={formatINR(tot('amount'))} icon={Coins} tone="primary" hint="In current filter" />
        <StatCard variant="compact" loading={loading} label="Received" value={formatINR(tot('received'))} icon={Wallet} tone="info" />
        <StatCard variant="compact" loading={loading} label="Pending" value={formatINR(tot('balance'))} icon={HandCoins} tone="warning" />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search title, ID or reference" />
        <FilterSelect label="Category" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...CATS.map((c) => ({ value: c, label: c }))]} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partial' }, { value: 'pending', label: 'Pending' }, { value: 'cancelled', label: 'Cancelled' }]} />
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} rowKey={(x) => x.code} minWidth={1020} pageSize={12} initialSort={{ key: 'date', dir: 'desc' }}
        empty={<EmptyState icon={Coins} title="No income in this period" description="Change the period or add an income entry." action={<Button icon={Plus} onClick={() => setEditing('new')}>Add Income</Button>} />} />

      {editing && <IncomeModal entry={editing === 'new' ? null : editing} onClose={close} />}
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="sm" title={viewing?.title} description={viewing?.code}
        footer={<>{viewing?.kind === 'membership' && <Button as={Link} to={`/students/${viewing.student_id}`} variant="secondary">Open student</Button>}{viewing?.kind === 'arena' && <Button as={Link} to="/arena" variant="secondary">Open arena bookings</Button>}<Button onClick={() => setViewing(null)}>Close</Button></>}>
        {viewing && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body">
            {[['Category', viewing.category], ['Date', formatDate(viewing.date)], ['Amount', formatINR(viewing.amount)], ['Received', formatINR(viewing.received)], ['Pending', formatINR(viewing.balance)], ['Method', methodName(viewing.method)], ['Status', <StatusBadge key="s" status={viewing.status} />], ['Reference', viewing.reference || '—']].map(([k, val]) => <div key={k}><dt className="text-caption text-text-secondary">{k}</dt><dd>{val}</dd></div>)}
            <div className="col-span-2"><dt className="text-caption text-text-secondary">Description</dt><dd>{viewing.description || '—'}</dd></div>
            {viewing.kind !== 'manual' && <p className="col-span-2 text-caption text-text-secondary">This record is created automatically from {viewing.kind === 'membership' ? 'the membership' : 'the booking'}. Collect balances from the student or arena screen so payments are never entered twice.</p>}
          </dl>
        )}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete this income entry?"
        message={`${deleting?.title} (${formatINR(deleting?.amount)}) will be removed from reports. The deletion is recorded in the audit log.`} confirmLabel="Delete"
        onConfirm={() => { deleteIncome(deleting.id); toast.success('Income entry deleted.'); setDeleting(null) }} />
    </>
  )
}

function IncomeModal({ entry, onClose }) {
  const toast = useToast()
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: entry || { title: '', category: INCOME_CATEGORIES[0], amount: '', income_date: todayISO(), status: 'paid', payment_method: 'cash', reference: '', description: '' },
  })
  const status = watch('status')
  const save = async (d) => {
    try {
      await new Promise((r) => setTimeout(r, 250))
      saveIncome(d, entry?.id)
      toast.success(entry ? 'Income updated.' : 'Income added.')
      onClose()
    } catch (e) { toast.error(e.message) }
  }
  return (
    <Modal open onClose={onClose} title={entry ? `Edit ${entry.code}` : 'Add income'} description="Student fees and arena payments are recorded automatically elsewhere."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={handleSubmit(save)}>Save income</Button></>}>
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(save)}>
        <FormField label="Income title" required error={errors.title?.message} className="sm:col-span-2"><Input autoFocus error={errors.title} {...register('title', { required: 'Enter a title' })} /></FormField>
        <FormField label="Category" required><Select {...register('category')}>{INCOME_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></FormField>
        <FormField label="Amount (₹)" required error={errors.amount?.message}><Input type="number" min="1" step="0.01" error={errors.amount} {...register('amount', { required: 'Enter the amount', min: { value: 0.01, message: 'Must be more than 0' } })} /></FormField>
        <FormField label="Transaction date" required error={errors.income_date?.message}><Input type="date" error={errors.income_date} {...register('income_date', { required: 'Required' })} /></FormField>
        <FormField label="Payment status"><Select {...register('status')}><option value="paid">Paid (cash received)</option><option value="pending">Pending (not received yet)</option><option value="cancelled">Cancelled</option></Select></FormField>
        {status === 'paid' && <FormField label="Payment method"><Select {...register('payment_method')}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></FormField>}
        <FormField label="Reference / order ID"><Input {...register('reference')} /></FormField>
        <FormField label="Description" className="sm:col-span-2"><Textarea rows={2} {...register('description')} /></FormField>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}


import { useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Banknote, Download, Eye, HandCoins, Paperclip, Pencil, Plus, Receipt, Trash2 } from 'lucide-react'
import {
  Button, ConfirmDialog, DataTable, EmptyState, FilterBar, FilterSelect, FormField, IconButton, Input, Modal, SearchInput, Select, StatCard, StatusBadge, Textarea, useToast,
} from '@/components/ui'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/data/mock'
import { expenseRecords } from '@/services/accounting'
import { deleteExpense, saveExpense, useStore } from '@/services/store'
import { downloadCSV, formatDate, formatINR, todayISO } from '@/utils/format'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'

const MAX_FILE = 2 * 1024 * 1024
const methodName = (m) => PAYMENT_METHODS.find((x) => x.value === m)?.label || '—'

export default function ExpensesPage() {
  const v = useStore()
  const { range } = useOutletContext()
  const loading = useSimulatedLoading(300)
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('all')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState(params.get('new') === '1' ? 'new' : null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const close = () => { setEditing(null); if (params.get('new')) setParams({}, { replace: true }) }

  const all = useMemo(() => expenseRecords(range), [range, v])
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return all
      .filter((e) => cat === 'all' || e.category === cat)
      .filter((e) => status === 'all' || e.status === status)
      .filter((e) => !t || [e.name, e.vendor, e.reason, e.code].some((s) => (s || '').toLowerCase().includes(t)))
  }, [all, q, cat, status])
  const total = rows.reduce((t, e) => t + e.amount, 0)
  const pending = rows.filter((e) => e.status === 'pending').reduce((t, e) => t + e.amount, 0)

  const columns = [
    { key: 'code', header: 'ID', sortable: true, render: (e) => <span className="font-medium">{e.code}</span> },
    { key: 'name', header: 'Expense', sortable: true, className: 'whitespace-normal', render: (e) => <div className="min-w-44"><p className="font-medium">{e.name}</p><p className="text-caption text-text-secondary">{e.category}{e.vendor ? ` · ${e.vendor}` : ''}</p></div> },
    { key: 'expense_date', header: 'Date', sortable: true, render: (e) => formatDate(e.expense_date) },
    { key: 'amount', header: 'Amount', sortable: true, align: 'right', render: (e) => <span className="font-semibold">{formatINR(e.amount)}</span> },
    { key: 'payment_method', header: 'Method', render: (e) => methodName(e.payment_method) },
    { key: 'status', header: 'Status', render: (e) => <StatusBadge status={e.status} /> },
    { key: 'attachment', header: 'Bill', render: (e) => (e.attachment ? <Paperclip size={15} className="text-info-text" aria-label="Has attachment" /> : <span className="text-text-tertiary">—</span>) },
    {
      key: 'a', header: '', align: 'right',
      render: (e) => (
        <div className="flex items-center justify-end gap-0.5">
          {e.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => setEditing({ ...e, status: 'paid', payment_method: 'cash', paid_date: todayISO() })}>Pay</Button>}
          <IconButton icon={Eye} label="View" size="sm" onClick={() => setViewing(e)} />
          <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => setEditing(e)} />
          <IconButton icon={Trash2} label="Delete" size="sm" onClick={() => setDeleting(e)} />
        </div>
      ),
    },
  ]

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-body text-text-secondary">A bill counts as an expense on its date. It becomes cash paid only once marked as paid.</p>
        <div className="flex gap-2">
          <Button variant="secondary" icon={Download} onClick={() => downloadCSV('expense-register.csv', rows.map((e) => ({ id: e.code, title: e.name, category: e.category, amount: e.amount, date: e.expense_date, method: methodName(e.payment_method), vendor: e.vendor, status: e.status, description: e.reason })))}>CSV</Button>
          <Button icon={Plus} onClick={() => setEditing('new')}>Add Expense</Button>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard variant="compact" loading={loading} label="Total expenses" value={formatINR(total)} icon={Banknote} tone="danger" hint="In current filter" />
        <StatCard variant="compact" loading={loading} label="Paid" value={formatINR(total - pending)} icon={Receipt} tone="neutral" />
        <StatCard variant="compact" loading={loading} label="Pending payables" value={formatINR(pending)} icon={HandCoins} tone="warning" />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search title, vendor or ID" />
        <FilterSelect label="Category" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c.name, label: c.name }))]} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Paid & pending' }, { value: 'paid', label: 'Paid' }, { value: 'pending', label: 'Pending' }]} />
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} minWidth={980} pageSize={12} initialSort={{ key: 'expense_date', dir: 'desc' }}
        empty={<EmptyState icon={Receipt} title="No expenses in this period" action={<Button icon={Plus} onClick={() => setEditing('new')}>Add Expense</Button>} />} />

      {editing && <ExpenseModal expense={editing === 'new' ? null : editing} onClose={close} />}
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="sm" title={viewing?.name} description={viewing?.code} footer={<Button onClick={() => setViewing(null)}>Close</Button>}>
        {viewing && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-body">
            {[['Category', viewing.category], ['Amount', formatINR(viewing.amount)], ['Date', formatDate(viewing.expense_date)], ['Status', <StatusBadge key="s" status={viewing.status} />], ['Method', methodName(viewing.payment_method)], ['Paid on', formatDate(viewing.paid_date)], ['Vendor / payee', viewing.vendor || '—'], ['Quantity', viewing.quantity || '—']].map(([k, val]) => <div key={k}><dt className="text-caption text-text-secondary">{k}</dt><dd>{val}</dd></div>)}
            <div className="col-span-2"><dt className="text-caption text-text-secondary">Description</dt><dd>{viewing.reason || '—'}</dd></div>
            <div className="col-span-2"><dt className="text-caption text-text-secondary">Bill / receipt</dt><dd>{viewing.attachment ? <a href={viewing.attachment.url} download={viewing.attachment.name} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">{viewing.attachment.name}</a> : '—'}</dd></div>
          </dl>
        )}
      </Modal>
      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} title="Delete this expense?"
        message={`${deleting?.name} (${formatINR(deleting?.amount)}) will be removed from reports and the ledger. The deletion is recorded in the audit log.`} confirmLabel="Delete"
        onConfirm={() => { deleteExpense(deleting.id); toast.success('Expense deleted.'); setDeleting(null) }} />
    </>
  )
}

function ExpenseModal({ expense, onClose }) {
  const toast = useToast()
  const [attachment, setAttachment] = useState(expense?.attachment ?? null)
  const [fileError, setFileError] = useState('')
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: expense || { name: '', category: 'Miscellaneous', amount: '', expense_date: todayISO(), status: 'paid', payment_method: 'cash', vendor: '', reason: '', quantity: '' },
  })
  const status = watch('status')

  const onFile = (e) => {
    const file = e.target.files?.[0]
    setFileError('')
    if (!file) return
    if (file.size > MAX_FILE) return setFileError('File is larger than 2 MB.')
    const reader = new FileReader()
    reader.onload = () => setAttachment({ name: file.name, type: file.type, url: reader.result })
    reader.readAsDataURL(file)
  }
  const save = async (d) => {
    try {
      await new Promise((r) => setTimeout(r, 250))
      saveExpense({ ...d, attachment }, expense?.id)
      toast.success(expense ? 'Expense updated.' : 'Expense added.')
      onClose()
    } catch (err) { toast.error(err.message) }
  }
  return (
    <Modal open onClose={onClose} title={expense ? `Edit ${expense.code}` : 'Add expense'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={handleSubmit(save)}>Save expense</Button></>}>
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit(save)}>
        <FormField label="Expense title" required error={errors.name?.message} className="sm:col-span-2"><Input autoFocus error={errors.name} {...register('name', { required: 'Enter a title' })} /></FormField>
        <FormField label="Category" required><Select {...register('category')}>{EXPENSE_CATEGORIES.map((c) => <option key={c.name}>{c.name}</option>)}</Select></FormField>
        <FormField label="Amount (₹)" required error={errors.amount?.message}><Input type="number" min="1" step="0.01" error={errors.amount} {...register('amount', { required: 'Enter the amount', min: { value: 0.01, message: 'Must be more than 0' } })} /></FormField>
        <FormField label="Date" required error={errors.expense_date?.message}><Input type="date" error={errors.expense_date} {...register('expense_date', { required: 'Required' })} /></FormField>
        <FormField label="Payment status"><Select {...register('status')}><option value="paid">Paid</option><option value="pending">Pending (bill not paid yet)</option></Select></FormField>
        {status === 'paid' && <FormField label="Payment method"><Select {...register('payment_method')}>{PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</Select></FormField>}
        {status === 'paid' && <FormField label="Paid on"><Input type="date" {...register('paid_date')} /></FormField>}
        <FormField label="Vendor / payee"><Input {...register('vendor')} /></FormField>
        <FormField label="Quantity" hint="Optional note only"><Input type="number" min="1" {...register('quantity')} /></FormField>
        <FormField label="Description" className="sm:col-span-2"><Textarea rows={2} {...register('reason')} /></FormField>
        <FormField label="Bill / receipt" hint="Image or PDF, up to 2 MB" error={fileError} className="sm:col-span-2">
          <input type="file" accept="image/*,application/pdf" onChange={onFile} className="text-body-sm file:mr-3 file:rounded-md file:border file:border-border-heavy file:bg-surface file:px-3 file:py-1.5 file:text-body-sm" />
          {attachment && <p className="mt-1 flex items-center gap-2 text-body-sm"><Paperclip size={14} />{attachment.name}<button type="button" onClick={() => setAttachment(null)} className="text-danger-text underline">Remove</button></p>}
        </FormField>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

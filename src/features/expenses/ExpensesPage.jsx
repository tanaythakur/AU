import { todayISO } from '@/utils/format'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Banknote, Download, Pencil, Plus, Receipt } from 'lucide-react'
import {
  Button, DataTable, EmptyState, FilterBar, FilterSelect, IconButton, Modal, PageHeader, SearchInput, StatCard, Input, FormField, useToast,
} from '@/components/ui'
import { PERIOD_OPTIONS, expenses } from '@/data/mock'
import { inRange, periodRange, saveExpense, useStore } from '@/services/store'
import { downloadCSV, formatDate, formatINR } from '@/utils/format'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function ExpensesPage() {
  useDocumentTitle('Expenses')
  const v = useStore()
  const loading = useSimulatedLoading()
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('this_month')
  const [params, setParams] = useSearchParams()
  const [editing, setEditingState] = useState(params.get('new') === '1' ? 'new' : null) // expense | 'new'
  const setEditing = (e) => { setEditingState(e); if (params.get('new')) setParams({}, { replace: true }) }

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const range = periodRange(period)
    return expenses.filter((e) => inRange(e.expense_date, range)).filter((e) => !t || e.name.toLowerCase().includes(t) || e.reason.toLowerCase().includes(t))
  }, [q, period, v])
  const total = rows.reduce((s, e) => s + e.amount, 0)

  const columns = [
    { key: 'expense_date', header: 'Date', sortable: true, render: (e) => formatDate(e.expense_date) },
    { key: 'name', header: 'Expense', sortable: true, render: (e) => <span className="font-medium">{e.name}</span> },
    { key: 'quantity', header: 'Qty', align: 'right', render: (e) => e.quantity || <span className="text-text-tertiary">—</span> },
    { key: 'reason', header: 'Reason', className: 'whitespace-normal', render: (e) => <span className="text-text-secondary">{e.reason || '—'}</span> },
    { key: 'amount', header: 'Amount', sortable: true, align: 'right', render: (e) => <span className="font-semibold">{formatINR(e.amount)}</span> },
    { key: 'a', header: '', align: 'right', width: 56, render: (e) => <IconButton icon={Pencil} label="Edit expense" size="sm" onClick={() => setEditing(e)} /> },
  ]

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Every saved expense feeds the dashboard and reports."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => downloadCSV('expenses.csv', rows.map((e) => ({ date: e.expense_date, name: e.name, quantity: e.quantity, reason: e.reason, amount: e.amount })))}>Export</Button>
            <Button icon={Plus} onClick={() => setEditing('new')}>Add Expense</Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatCard variant="compact" loading={loading} label="Total expenses" value={formatINR(total)} icon={Banknote} hint="In selected period" />
        <StatCard variant="compact" loading={loading} label="Entries" value={rows.length} icon={Receipt} tone="info" />
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search expense or reason" />
        <FilterSelect label="Period" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} minWidth={760}
        empty={<EmptyState icon={Receipt} title="No expenses" description="Nothing recorded for this period." action={<Button icon={Plus} onClick={() => setEditing('new')}>Add Expense</Button>} />} />
      {editing && <ExpenseModal expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ExpenseModal({ expense, onClose }) {
  const toast = useToast()
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    defaultValues: {
      name: expense?.name || '', amount: expense?.amount || '', expense_date: expense?.expense_date || todayISO(),
      quantity: expense?.quantity || '', reason: expense?.reason || '',
    },
  })
  const save = async (d) => {
    await new Promise((r) => setTimeout(r, 300))
    saveExpense(d, expense?.id)
    toast.success(expense ? 'Expense updated.' : 'Expense added.')
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="sm" title={expense ? 'Edit expense' : 'Add expense'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={handleSubmit(save)}>Save expense</Button></>}>
      <form noValidate className="grid gap-4" onSubmit={handleSubmit(save)}>
        <FormField label="Expense / purchase name" required error={errors.name?.message}>
          <Input autoFocus placeholder="e.g. Cricket balls, Electricity bill" error={errors.name} {...register('name', { required: 'Enter a name' })} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Amount (₹)" required error={errors.amount?.message}>
            <Input type="number" inputMode="numeric" min="1" error={errors.amount} {...register('amount', { required: 'Enter the amount', min: { value: 1, message: 'Must be more than 0' } })} />
          </FormField>
          <FormField label="Date" required error={errors.expense_date?.message}>
            <Input type="date" error={errors.expense_date} {...register('expense_date', { required: 'Required' })} />
          </FormField>
        </div>
        <FormField label="Quantity" hint="Optional. Only a note, stock is not tracked."><Input type="number" min="1" {...register('quantity')} /></FormField>
        <FormField label="Reason"><Input placeholder="Optional" {...register('reason')} /></FormField>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  )
}

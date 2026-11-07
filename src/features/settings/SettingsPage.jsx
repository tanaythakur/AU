import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Pencil, Plus } from 'lucide-react'
import { Button, Card, CardHeader, Checkbox, DataTable, FormField, Input, Modal, PageHeader, StatusBadge, useToast } from '@/components/ui'
import { plans } from '@/data/mock'
import { getSettings, savePlan, updateSettings, useStore } from '@/services/store'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'
import { useAuth } from '@/features/auth/AuthContext'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const SECTIONS = [
  { key: 'academy', label: 'Academy & payments' },
  { key: 'plans', label: 'Membership plans' },
  { key: 'admin', label: 'Admin account' },
]

export default function SettingsPage() {
  useDocumentTitle('Settings')
  const [section, setSection] = useState('academy')
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {SECTIONS.map((s) => (
            <button key={s.key} onClick={() => setSection(s.key)}
              className={cn('whitespace-nowrap rounded-md px-3 py-2 text-left text-body font-medium transition-colors',
                section === s.key ? 'bg-success-bg text-success-text' : 'text-text-secondary hover:bg-border-light hover:text-text-primary')}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          {section === 'academy' && <AcademyForm />}
          {section === 'plans' && <PlansSection />}
          {section === 'admin' && <AdminForm />}
        </div>
      </div>
    </>
  )
}

function AcademyForm() {
  const toast = useToast()
  const s = getSettings()
  const { register, handleSubmit, formState: { errors } } = useForm({ defaultValues: s })
  return (
    <Card>
      <CardHeader title="Academy & payments" description="Used on receipts, WhatsApp messages and the payment QR code." />
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={handleSubmit((d) => { updateSettings({ ...d, hourly_rate: Number(d.hourly_rate), open_hour: Number(d.open_hour), close_hour: Number(d.close_hour) }); toast.success('Settings saved.') })}>
        <FormField label="Academy name" required error={errors.name?.message} className="sm:col-span-2">
          <Input error={errors.name} {...register('name', { required: 'Academy name is required' })} />
        </FormField>
        <FormField label="Contact phone" hint="Shown in booking confirmations"><Input inputMode="tel" {...register('phone')} /></FormField>
        <FormField label="UPI ID" hint="Creates the payment QR. Example: academy@upi" error={errors.upi_id?.message}>
          <Input error={errors.upi_id} {...register('upi_id', { pattern: { value: /^[\w.-]+@[\w.-]+$/, message: 'Enter a valid UPI ID' } })} />
        </FormField>
        <FormField label="Address" className="sm:col-span-2"><Input {...register('address')} /></FormField>
        <div className="sm:col-span-2 border-t border-border-light pt-4"><h3 className="text-body font-semibold">Arena slots</h3></div>
        <FormField label="Hourly rate (₹)" hint="Total = hours × rate. The admin can still override it per booking." error={errors.hourly_rate?.message}>
          <Input type="number" min="0" error={errors.hourly_rate} {...register('hourly_rate', { required: 'Enter a rate', min: { value: 0, message: 'Cannot be negative' } })} />
        </FormField>
        <div />
        <FormField label="Opens at (hour, 0–23)" error={errors.open_hour?.message}>
          <Input type="number" min="0" max="23" error={errors.open_hour} {...register('open_hour', { required: 'Required', min: 0, max: 23 })} />
        </FormField>
        <FormField label="Closes at (hour, 1–24)" hint="Last slot ends at this hour. 22 = 10 PM" error={errors.close_hour?.message}>
          <Input type="number" min="1" max="24" error={errors.close_hour} {...register('close_hour', { required: 'Required', validate: (v, f) => Number(v) > Number(f.open_hour) || 'Must be after opening' })} />
        </FormField>
        <div className="sm:col-span-2"><Button type="submit">Save changes</Button></div>
      </form>
    </Card>
  )
}

function AdminForm() {
  const toast = useToast()
  const { user } = useAuth()
  const pw = useForm()
  return (
    <Card>
      <CardHeader title="Admin account" description={user?.email} />
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={pw.handleSubmit(() => { toast.success('Password updated (demo, Supabase Auth later).'); pw.reset() })}>
        <FormField label="New password" required error={pw.formState.errors.password?.message}>
          <Input type="password" autoComplete="new-password" error={pw.formState.errors.password} {...pw.register('password', { required: 'Enter a new password', minLength: { value: 8, message: 'Use at least 8 characters' } })} />
        </FormField>
        <FormField label="Confirm password" required error={pw.formState.errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" error={pw.formState.errors.confirm} {...pw.register('confirm', { validate: (v) => v === pw.getValues('password') || 'Passwords do not match' })} />
        </FormField>
        <div className="sm:col-span-2"><Button type="submit" variant="secondary">Update password</Button></div>
      </form>
    </Card>
  )
}

function PlansSection() {
  useStore()
  const toast = useToast()
  const [editing, setEditing] = useState(null) // plan | 'new'
  const { register, handleSubmit, reset, formState: { errors } } = useForm()
  const open = (p) => {
    reset(p === 'new' ? { name: '', duration_months: '', standard_price: '', description: '', is_active: true } : p)
    setEditing(p)
  }
  const save = (d) => {
    savePlan(d, editing === 'new' ? undefined : editing.id)
    toast.success('Plan saved. New price applies to future memberships only.')
    setEditing(null)
  }
  const cols = [
    { key: 'name', header: 'Plan', render: (p) => <span className="font-medium">{p.name}</span> },
    { key: 'duration_months', header: 'Duration', render: (p) => `${p.duration_months} month${p.duration_months > 1 ? 's' : ''}` },
    { key: 'standard_price', header: 'Price', align: 'right', render: (p) => formatINR(p.standard_price) },
    { key: 'is_active', header: 'Status', render: (p) => <StatusBadge status={p.is_active ? 'active' : 'inactive'} /> },
    { key: 'a', header: '', align: 'right', render: (p) => <Button size="sm" variant="secondary" icon={Pencil} onClick={() => open(p)}>Edit</Button> },
  ]
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h2 className="text-h3">Membership plans</h2><p className="text-body-sm text-text-secondary">Price changes apply to future memberships only. Past memberships keep their price.</p></div>
        <Button icon={Plus} onClick={() => open('new')}>Add Plan</Button>
      </div>
      <DataTable columns={cols} rows={plans} paginate={false} minWidth={560} />
      <Modal open={!!editing} onClose={() => setEditing(null)} size="sm" title={editing === 'new' ? 'Add plan' : 'Edit plan'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={handleSubmit(save)}>Save plan</Button></>}>
        <form className="grid gap-4" noValidate onSubmit={handleSubmit(save)}>
          <FormField label="Plan name" required error={errors.name?.message}><Input error={errors.name} {...register('name', { required: 'Enter a name' })} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Months" required error={errors.duration_months?.message}><Input type="number" min="1" error={errors.duration_months} {...register('duration_months', { required: 'Required', min: { value: 1, message: 'Min 1' } })} /></FormField>
            <FormField label="Price (₹)" required error={errors.standard_price?.message}><Input type="number" min="0" error={errors.standard_price} {...register('standard_price', { required: 'Required' })} /></FormField>
          </div>
          <Checkbox label="Plan is active" {...register('is_active')} />
          <button type="submit" className="hidden" />
        </form>
      </Modal>
    </div>
  )
}

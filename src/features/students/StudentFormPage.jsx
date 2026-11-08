import { todayISO } from '@/utils/format'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Button, Card, EmptyState, FormField, Input, PageHeader, Select, useToast } from '@/components/ui'
import PaymentPanel, { usePayment } from '@/components/payments/PaymentPanel'
import { PlanPicker } from '@/components/common/pickers'
import { endDateFor, enrollStudent, getPlan, getStudent, updateStudent } from '@/services/store'
import { formatDate, formatINR } from '@/utils/format'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/** Add: student details + first membership + payment on ONE page. Edit: details only. */
export default function StudentFormPage() {
  const { id } = useParams()
  const editing = !!id
  const existing = editing ? getStudent(id) : null
  useDocumentTitle(editing ? 'Edit student' : 'Add student')
  const navigate = useNavigate()
  const toast = useToast()

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { full_name: existing?.full_name || '', mobile: existing?.mobile || '', gender: existing?.gender || '', date_of_birth: existing?.date_of_birth || '' },
  })
  const [planId, setPlanId] = useState('')
  const [start, setStart] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const plan = getPlan(planId)
  const pay = usePayment(plan?.standard_price || 0)

  if (editing && !existing) return <EmptyState title="Student not found" />

  const onSubmit = async (data) => {
    setSaving(true)
    try {
      if (editing) {
        await updateStudent(id, data)
        toast.success('Student updated.')
        navigate(`/students/${id}`)
        return
      }
      const res = await enrollStudent({ student: data, plan_id: planId, start_date: start, payment: pay.payload })
      const due = plan ? plan.standard_price - (res.payment?.amount || 0) : 0
      toast.success(plan ? (due > 0 ? `${data.full_name} added. Balance due ${formatINR(due)}.` : `${data.full_name} added and fully paid.`) : `${data.full_name} added.`)
      navigate(`/students/${res.student.id}`)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title={editing ? 'Edit student' : 'Add student'} back={{ to: editing ? `/students/${id}` : '/students', label: 'Back' }} />
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-2xl space-y-6">
        <Card>
          <h2 className="mb-4 text-body-lg font-semibold">Student</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Student name" required error={errors.full_name?.message}>
              <Input autoFocus error={errors.full_name} {...register('full_name', { required: 'Enter the student name' })} />
            </FormField>
            <FormField label="Mobile number" required error={errors.mobile?.message}>
              <Input inputMode="tel" error={errors.mobile} {...register('mobile', { required: 'Enter a mobile number', pattern: { value: /^[6-9]\d{9}$/, message: 'Enter a 10-digit mobile number' } })} />
            </FormField>
            <FormField label="Date of birth"><Input type="date" {...register('date_of_birth')} /></FormField>
            <FormField label="Gender">
              <Select placeholder="—" {...register('gender')}><option>Male</option><option>Female</option><option>Other</option></Select>
            </FormField>
          </div>
        </Card>

        {!editing && (
          <Card>
            <h2 className="mb-1 text-body-lg font-semibold">Membership & payment</h2>
            <p className="mb-4 text-body-sm text-text-secondary">Pick a plan to collect the first payment now. You can also skip this and add a membership later.</p>
            <PlanPicker value={planId} onChange={setPlanId} />
            {plan && (
              <div className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Starts on"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
                  <div><p className="mb-1 text-body-sm font-medium">Ends on</p><p className="flex h-10 items-center">{formatDate(endDateFor(start, plan.duration_months))}</p></div>
                </div>
                <PaymentPanel pay={pay} note={`${plan.name} membership`} />
              </div>
            )}
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!editing && !pay.valid}>
            {editing ? 'Save changes' : plan ? (pay.paying > 0 ? `Save student · ${formatINR(pay.paying)} received` : 'Save student, payment due') : 'Save student'}
          </Button>
        </div>
      </form>
    </>
  )
}

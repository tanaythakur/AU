import { todayISO } from '@/utils/format'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { Button, Drawer, FormField, Input, InlineAlert, useToast } from '@/components/ui'
import PaymentPanel, { usePayment } from '@/components/payments/PaymentPanel'
import { PlanPicker, StudentPicker } from '@/components/common/pickers'
import { addMembership, endDateFor, getPlan, getStudent, membershipsOf, overlapFor, recordPayment, suggestedStart } from '@/services/store'
import { formatDate, formatINR } from '@/utils/format'

/** New membership for an existing student, or a renewal (student fixed, plan preselected). */
export default function MembershipDrawer({ open, onClose, studentId, renew }) {
  if (!open) return null
  return <Inner onClose={onClose} studentId={studentId} renew={renew} />
}

function Inner({ onClose, studentId, renew }) {
  const toast = useToast()
  const [sid, setSid] = useState(studentId || '')
  const lastPlan = studentId ? membershipsOf(studentId)[0]?.plan_id : ''
  const [planId, setPlanId] = useState(renew ? lastPlan || '' : '')
  const [start, setStart] = useState(studentId ? suggestedStart(studentId) : todayISO())
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  const plan = getPlan(planId)
  const total = plan?.standard_price || 0
  const pay = usePayment(total)
  const overlap = sid && start ? overlapFor(sid, start) : null
  const student = getStudent(sid)
  const ready = sid && plan && start && pay.valid

  const pickStudent = (id) => {
    setSid(id)
    if (id) setStart(suggestedStart(id))
  }

  const submit = async () => {
    setSaving(true)
    try {
      await new Promise((r) => setTimeout(r, 350)) // demo latency
      const m = addMembership({ student_id: sid, plan_id: planId, start_date: start })
      const p = pay.payload ? recordPayment({ student_id: sid, membership_id: m.id, ...pay.payload }) : null
      setDone({ m, p })
      toast.success(renew ? 'Renewal completed.' : 'Membership added.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (done)
    return (
      <Drawer open onClose={onClose} title={renew ? 'Renewal completed' : 'Membership added'}
        footer={<Button className="flex-1" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col items-center py-6 text-center">
          <CircleCheck size={48} className="text-success" />
          <p className="mt-3 text-h3">{student?.full_name}</p>
          <p className="text-body text-text-secondary">{done.m.plan_name} · {formatDate(done.m.start_date)} – {formatDate(done.m.end_date)}</p>
          <p className="mt-3 text-body">
            {done.p ? <>Received <b>{formatINR(done.p.amount)}</b>. </> : 'No payment recorded. '}
            {done.m.amount - (done.p?.amount || 0) > 0 ? <>Balance due <b>{formatINR(done.m.amount - (done.p?.amount || 0))}</b>.</> : 'Fully paid.'}
          </p>
          {done.p && <Link to={`/payments/${done.p.id}/receipt`} className="mt-3 text-body font-medium text-primary hover:underline">View receipt</Link>}
        </div>
      </Drawer>
    )

  return (
    <Drawer open onClose={onClose} title={renew ? 'Renew membership' : 'New membership'} description={student ? `${student.full_name} · ${student.mobile}` : 'Pick an existing student'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={saving} disabled={!ready} onClick={submit}>
            {renew ? 'Confirm renewal' : 'Save membership'}{pay.paying > 0 ? ` · ${formatINR(pay.paying)}` : ''}
          </Button>
        </>
      }>
      {!studentId && (
        <FormField label="Student" required>
          <StudentPicker value={sid} onChange={pickStudent} />
        </FormField>
      )}
      <FormField label="Plan" required><PlanPicker value={planId} onChange={setPlanId} /></FormField>

      {plan && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Starts on"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></FormField>
            <div>
              <p className="mb-1 text-body-sm font-medium">Ends on</p>
              <p className="flex h-10 items-center text-body">{start ? formatDate(endDateFor(start, plan.duration_months)) : '—'}</p>
            </div>
          </div>
          {overlap && (
            <InlineAlert title="Overlaps an existing membership">
              {overlap.plan_name} runs until {formatDate(overlap.end_date)}. Starting on {formatDate(start)} means two memberships cover the same days. Move the start date to {formatDate(suggestedStart(sid))} to avoid this.
              <button type="button" onClick={() => setStart(suggestedStart(sid))} className="ml-1 font-semibold underline">Use that date</button>
            </InlineAlert>
          )}
          <PaymentPanel pay={pay} payer={student?.full_name} note={`${plan.name} membership`} />
        </>
      )}
    </Drawer>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { Button, Drawer, useToast } from '@/components/ui'
import PaymentPanel, { usePayment } from '@/components/payments/PaymentPanel'
import { enrichBooking, enrichMembership, getBooking, getMembership, getStudent, recordPayment } from '@/services/store'
import { formatDate, formatHour, formatINR } from '@/utils/format'

/**
 * Collect a pending balance. target: {membershipId} | {bookingId}.
 * Used from the student list/profile and the arena list, so the admin never has to open Payments.
 */
export default function CollectDrawer({ target, onClose }) {
  if (!target) return null
  return <Inner target={target} onClose={onClose} />
}

function Inner({ target, onClose }) {
  const toast = useToast()
  const m = target.membershipId ? enrichMembership(getMembership(target.membershipId)) : null
  const b = target.bookingId ? enrichBooking(getBooking(target.bookingId)) : null
  const balance = (m || b).balance
  const who = m ? getStudent(m.student_id)?.full_name : b.customer_name
  const what = m ? `${m.plan_name} plan, ${formatDate(m.start_date)} – ${formatDate(m.end_date)}` : `${formatDate(b.booking_date)}, ${formatHour(b.start_hour)} – ${formatHour(b.end_hour)}`
  const pay = usePayment(balance)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(null)

  const submit = async () => {
    setSaving(true)
    try {
      const p = await recordPayment({ membership_id: m?.id, arena_booking_id: b?.id, ...pay.payload })
      setDone(p)
      toast.success('Payment recorded.')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (done)
    return (
      <Drawer open onClose={onClose} title="Payment successful" footer={<Button className="flex-1" onClick={onClose}>Done</Button>}>
        <div className="flex flex-col items-center py-6 text-center">
          <CircleCheck size={48} className="text-success" />
          <p className="mt-3 text-h2">{formatINR(done.amount)}</p>
          <p className="text-body text-text-secondary">received from {who}</p>
          <p className="mt-2 text-body">{balance - done.amount > 0 ? <>Remaining balance <b>{formatINR(balance - done.amount)}</b></> : 'Fully paid.'}</p>
          <Link to={`/payments/${done.id}/receipt`} className="mt-3 text-body font-medium text-primary hover:underline">View receipt {done.receipt_number}</Link>
        </div>
      </Drawer>
    )

  return (
    <Drawer open onClose={onClose} title="Collect payment" description={`${who} · ${what}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" loading={saving} disabled={!pay.payload || !pay.valid} onClick={submit}>Confirm payment{pay.paying > 0 ? ` · ${formatINR(pay.paying)}` : ''}</Button>
        </>
      }>
      <PaymentPanel pay={pay} payer={who} title={`Balance due ${formatINR(balance)}`} note={m ? `${m.plan_name} membership` : 'Arena booking'} />
    </Drawer>
  )
}

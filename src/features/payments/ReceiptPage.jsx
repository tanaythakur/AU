import { Link, useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { Button, Card, EmptyState, PageHeader, StatusBadge } from '@/components/ui'
import { methodLabel } from '@/data/db'
import { getBooking, getMembership, getPayment, getSettings, getStudent, payerName } from '@/services/store'
import { formatDate, formatDateTime, formatHour, formatINR } from '@/utils/format'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function ReceiptPage() {
  const { id } = useParams()
  const p = getPayment(id)
  useDocumentTitle(p ? `Receipt ${p.receipt_number}` : 'Receipt')
  if (!p) return <EmptyState title="Payment not found" />

  const { name, phone, address } = getSettings()
  const m = p.membership_id ? getMembership(p.membership_id) : null
  const b = p.arena_booking_id ? getBooking(p.arena_booking_id) : null
  const student = p.student_id ? getStudent(p.student_id) : null
  const towards = m ? `${m.plan_name} membership (${formatDate(m.start_date)} – ${formatDate(m.end_date)})` : `Arena booking, ${formatDate(b?.booking_date)}, ${formatHour(b?.start_hour)} to ${formatHour(b?.end_hour)}`

  return (
    <>
      <PageHeader title="Payment receipt" back={{ to: '/payments', label: 'Payments' }}
        actions={<>
          {student && <Button variant="secondary" as={Link} to={`/students/${student.id}`}>View student</Button>}
          <Button icon={Printer} onClick={() => window.print()}>Print receipt</Button>
        </>} />
      <Card className="mx-auto max-w-2xl print:max-w-none print:border-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-border pb-5">
          <div>
            <p className="text-h2 text-text-primary">{name}</p>
            <p className="text-body-sm text-text-secondary">{[address, phone].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="text-right">
            <p className="text-caption uppercase tracking-wide text-text-secondary">Receipt no.</p>
            <p className="text-h3 text-text-primary">{p.receipt_number}</p>
            <div className="mt-1"><StatusBadge status={p.status} /></div>
          </div>
        </div>
        <dl className="grid gap-5 py-6 sm:grid-cols-2">
          <Field label="Received from">{payerName(p)}{(student || b) && <span className="block text-body-sm text-text-secondary">{(student || b).mobile}</span>}</Field>
          <Field label="Date & time">{formatDateTime(p.payment_date)}</Field>
          <Field label="Towards">{towards}</Field>
          <Field label="Payment method">{methodLabel(p.payment_method)}{p.reference_number && <span className="block text-body-sm text-text-secondary">Ref: {p.reference_number}</span>}</Field>
        </dl>
        <div className="flex items-center justify-between rounded-md bg-background px-5 py-4">
          <span className="text-body-lg font-medium">Amount received</span>
          <span className="text-kpi text-text-primary">{formatINR(p.amount)}</span>
        </div>
        <p className="mt-6 text-center text-caption text-text-secondary">Computer-generated receipt for a payment confirmed by the academy administrator.</p>
      </Card>
    </>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-caption uppercase tracking-wide text-text-secondary">{label}</dt>
      <dd className="mt-0.5 text-body text-text-primary">{children}</dd>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { IndianRupee, Pencil, Phone, Printer, RefreshCw } from 'lucide-react'
import { Button, Card, CardHeader, DataTable, EmptyState, IconButton, PageHeader, StatusBadge } from '@/components/ui'
import { methodLabel, payments } from '@/data/mock'
import { enrichMembership, getStudent, membershipsOf, paymentLinkLabel, studentRow, useStore } from '@/services/store'
import { formatDate, formatDateTime, formatINR, initials } from '@/utils/format'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import MembershipDrawer from './MembershipDrawer'
import CollectDrawer from '@/features/payments/CollectDrawer'

export default function StudentProfilePage() {
  const { id } = useParams()
  const v = useStore()
  const student = getStudent(id)
  useDocumentTitle(student?.full_name)
  const [renew, setRenew] = useState(false)
  const [collect, setCollect] = useState(null)

  const row = useMemo(() => (student ? studentRow(student) : null), [student, v])
  const ms = useMemo(() => membershipsOf(id).map(enrichMembership), [id, v])
  const pays = useMemo(() => payments.filter((p) => p.student_id === id).sort((a, b) => b.payment_date.localeCompare(a.payment_date)), [id, v])

  if (!student) return <EmptyState title="Student not found" action={<Button as={Link} to="/students">Back to students</Button>} />

  const cur = row.current
  const previous = ms.filter((m) => m.id !== cur?.id)

  return (
    <>
      <PageHeader
        title={student.full_name}
        back={{ to: '/students', label: 'Students' }}
        actions={
          <>
            <Button variant="secondary" as={Link} to={`/students/${id}/edit`} icon={Pencil}>Edit</Button>
            {row.outstanding > 0 && <Button variant="secondary" icon={IndianRupee} onClick={() => setCollect({ membershipId: row.unpaid_membership.id })}>Collect {formatINR(row.unpaid_membership.balance)}</Button>}
            <Button icon={RefreshCw} onClick={() => setRenew(true)}>Renew</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-full bg-success-bg text-body-lg font-semibold text-success-text">{initials(student.full_name)}</span>
            <div>
              <p className="flex items-center gap-1.5 text-body"><Phone size={14} className="text-text-secondary" />{student.mobile}</p>
              <p className="text-body-sm text-text-secondary">{[student.gender, student.date_of_birth && formatDate(student.date_of_birth)].filter(Boolean).join(' · ') || 'No other details'}</p>
              <p className="text-caption text-text-secondary">Joined {formatDate(student.admission_date)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="grid gap-4 sm:grid-cols-4">
            <Fact label="Current membership">{cur ? <><p className="font-semibold">{cur.plan_name}</p><StatusBadge status={cur.status} className="mt-1" /></> : <span className="text-text-secondary">None</span>}</Fact>
            <Fact label="Expires">{cur ? <><p className="font-semibold">{formatDate(cur.end_date)}</p><p className="text-caption text-text-secondary">{cur.status === 'expired' ? 'Expired' : `${cur.days_left} days left`}</p></> : '—'}</Fact>
            <Fact label="Total paid"><p className="text-h3">{formatINR(row.total_paid)}</p></Fact>
            <Fact label="Outstanding"><p className={`text-h3 ${row.outstanding > 0 ? 'text-danger-text' : ''}`}>{formatINR(row.outstanding)}</p></Fact>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-h3">Payment history</h2>
          <DataTable minWidth={520} paginate={false} rows={pays} empty={<EmptyState title="No payments yet" />}
            columns={[
              { key: 'payment_date', header: 'Date', render: (p) => formatDateTime(p.payment_date) },
              { key: 'for', header: 'For', render: (p) => paymentLinkLabel(p) },
              { key: 'payment_method', header: 'Method', render: (p) => methodLabel(p.payment_method) },
              { key: 'amount', header: 'Amount', align: 'right', render: (p) => <span className="font-medium">{formatINR(p.amount)}</span> },
              { key: 'status', header: '', render: (p) => p.status !== 'completed' && <StatusBadge status={p.status} /> },
              { key: 'a', header: '', align: 'right', render: (p) => <IconButton as={Link} to={`/payments/${p.id}/receipt`} icon={Printer} label="Receipt" size="sm" /> },
            ]} />
        </section>
        <section>
          <h2 className="mb-3 text-h3">Previous memberships</h2>
          <DataTable minWidth={520} paginate={false} rows={previous} empty={<EmptyState title="No previous memberships" />}
            columns={[
              { key: 'plan_name', header: 'Plan', render: (m) => <span className="font-medium">{m.plan_name}</span> },
              { key: 'period', header: 'Period', render: (m) => `${formatDate(m.start_date)} – ${formatDate(m.end_date)}` },
              { key: 'amount', header: 'Amount', align: 'right', render: (m) => formatINR(m.amount) },
              { key: 'balance', header: 'Due', align: 'right', render: (m) => (m.balance > 0 ? <button onClick={() => setCollect({ membershipId: m.id })} className="font-medium text-danger-text hover:underline">{formatINR(m.balance)}</button> : '—') },
            ]} />
        </section>
      </div>

      <MembershipDrawer key={renew ? 'r' : 'x'} open={renew} onClose={() => setRenew(false)} studentId={id} renew />
      <CollectDrawer target={collect} onClose={() => setCollect(null)} />
    </>
  )
}

function Fact({ label, children }) {
  return <div><p className="mb-1 text-caption text-text-secondary">{label}</p>{children}</div>
}

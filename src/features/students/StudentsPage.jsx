import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, IndianRupee, Pencil, Plus, RefreshCw, Users } from 'lucide-react'
import { Button, DataTable, EmptyState, FilterBar, IconButton, PageHeader, SearchInput, StatusBadge } from '@/components/ui'
import { students } from '@/data/mock'
import { studentRow, useStore } from '@/services/store'
import { downloadCSV, formatDate, formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import MembershipDrawer from './MembershipDrawer'
import CollectDrawer from '@/features/payments/CollectDrawer'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'expiring', label: 'Expiring soon' },
  { key: 'expired', label: 'Expired' },
  { key: 'due', label: 'Balance due' },
]

export default function StudentsPage() {
  useDocumentTitle('Students')
  const v = useStore()
  const navigate = useNavigate()
  const loading = useSimulatedLoading()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [membershipFor, setMembershipFor] = useState(null) // {studentId, renew} | {new:true}
  const [collect, setCollect] = useState(null)

  const all = useMemo(() => students.filter((s) => s.status === 'active').map(studentRow), [v])
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    return all
      .filter((s) => !t || s.full_name.toLowerCase().includes(t) || s.mobile.includes(t))
      .filter((s) => {
        const c = s.current
        if (filter === 'active') return s.membership_status === 'active'
        if (filter === 'expiring') return c && c.status === 'active' && c.days_left <= 7
        if (filter === 'expired') return s.membership_status === 'expired' || s.membership_status === 'none'
        if (filter === 'due') return s.outstanding > 0
        return true
      })
  }, [all, q, filter])

  const counts = {
    all: all.length,
    active: all.filter((s) => s.membership_status === 'active').length,
    expiring: all.filter((s) => s.current?.status === 'active' && s.current.days_left <= 7).length,
    expired: all.filter((s) => ['expired', 'none'].includes(s.membership_status)).length,
    due: all.filter((s) => s.outstanding > 0).length,
  }

  const columns = [
    { key: 'full_name', header: 'Student', sortable: true, render: (s) => <Link to={`/students/${s.id}`} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary">{s.full_name}</Link> },
    { key: 'mobile', header: 'Mobile' },
    { key: 'plan', header: 'Plan', render: (s) => s.current?.plan_name || <span className="text-text-tertiary">—</span> },
    {
      key: 'expiry', header: 'Expiry', sortable: true, sortValue: (s) => s.current?.end_date || '',
      render: (s) => !s.current ? <span className="text-text-tertiary">—</span> : (
        <div>
          <p>{formatDate(s.current.end_date)}</p>
          <p className={cn('text-caption', s.current.status === 'expired' ? 'text-danger-text' : s.current.days_left <= 7 && s.current.status === 'active' ? 'text-warning-text' : 'text-text-secondary')}>
            {s.current.status === 'expired' ? 'Expired' : s.current.status === 'upcoming' ? 'Starts soon' : `${s.current.days_left} day${s.current.days_left === 1 ? '' : 's'} left`}
          </p>
        </div>
      ),
    },
    {
      key: 'pay_status', header: 'Payment', sortable: true,
      render: (s) => s.pay_status === 'none' ? <span className="text-text-tertiary">—</span> : (
        <div><StatusBadge status={s.pay_status} />{s.outstanding > 0 && <p className="mt-0.5 text-caption text-text-secondary">{formatINR(s.outstanding)} due</p>}</div>
      ),
    },
    {
      key: 'a', header: '', align: 'right',
      render: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {s.outstanding > 0 && <Button size="sm" variant="secondary" icon={IndianRupee} onClick={() => setCollect({ membershipId: s.unpaid_membership.id })}>Collect</Button>}
          <Button size="sm" icon={RefreshCw} onClick={() => setMembershipFor({ studentId: s.id, renew: true })}>Renew</Button>
          <IconButton as={Link} to={`/students/${s.id}/edit`} icon={Pencil} label="Edit student" size="sm" />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Students"
        description="Search, renew and collect payments from one place."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={() => downloadCSV('students.csv', rows.map((s) => ({ name: s.full_name, mobile: s.mobile, plan: s.current?.plan_name, expiry: s.current?.end_date, payment: s.pay_status, due: s.outstanding })))}>Export</Button>
            <Button variant="secondary" onClick={() => setMembershipFor({ new: true })}>New Membership</Button>
            <Button as={Link} to="/students/new" icon={Plus}>Add Student</Button>
          </>
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={setQ} placeholder="Search name or mobile" />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick filter">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
              className={cn('rounded-full border px-3 py-1 text-body-sm font-medium transition-colors',
                filter === f.key ? 'border-primary bg-success-bg text-success-text' : 'border-border-heavy bg-surface text-text-secondary hover:bg-background')}>
              {f.label} <span className="opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </FilterBar>
      <DataTable columns={columns} rows={rows} loading={loading} minWidth={820} onRowClick={(s) => navigate(`/students/${s.id}`)}
        empty={<EmptyState icon={Users} title="No students found" description="Try another search, or add your first student." action={<Button as={Link} to="/students/new" icon={Plus}>Add Student</Button>} />} />

      <MembershipDrawer key={membershipFor ? membershipFor.studentId || 'new' : 'x'} open={!!membershipFor} onClose={() => setMembershipFor(null)} studentId={membershipFor?.studentId} renew={membershipFor?.renew} />
      <CollectDrawer target={collect} onClose={() => setCollect(null)} />
    </>
  )
}

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { CalendarClock, GraduationCap, IndianRupee, PiggyBank, Plus, TrendingDown, Trophy, UserPlus, Users, Wallet } from 'lucide-react'
import { Button, Card, CardHeader, ChartCard, PageHeader, StatCard } from '@/components/ui'
import { CHART, ChartLegend, ChartTooltip, axisProps, currencyAxis } from '@/components/common/charts'
import { bookings, expenses, payments, students } from '@/data/mock'
import { enrichBooking, monthlySeries, payerName, paymentType, pendingTotals, periodRange, studentRow, totalsFor, useStore } from '@/services/store'
import { formatDate, formatINR } from '@/utils/format'
import { useSimulatedLoading } from '@/hooks/useSimulatedLoading'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import MembershipDrawer from '@/features/students/MembershipDrawer'

export default function DashboardPage() {
  useDocumentTitle('Dashboard')
  const v = useStore()
  const loading = useSimulatedLoading()
  const [renewFor, setRenewFor] = useState(null)

  const d = useMemo(() => {
    const month = periodRange('this_month')
    const active = students.filter((s) => s.status === 'active').map(studentRow)
    return {
      activeCount: active.filter((s) => s.membership_status === 'active').length,
      admissions: students.filter((s) => s.admission_date >= month[0] && s.admission_date <= month[1]).length,
      expiring: active.filter((s) => s.current?.status === 'active' && s.current.days_left <= 7).sort((a, b) => a.current.days_left - b.current.days_left),
      totals: totalsFor(month),
      pending: pendingTotals(),
      series: monthlySeries(6),
      recentPayments: payments.filter((p) => p.status === 'completed').sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 5),
      recentAdmissions: [...students].filter((s) => s.status === 'active').sort((a, b) => b.admission_date.localeCompare(a.admission_date)).slice(0, 5),
      arenaDue: bookings.map(enrichBooking).filter((b) => b.balance > 0).sort((a, b) => a.booking_date.localeCompare(b.booking_date)).slice(0, 5),
      recentExpenses: expenses.slice(0, 5),
    }
  }, [v])

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Today at the academy."
        actions={
          <>
            <Button as={Link} to="/students/new" icon={UserPlus}>Add Student</Button>
            <Button as={Link} to="/arena?new=1" variant="secondary" icon={Trophy}>New Booking</Button>
            <Button as={Link} to="/expenses?new=1" variant="secondary" icon={Plus}>Add Expense</Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard loading={loading} label="Active students" value={d.activeCount} icon={Users} tone="primary" variant="compact" hint="With a running membership" />
        <StatCard loading={loading} label="New admissions" value={d.admissions} icon={GraduationCap} tone="info" variant="compact" hint="This month" />
        <StatCard loading={loading} label="Expiring soon" value={d.expiring.length} icon={CalendarClock} tone="warning" variant="compact" hint="Within 7 days" />
        <StatCard loading={loading} label="Collection" value={formatINR(d.totals.collected)} icon={IndianRupee} tone="primary" variant="compact" hint="This month" />
        <StatCard loading={loading} label="Pending payments" value={formatINR(d.pending.total)} icon={Wallet} tone="warning" variant="compact" hint={`Academy ${formatINR(d.pending.academy)} · Arena ${formatINR(d.pending.arena)}`} />
        <StatCard loading={loading} label="Expenses" value={formatINR(d.totals.spent)} icon={TrendingDown} tone="danger" variant="compact" hint="This month" />
        <StatCard loading={loading} label="Operating cash surplus" value={formatINR(d.totals.surplus)} icon={PiggyBank} tone={d.totals.surplus >= 0 ? 'primary' : 'danger'} variant="compact" hint="Collected − expenses paid, this month" className="sm:col-span-2" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Collections vs expenses" description="Last 6 months" loading={loading} height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.series} barGap={4}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="month" {...axisProps} />
              <YAxis {...currencyAxis} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="collections" name="Collections" fill={CHART.collections} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expenses" name="Expenses" fill={CHART.expenses} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          <ChartLegend items={[{ name: 'Collections', color: CHART.collections }, { name: 'Expenses', color: CHART.expenses }]} />
        </ChartCard>

        <ListCard title="Upcoming expiries" action={<Link to="/students" className="text-body-sm font-medium text-primary hover:underline">All students</Link>} empty="No memberships expiring this week">
          {d.expiring.slice(0, 5).map((s) => (
            <Row key={s.id} main={s.full_name} sub={`${s.current.plan_name} · ${s.current.days_left === 0 ? 'expires today' : `${s.current.days_left}d left`}`}
              right={<Button size="sm" onClick={() => setRenewFor(s.id)}>Renew</Button>} />
          ))}
        </ListCard>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <ListCard title="Recent payments" empty="No payments yet">
          {d.recentPayments.map((p) => (
            <Row key={p.id} to={`/payments/${p.id}/receipt`} main={payerName(p)} sub={`${paymentType(p)} · ${formatDate(p.payment_date)}`} right={<b>{formatINR(p.amount)}</b>} />
          ))}
        </ListCard>
        <ListCard title="Pending arena balances" empty="No balances pending" action={<Link to="/arena" className="text-body-sm font-medium text-primary hover:underline">Arena</Link>}>
          {d.arenaDue.map((b) => (
            <Row key={b.id} to="/arena" main={b.customer_name} sub={formatDate(b.booking_date)} right={<b className="text-danger-text">{formatINR(b.balance)}</b>} />
          ))}
        </ListCard>
        <ListCard title="Recent admissions" empty="No students yet">
          {d.recentAdmissions.map((s) => <Row key={s.id} to={`/students/${s.id}`} main={s.full_name} sub={`Joined ${formatDate(s.admission_date)}`} />)}
        </ListCard>
        <ListCard title="Recent expenses" empty="No expenses yet" action={<Link to="/expenses" className="text-body-sm font-medium text-primary hover:underline">Expenses</Link>}>
          {d.recentExpenses.map((e) => <Row key={e.id} main={e.name} sub={formatDate(e.expense_date)} right={<b>{formatINR(e.amount)}</b>} />)}
        </ListCard>
      </div>

      <MembershipDrawer key={renewFor || 'x'} open={!!renewFor} onClose={() => setRenewFor(null)} studentId={renewFor} renew />
    </>
  )
}

function ListCard({ title, action, empty, children }) {
  const items = Array.isArray(children) ? children : [children]
  return (
    <Card className="p-5">
      <CardHeader className="mb-2" title={title} action={action} />
      {items.filter(Boolean).length === 0 ? <p className="py-6 text-center text-body-sm text-text-secondary">{empty}</p> : <ul className="divide-y divide-border-light">{children}</ul>}
    </Card>
  )
}

function Row({ main, sub, right, to }) {
  const body = (
    <>
      <div className="min-w-0"><p className="truncate text-body font-medium">{main}</p><p className="truncate text-caption text-text-secondary">{sub}</p></div>
      {right && <div className="shrink-0 text-body">{right}</div>}
    </>
  )
  return <li>{to ? <Link to={to} className="flex items-center justify-between gap-3 py-2.5 hover:text-primary">{body}</Link> : <div className="flex items-center justify-between gap-3 py-2.5">{body}</div>}</li>
}

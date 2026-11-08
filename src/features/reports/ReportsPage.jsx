import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, IndianRupee, PiggyBank, TrendingDown } from 'lucide-react'
import { Button, Card, CardHeader, ChartCard, DataTable, EmptyState, FilterBar, FilterSelect, PageHeader, StatCard, Tabs } from '@/components/ui'
import { CHART, ChartLegend, ChartTooltip, axisProps, currencyAxis } from '@/components/common/charts'
import { PERIOD_OPTIONS, expenses, methodLabel } from '@/data/db'
import { admissionsSeries, collectionsByMethod, collectionsBySource, expenseBreakdown, inRange, monthlySeries, pendingTotals, periodRange, totalsFor, useStore } from '@/services/store'
import { downloadCSV, formatDate, formatINR } from '@/utils/format'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function ReportsPage() {
  useDocumentTitle('Reports')
  const v = useStore()
  const [tab, setTab] = useState('financial')
  const [period, setPeriod] = useState('this_month')
  const range = periodRange(period)

  const t = useMemo(() => totalsFor(range), [period, v])
  const byMethod = useMemo(() => collectionsByMethod(range).map((x) => ({ ...x, name: methodLabel(x.name) })), [period, v])
  const bySource = useMemo(() => collectionsBySource(range), [period, v])
  const breakdown = useMemo(() => expenseBreakdown(range), [period, v])
  const series = useMemo(() => monthlySeries(6), [v])
  const adm = useMemo(() => admissionsSeries(6), [v])
  const pending = useMemo(() => pendingTotals(), [v])
  const list = useMemo(() => expenses.filter((e) => e.status === 'paid' && inRange(e.paid_date || e.expense_date, range)), [period, v])

  return (
    <>
      <PageHeader title="Reports" description="Simple totals computed from payments and expenses." />
      <FilterBar>
        <FilterSelect label="Period" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />
      </FilterBar>
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ key: 'financial', label: 'Collections' }, { key: 'expenses', label: 'Expenses' }, { key: 'growth', label: 'Students' }]} />

      {tab === 'financial' && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <StatCard variant="compact" label="Cash collected" value={formatINR(t.collected)} icon={IndianRupee} tone="primary" />
            <StatCard variant="compact" label="Expenses" value={formatINR(t.spent)} icon={TrendingDown} tone="danger" />
            <StatCard variant="compact" label="Operating cash surplus" value={formatINR(t.surplus)} icon={PiggyBank} tone={t.surplus >= 0 ? 'primary' : 'danger'} hint="Collected − expenses" />
          </div>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <Split title="By source" data={bySource} />
            <Split title="By payment method" data={byMethod} />
          </div>
          <Card>
            <CardHeader title="Pending (all time)" description="Balances still to be collected" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Mini label="Academy fees" value={formatINR(pending.academy)} />
              <Mini label="Arena bookings" value={formatINR(pending.arena)} />
              <Mini label="Total pending" value={formatINR(pending.total)} />
            </div>
          </Card>
        </>
      )}

      {tab === 'expenses' && (
        <>
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <ChartCard title="Monthly expenses" description="Last 6 months" height={240}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="month" {...axisProps} /><YAxis {...currencyAxis} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="expenses" name="Expenses" fill={CHART.expenses} radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
            <Card>
              <CardHeader title="Breakdown" description={`Total ${formatINR(t.spent)}`} />
              {breakdown.length === 0 ? <p className="py-8 text-center text-body-sm text-text-secondary">No expenses in this period</p> : (
                <ul className="space-y-3">
                  {breakdown.slice(0, 8).map((b) => (
                    <li key={b.name}>
                      <div className="mb-1 flex justify-between text-body"><span>{b.name} <span className="text-caption text-text-secondary">×{b.count}</span></span><b>{formatINR(b.value)}</b></div>
                      <div className="h-2 rounded-full bg-border-light"><div className="h-2 rounded-full bg-primary" style={{ width: `${(b.value / breakdown[0].value) * 100}%` }} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-h3">Expense history</h2>
            <Button variant="secondary" icon={Download} onClick={() => downloadCSV('expense-report.csv', list.map((e) => ({ date: e.expense_date, name: e.name, quantity: e.quantity, reason: e.reason, amount: e.amount })))}>Export</Button>
          </div>
          <DataTable rows={list} minWidth={620} pageSize={8} empty={<EmptyState title="No expenses" />}
            columns={[
              { key: 'expense_date', header: 'Date', render: (e) => formatDate(e.expense_date) },
              { key: 'name', header: 'Expense', render: (e) => <span className="font-medium">{e.name}</span> },
              { key: 'reason', header: 'Reason', className: 'whitespace-normal', render: (e) => <span className="text-text-secondary">{e.reason || '—'}</span> },
              { key: 'amount', header: 'Amount', align: 'right', render: (e) => formatINR(e.amount) },
            ]} />
        </>
      )}

      {tab === 'growth' && (
        <ChartCard title="New admissions" description="Last 6 months" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={adm}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="month" {...axisProps} /><YAxis {...axisProps} allowDecimals={false} width={32} />
              <Tooltip content={<ChartTooltip currency={false} />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="admissions" name="Admissions" fill={CHART.collections} radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </>
  )
}

function Mini({ label, value }) {
  return <div className="rounded-md bg-background p-4"><p className="text-caption text-text-secondary">{label}</p><p className="mt-1 text-h2">{value}</p></div>
}

function Split({ title, data }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <Card>
      <CardHeader title={title} description={formatINR(total)} />
      {total === 0 ? <p className="py-8 text-center text-body-sm text-text-secondary">No collections in this period</p> : (
        <div className="flex items-center gap-4">
          <div className="size-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2}>
                {data.map((_, i) => <Cell key={i} fill={CHART.palette[i % CHART.palette.length]} />)}
              </Pie><Tooltip content={<ChartTooltip />} /></PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {data.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between gap-2 text-body">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-sm" style={{ background: CHART.palette[i % CHART.palette.length] }} />{d.name}</span>
                <b>{formatINR(d.value)}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

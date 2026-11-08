import { useMemo } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Coins, HandCoins, Landmark, PiggyBank, Receipt, TrendingUp } from 'lucide-react'
import { Card, CardHeader, ChartCard, StatCard } from '@/components/ui'
import { CHART, ChartLegend, ChartTooltip, axisProps, currencyAxis } from '@/components/common/charts'
import { expenseRecords, financialSummary, group, incomeRecords, periodSeries } from '@/services/accounting'
import { useStore } from '@/services/store'
import { formatDate, formatINR } from '@/utils/format'
import { usePageLoading } from '@/hooks/usePageLoading'

export default function OverviewPage() {
  const v = useStore()
  const { range } = useOutletContext()
  const loading = usePageLoading()
  const d = useMemo(() => {
    const exp = expenseRecords(range)
    return {
      s: financialSummary(range),
      series: periodSeries(range, 'month'),
      byCat: group(exp, (e) => e.category, (e) => e.amount).slice(0, 6),
      due: incomeRecords(range).filter((x) => x.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, 5),
      payable: exp.filter((e) => e.status === 'pending').slice(0, 5),
    }
  }, [range, v])
  const { s } = d

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard variant="compact" loading={loading} label="Total revenue" value={formatINR(s.revenue)} icon={Coins} tone="primary" hint="Billed in period (accrual)" />
        <StatCard variant="compact" loading={loading} label="Total expenses" value={formatINR(s.totalExpenses)} icon={Receipt} tone="danger" hint="Incurred in period" />
        <StatCard variant="compact" loading={loading} label="Gross profit" value={formatINR(s.gross)} icon={TrendingUp} tone="info" hint="Revenue − cost of goods" />
        <StatCard variant="compact" loading={loading} label="Net profit / loss" value={formatINR(s.net)} icon={PiggyBank} tone={s.net >= 0 ? 'primary' : 'danger'} hint="Gross profit − operating expenses" />
        <StatCard variant="compact" loading={loading} label="Cash received" value={formatINR(s.cashReceived)} icon={ArrowDownToLine} tone="primary" hint="Money actually in" />
        <StatCard variant="compact" loading={loading} label="Cash paid" value={formatINR(s.cashPaid)} icon={ArrowUpFromLine} tone="neutral" hint="Expenses paid + refunds" />
        <StatCard variant="compact" loading={loading} label="Net cash flow" value={formatINR(s.netCash)} icon={Landmark} tone={s.netCash >= 0 ? 'primary' : 'danger'} hint="Cash received − cash paid" />
        <StatCard variant="compact" loading={loading} label="Pending receivables" value={formatINR(s.receivables)} icon={HandCoins} tone="warning" hint="Billed, not yet collected" />
        <StatCard variant="compact" loading={loading} label="Pending payables" value={formatINR(s.payables)} icon={Banknote} tone="warning" hint="Bills not yet paid" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Profit vs cash flow" description="Net profit is what you earned; net cash flow is what actually moved" loading={loading} height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.series} barGap={4}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...currencyAxis} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
              <Bar dataKey="net" name="Net profit" fill={CHART.collections} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="netCash" name="Net cash flow" fill={CHART.palette[1]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
          <ChartLegend items={[{ name: 'Net profit', color: CHART.collections }, { name: 'Net cash flow', color: CHART.palette[1] }]} />
        </ChartCard>
        <Card>
          <CardHeader title="Expenses by category" description={formatINR(s.totalExpenses)} />
          {d.byCat.length === 0 ? <p className="py-8 text-center text-body-sm text-text-secondary">No expenses in this period</p> : (
            <ul className="space-y-3">
              {d.byCat.map((c) => (
                <li key={c.name}>
                  <div className="mb-1 flex justify-between text-body"><span>{c.name}</span><b>{formatINR(c.value)}</b></div>
                  <div className="h-2 rounded-full bg-border-light"><div className="h-2 rounded-full bg-primary" style={{ width: `${(c.value / d.byCat[0].value) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Largest pending receivables" action={<Link to="/accounts/income" className="text-body-sm font-medium text-primary hover:underline">Income register</Link>} />
          {d.due.length === 0 ? <p className="py-6 text-center text-body-sm text-text-secondary">Nothing pending</p> : (
            <ul className="divide-y divide-border-light">
              {d.due.map((x) => <li key={x.code} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-body font-medium">{x.title}</p><p className="text-caption text-text-secondary">{x.code} · {formatDate(x.date)}</p></div><b className="text-danger-text">{formatINR(x.balance)}</b></li>)}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Pending payables" action={<Link to="/accounts/expenses" className="text-body-sm font-medium text-primary hover:underline">Expense register</Link>} />
          {d.payable.length === 0 ? <p className="py-6 text-center text-body-sm text-text-secondary">No unpaid bills</p> : (
            <ul className="divide-y divide-border-light">
              {d.payable.map((e) => <li key={e.id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate text-body font-medium">{e.name}</p><p className="text-caption text-text-secondary">{e.vendor || e.category} · {formatDate(e.expense_date)}</p></div><b>{formatINR(e.amount)}</b></li>)}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

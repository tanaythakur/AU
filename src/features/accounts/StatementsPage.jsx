import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, CardHeader, ChartCard, DataTable, FilterSelect, Tabs } from '@/components/ui'
import { CHART, ChartLegend, ChartTooltip, axisProps, currencyAxis } from '@/components/common/charts'
import { cashFlow, periodSeries, profitAndLoss } from '@/services/accounting'
import { useStore } from '@/services/store'
import { formatINR } from '@/utils/format'
import { cn } from '@/utils/cn'

const GRAN = [{ value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }, { value: 'year', label: 'Yearly' }]

function Line({ label, value, bold, indent, tone }) {
  return (
    <div className={cn('flex items-center justify-between border-b border-border-light py-2', bold && 'font-semibold')}>
      <span className={cn(indent && 'pl-4 text-text-secondary')}>{label}</span>
      <span className={cn('tabular-nums', tone === 'neg' && value < 0 && 'text-danger-text')}>{formatINR(value)}</span>
    </div>
  )
}

export default function StatementsPage() {
  const v = useStore()
  const { range } = useOutletContext()
  const [tab, setTab] = useState('pl')
  const [gran, setGran] = useState('month')
  const pl = useMemo(() => profitAndLoss(range), [range, v])
  const cf = useMemo(() => cashFlow(range), [range, v])
  const series = useMemo(() => periodSeries(range, gran), [range, gran, v])

  const plCols = [
    { key: 'label', header: 'Period', render: (x) => <span className="font-medium">{x.label}</span> },
    { key: 'revenue', header: 'Revenue', align: 'right', render: (x) => formatINR(x.revenue) },
    { key: 'cogs', header: 'Cost of goods', align: 'right', render: (x) => formatINR(x.cogs) },
    { key: 'gross', header: 'Gross profit', align: 'right', render: (x) => formatINR(x.gross) },
    { key: 'opex', header: 'Operating exp.', align: 'right', render: (x) => formatINR(x.opex) },
    { key: 'net', header: 'Net profit / loss', align: 'right', render: (x) => <b className={x.net < 0 ? 'text-danger-text' : ''}>{formatINR(x.net)}</b> },
  ]
  const cfCols = [
    { key: 'label', header: 'Period', render: (x) => <span className="font-medium">{x.label}</span> },
    { key: 'cashIn', header: 'Cash inflow', align: 'right', render: (x) => formatINR(x.cashIn) },
    { key: 'cashOut', header: 'Cash outflow', align: 'right', render: (x) => formatINR(x.cashOut) },
    { key: 'netCash', header: 'Net cash flow', align: 'right', render: (x) => <b className={x.netCash < 0 ? 'text-danger-text' : ''}>{formatINR(x.netCash)}</b> },
  ]
  const totalRow = (keys) => ({ label: 'Total', ...Object.fromEntries(keys.map((k) => [k, series.reduce((t, x) => t + x[k], 0)])) })

  return (
    <>
      <Tabs className="mb-6" value={tab} onChange={setTab} tabs={[{ key: 'pl', label: 'Profit & Loss' }, { key: 'cf', label: 'Cash Flow' }]} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {tab === 'pl' ? (
          <Card>
            <CardHeader title="Profit & Loss statement" description="Accrual basis: income and expenses when they happen, paid or not" />
            <p className="mt-3 text-body-sm font-semibold text-text-secondary">REVENUE</p>
            {pl.revenueByCategory.length === 0 && <Line indent label="No revenue" value={0} />}
            {pl.revenueByCategory.map((c) => <Line key={c.name} indent label={c.name} value={c.value} />)}
            <Line bold label="Total revenue" value={pl.revenue} />
            <p className="mt-3 text-body-sm font-semibold text-text-secondary">COST OF GOODS / SERVICES SOLD</p>
            {pl.cogsByCategory.map((c) => <Line key={c.name} indent label={c.name} value={c.value} />)}
            <Line bold label="Total cost of goods sold" value={pl.cogs} />
            <Line bold label="Gross profit" value={pl.gross} tone="neg" />
            <p className="mt-3 text-body-sm font-semibold text-text-secondary">OPERATING EXPENSES</p>
            {pl.opexByCategory.map((c) => <Line key={c.name} indent label={c.name} value={c.value} />)}
            <Line bold label="Total operating expenses" value={pl.opex} />
            <div className="mt-2 flex items-center justify-between rounded-md bg-background px-3 py-3 text-body-lg font-semibold">
              <span>Net profit / (loss)</span><span className={pl.net < 0 ? 'text-danger-text' : 'text-success-text'}>{formatINR(pl.net)}</span>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="Cash Flow statement" description="Actual money received and paid. Pending items are not cash" />
            <Line bold label="Opening cash balance" value={cf.opening} />
            <p className="mt-3 text-body-sm font-semibold text-text-secondary">CASH INFLOWS</p>
            <Line indent label="Fees & booking payments received" value={cf.received} />
            <Line indent label="Other income received" value={cf.otherIncome} />
            <Line bold label="Total inflows" value={cf.inflow} />
            <p className="mt-3 text-body-sm font-semibold text-text-secondary">CASH OUTFLOWS</p>
            <Line indent label="Expenses paid" value={cf.expensesPaid} />
            <Line indent label="Refunds paid" value={cf.refunds} />
            <Line bold label="Total outflows" value={cf.outflow} />
            <Line bold label="Net cash flow" value={cf.net} tone="neg" />
            <div className="mt-2 flex items-center justify-between rounded-md bg-background px-3 py-3 text-body-lg font-semibold">
              <span>Closing cash balance</span><span>{formatINR(cf.closing)}</span>
            </div>
          </Card>
        )}

        <div className="min-w-0 space-y-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h3">{tab === 'pl' ? 'Profit by period' : 'Cash flow by period'}</h2>
            <FilterSelect label="Group by" value={gran} onChange={setGran} options={GRAN} />
          </div>
          <ChartCard title={tab === 'pl' ? 'Revenue and net profit' : 'Inflow and outflow'} height={220}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} barGap={4}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} /><YAxis {...currencyAxis} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f1f5f9' }} />
                {tab === 'pl' ? (
                  <><Bar dataKey="revenue" name="Revenue" fill={CHART.palette[1]} radius={[4, 4, 0, 0]} maxBarSize={26} /><Bar dataKey="net" name="Net profit" fill={CHART.collections} radius={[4, 4, 0, 0]} maxBarSize={26} /></>
                ) : (
                  <><Bar dataKey="cashIn" name="Inflow" fill={CHART.collections} radius={[4, 4, 0, 0]} maxBarSize={26} /><Bar dataKey="cashOut" name="Outflow" fill={CHART.expenses} radius={[4, 4, 0, 0]} maxBarSize={26} /></>
                )}
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend items={tab === 'pl' ? [{ name: 'Revenue', color: CHART.palette[1] }, { name: 'Net profit', color: CHART.collections }] : [{ name: 'Inflow', color: CHART.collections }, { name: 'Outflow', color: CHART.expenses }]} />
          </ChartCard>
          <DataTable columns={tab === 'pl' ? plCols : cfCols} rows={[...series.map((x) => ({ ...x, id: x.label })), { ...totalRow(tab === 'pl' ? ['revenue', 'cogs', 'gross', 'opex', 'net'] : ['cashIn', 'cashOut', 'netCash']), id: 'total' }]}
            paginate={false} minWidth={560} />
        </div>
      </div>
    </>
  )
}

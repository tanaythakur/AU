import { useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { Button, FilterSelect, InlineAlert, PageHeader, useToast } from '@/components/ui'
import { ACCOUNT_PERIODS, rangeFor, rangeLabel } from '@/services/accounting'
import { exportAccountingExcel } from '@/services/exportExcel'
import { useStore } from '@/services/store'
import { cn } from '@/utils/cn'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const TABS = [
  { to: '/accounts', label: 'Overview', end: true },
  { to: '/accounts/income', label: 'Income' },
  { to: '/accounts/expenses', label: 'Expenses' },
  { to: '/accounts/ledger', label: 'Ledger' },
  { to: '/accounts/statements', label: 'P&L and Cash Flow' },
  { to: '/accounts/audit', label: 'Audit log' },
]

/** Shared header: one date filter drives every tab and the Excel export, so they always agree. */
export default function AccountsLayout() {
  useDocumentTitle('Accounts')
  useStore()
  const toast = useToast()
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [exporting, setExporting] = useState(false)
  const range = useMemo(() => rangeFor(preset, custom), [preset, custom])
  const needDates = preset === 'custom' && !range

  const doExport = async () => {
    setExporting(true)
    try {
      const { name, source } = await exportAccountingExcel(range)
      toast.success(source === 'server' ? `Downloaded ${name}` : `Downloaded ${name} (built in your browser: the server export function is not deployed yet)`)
    } catch (e) {
      toast.error(`Export failed: ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description={`Income, expenses, profit and cash flow · ${rangeLabel(range)}`}
        actions={
          <>
            <FilterSelect label="Period" value={preset} onChange={setPreset} options={ACCOUNT_PERIODS} />
            {preset === 'custom' && (
              <>
                <input type="date" aria-label="From date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="h-10 rounded-md border border-border-heavy bg-surface px-3 text-body shadow-sm" />
                <input type="date" aria-label="To date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="h-10 rounded-md border border-border-heavy bg-surface px-3 text-body shadow-sm" />
              </>
            )}
            <Button icon={FileSpreadsheet} loading={exporting} disabled={needDates} onClick={doExport}>Export Excel</Button>
          </>
        }
      />
      <nav aria-label="Accounts sections" className="mb-6 overflow-x-auto border-b border-border">
        <div className="flex min-w-max gap-6">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => cn('-mb-px border-b-2 pb-3 pt-1 text-body font-medium transition-colors', isActive ? 'border-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary')}>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
      {needDates ? <InlineAlert tone="info">Pick both a start and an end date to see this period.</InlineAlert> : <Outlet context={{ range, preset }} />}
    </>
  )
}

/*
 * Excel export. The workbook is generated ON THE SERVER by the `export-accounts` Edge Function, from data the
 * database itself computes (public.export_data), and the export is audit-logged there before the file is returned.
 * If that function is not deployed (HTTP 404) or unreachable, we fall back to building the same workbook in the
 * browser from the data already loaded (audit-logged first). The workbook code is shared: supabase/functions/_shared/workbook.js.
 */
import { supabase } from '@/lib/supabaseClient'
import { EXPENSE_CATEGORIES } from '@/data/db'
import { buildWorkbook, rangeLabel } from '../../supabase/functions/_shared/workbook.js'
import { expenseRecords, incomeRecords, ledger, periodSeries } from './accounting'
import { refresh } from './dataLoader'
import { logExport } from './store'

/** Same shape as public.export_data(), built from the loaded records (fallback path and tests). */
export function dataFromEngine(range) {
  const led = ledger(range)
  return {
    range: range || [null, null],
    income: incomeRecords(range).map((x) => ({
      kind: x.kind, code: x.code, title: x.title, category: x.category, amount: x.amount, received: x.received, balance: x.balance,
      date: x.date, method: x.method, status: x.status, description: x.description, reference: x.reference,
    })),
    expenses: expenseRecords(range).map((e) => ({
      code: e.code, title: e.name, category: e.category, amount: e.amount, expense_date: e.expense_date, payment_method: e.payment_method,
      vendor: e.vendor, description: e.reason, status: e.status, paid_date: e.paid_date, attachment: e.attachment?.name || '',
    })),
    ledger: {
      opening: led.opening,
      rows: led.rows.map((x) => ({ date: x.date, tx: x.tx, type: x.type, description: x.description, income: x.income, expense: x.expense, method: x.method_code || '' })),
    },
    months: periodSeries(range, 'month').map((m) => ({
      label: m.label, from: m.from, to: m.to,
      summary: { revenue: m.revenue, cogs: m.cogs, gross: m.gross, opex: m.opex, net: m.net, cash_received: m.cashIn, cash_paid: m.cashOut, net_cash: m.netCash },
    })),
    categories: EXPENSE_CATEGORIES.map((c) => ({ name: c.name, cogs: c.cogs })),
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Returns { name, source: 'server' | 'browser' }. */
export async function exportAccountingExcel(range) {
  const [from, to] = range || [null, null]
  const name = `accounts_${range ? `${range[0]}_to_${range[1]}` : 'all-time'}.xlsx`

  const { data, error } = await supabase.functions.invoke('export-accounts', { body: { from, to } })
  if (!error && data instanceof Blob) {
    download(data, name)
    await refresh('audit').catch(() => {}) // the server already wrote the audit entry
    return { name, source: 'server' }
  }
  const status = error?.context?.status
  if (error && status && status !== 404) {
    // the function exists but refused or failed: show its message, do NOT silently fall back
    let msg = error.message
    try { msg = (await error.context.json()).error || msg } catch { /* not json */ }
    if (status === 401) throw new Error('Your session has expired. Please sign in again.')
    throw new Error(msg)
  }

  // function not deployed / unreachable -> same workbook, built here from the loaded data
  const mod = await import('exceljs')
  const wb = buildWorkbook(mod.default || mod, dataFromEngine(range))
  const buf = await wb.xlsx.writeBuffer()
  await logExport(`Excel export ${rangeLabel(range)} (built in browser)`) // audit first: if it cannot be recorded, nothing is downloaded
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
  return { name, source: 'browser' }
}

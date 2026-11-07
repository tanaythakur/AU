/*
 * Accounting engine. Pure functions over the records in data/mock.js (swap for Supabase queries/views later).
 * Every dashboard card, report and Excel sheet is built from these functions, so they always reconcile.
 *
 * Basis of accounting
 *  - REVENUE (accrual)  = membership fees (on start date) + arena bookings (on booking date) + other income entries.
 *                         A cancelled booking only keeps the payments retained (not refunded). Cancelled other-income = 0.
 *  - EXPENSES (accrual) = every expense on its expense date, paid or pending.
 *  - COGS               = expenses in categories flagged cogs (Purchases). Everything else is operating expense.
 *  - CASH (money moved) = payments received (on payment date) + other income marked received, minus refunds
 *                         (on refund date) and expenses marked paid (on paid date). Pending items are never cash.
 *  - RECEIVABLES        = unpaid balances of income records;  PAYABLES = pending expenses.
 * A refund is a cash outflow only: the original payment no longer counts as received, so the balance
 * re-opens as a receivable and revenue is unchanged (the sale still stands).
 */
import {
  addMonths, endOfMonth, endOfQuarter, endOfWeek, endOfYear, format, parseISO, startOfMonth, startOfQuarter, startOfWeek, startOfYear,
} from 'date-fns'
import { bookings, expenses, incomeEntries, isCogs, memberships, payments, students, TODAY, iso } from '@/data/mock'

/* ---------------- date ranges ---------------- */
export const ACCOUNT_PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom range' },
  { value: 'all', label: 'All time' },
]

/** -> [fromISO, toISO] inclusive, or null for all time. */
export function rangeFor(preset, custom = {}) {
  switch (preset) {
    case 'today': return [iso(TODAY), iso(TODAY)]
    case 'week': return [iso(startOfWeek(TODAY, { weekStartsOn: 1 })), iso(endOfWeek(TODAY, { weekStartsOn: 1 }))]
    case 'month': return [iso(startOfMonth(TODAY)), iso(endOfMonth(TODAY))]
    case 'year': return [iso(startOfYear(TODAY)), iso(endOfYear(TODAY))]
    case 'custom': return custom.from && custom.to ? [custom.from <= custom.to ? custom.from : custom.to, custom.from <= custom.to ? custom.to : custom.from] : null
    default: return null
  }
}
export const inR = (dateStr, r) => !r || (dateStr.slice(0, 10) >= r[0] && dateStr.slice(0, 10) <= r[1])
export const rangeLabel = (r) => (r ? `${format(parseISO(r[0]), 'dd MMM yyyy')} – ${format(parseISO(r[1]), 'dd MMM yyyy')}` : 'All time')

/* ---------------- helpers ---------------- */
const round = (n) => Math.round((Number(n) || 0) * 100) / 100
const sum = (list, f) => round(list.reduce((t, x) => t + f(x), 0))
const completedFor = (key, id) => payments.filter((p) => p[key] === id && p.status === 'completed')
const lastMethod = (list) => [...list].sort((a, b) => b.payment_date.localeCompare(a.payment_date))[0]?.payment_method || ''
const statusOf = (amount, received) => (received >= amount ? 'paid' : received > 0 ? 'partial' : 'pending')

/* ---------------- income records (accrual) ---------------- */
/**
 * One row per income source. amount = revenue, received = cash actually collected, balance = receivable.
 * kind: membership | arena | manual
 */
export function incomeRecords(r) {
  const out = []
  memberships.forEach((m) => {
    const paid = completedFor('membership_id', m.id)
    const received = Math.min(sum(paid, (p) => p.amount), m.amount)
    const student = students.find((s) => s.id === m.student_id)
    out.push({
      id: m.id, kind: 'membership', code: `MEM-${m.id.replace(/\D/g, '').padStart(5, '0')}`, title: `${m.plan_name} membership – ${student?.full_name || ''}`,
      category: 'Student fees', amount: m.amount, received, balance: round(m.amount - received), date: m.start_date,
      method: lastMethod(paid), status: statusOf(m.amount, received), description: `${m.start_date} to ${m.end_date}`, reference: m.id, student_id: m.student_id,
    })
  })
  bookings.forEach((b) => {
    const paid = completedFor('arena_booking_id', b.id)
    const got = sum(paid, (p) => p.amount)
    const hours = `${b.start_hour}:00–${b.end_hour}:00`
    if (b.status === 'cancelled') {
      if (got <= 0) return // nothing retained, nothing to record
      out.push({
        id: b.id, kind: 'arena', code: `ARN-${b.id.replace(/\D/g, '').padStart(5, '0')}`, title: `Arena booking – ${b.customer_name} (cancelled, payment retained)`,
        category: 'Arena bookings', amount: got, received: got, balance: 0, date: b.booking_date, method: lastMethod(paid), status: 'paid',
        description: `Cancelled booking ${b.booking_date} ${hours}`, reference: b.id,
      })
      return
    }
    const received = Math.min(got, b.total_amount)
    out.push({
      id: b.id, kind: 'arena', code: `ARN-${b.id.replace(/\D/g, '').padStart(5, '0')}`, title: `Arena booking – ${b.customer_name}`, category: 'Arena bookings',
      amount: b.total_amount, received, balance: round(b.total_amount - received), date: b.booking_date, method: lastMethod(paid),
      status: statusOf(b.total_amount, received), description: `${b.booking_date} ${hours}`, reference: b.id,
    })
  })
  incomeEntries.forEach((i) => {
    const cancelled = i.status === 'cancelled'
    const received = i.status === 'paid' ? i.amount : 0
    out.push({
      id: i.id, kind: 'manual', code: i.code, title: i.title, category: i.category, amount: cancelled ? 0 : i.amount, received,
      balance: i.status === 'pending' ? i.amount : 0, date: i.income_date, method: i.payment_method, status: i.status === 'paid' ? 'paid' : i.status,
      description: cancelled ? `Cancelled (was ${i.amount}). ${i.description}` : i.description, reference: i.reference, raw: i,
    })
  })
  return out.filter((x) => inR(x.date, r)).sort((a, b) => b.date.localeCompare(a.date) || a.code.localeCompare(b.code))
}

/* ---------------- expense records (accrual) ---------------- */
export function expenseRecords(r) {
  return expenses
    .filter((e) => inR(e.expense_date, r))
    .map((e) => ({ ...e, cogs: isCogs(e.category) }))
    .sort((a, b) => b.expense_date.localeCompare(a.expense_date) || a.code.localeCompare(b.code))
}

/* ---------------- cash ledger ---------------- */
const methodOf = (m) => ({ upi: 'UPI', cash: 'Cash', bank_transfer: 'Bank transfer', card: 'Card' }[m] || '')
const whoFor = (p) =>
  p.student_id ? students.find((s) => s.id === p.student_id)?.full_name : bookings.find((b) => b.id === p.arena_booking_id)?.customer_name

/** All settled cash movements (unfiltered), oldest first. */
function allCashEntries() {
  const e = []
  payments.forEach((p) => {
    // status completed OR refunded: the money did come in on payment_date
    e.push({ at: p.payment_date, tx: p.receipt_number, description: `${p.student_id ? 'Fee' : 'Arena'} payment – ${whoFor(p)}`, income: p.amount, expense: 0, method: methodOf(p.payment_method), type: 'payment' })
    if (p.status === 'refunded')
      e.push({ at: p.refunded_at || p.payment_date, tx: `${p.receipt_number}-R`, description: `Refund – ${whoFor(p)}`, income: 0, expense: p.amount, method: methodOf(p.payment_method), type: 'refund' })
  })
  incomeEntries.filter((i) => i.status === 'paid').forEach((i) =>
    e.push({ at: `${i.received_date || i.income_date}T12:00:00`, tx: i.code, description: i.title, income: i.amount, expense: 0, method: methodOf(i.payment_method), type: 'income' }))
  expenses.filter((x) => x.status === 'paid').forEach((x) =>
    e.push({ at: `${x.paid_date || x.expense_date}T12:00:00`, tx: x.code, description: `${x.name}${x.vendor ? ` – ${x.vendor}` : ''}`, income: 0, expense: x.amount, method: methodOf(x.payment_method), type: 'expense' }))
  return e.sort((a, b) => a.at.localeCompare(b.at) || a.tx.localeCompare(b.tx))
}

/** Date-wise ledger with opening balance and running balance for the range. */
export function ledger(r) {
  const all = allCashEntries()
  const opening = r ? round(all.filter((x) => x.at.slice(0, 10) < r[0]).reduce((t, x) => t + x.income - x.expense, 0)) : 0
  let bal = opening
  const rows = all.filter((x) => inR(x.at, r)).map((x, i) => ({ ...x, id: `${x.tx}-${i}`, date: x.at.slice(0, 10), balance: (bal = round(bal + x.income - x.expense)) }))
  return { opening, rows, closing: bal, totalIn: sum(rows, (x) => x.income), totalOut: sum(rows, (x) => x.expense) }
}

/* ---------------- statements ---------------- */
export function cashFlow(r) {
  const l = ledger(r)
  const by = (t, f) => sum(l.rows.filter((x) => x.type === t), f)
  const received = by('payment', (x) => x.income)
  const otherIncome = by('income', (x) => x.income)
  const expensesPaid = by('expense', (x) => x.expense)
  const refunds = by('refund', (x) => x.expense)
  return {
    opening: l.opening, closing: l.closing,
    inflow: round(received + otherIncome), outflow: round(expensesPaid + refunds),
    net: round(received + otherIncome - expensesPaid - refunds),
    received, otherIncome, expensesPaid, refunds,
  }
}

export function profitAndLoss(r) {
  const inc = incomeRecords(r)
  const exp = expenseRecords(r)
  const revenue = sum(inc, (x) => x.amount)
  const cogs = sum(exp.filter((e) => e.cogs), (e) => e.amount)
  const opex = sum(exp.filter((e) => !e.cogs), (e) => e.amount)
  const revenueByCategory = group(inc, (x) => x.category, (x) => x.amount)
  const cogsByCategory = group(exp.filter((e) => e.cogs), (e) => e.category, (e) => e.amount)
  const opexByCategory = group(exp.filter((e) => !e.cogs), (e) => e.category, (e) => e.amount)
  return { revenue, cogs, gross: round(revenue - cogs), opex, net: round(revenue - cogs - opex), revenueByCategory, cogsByCategory, opexByCategory }
}

export function group(list, key, val) {
  const m = new Map()
  list.forEach((x) => m.set(key(x), round((m.get(key(x)) || 0) + val(x))))
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

/** Everything the Overview needs, from the same functions the reports use. */
export function financialSummary(r) {
  const pl = profitAndLoss(r)
  const cf = cashFlow(r)
  const inc = incomeRecords(r)
  const exp = expenseRecords(r)
  return {
    ...pl,
    totalExpenses: round(pl.cogs + pl.opex),
    cashReceived: cf.inflow, cashPaid: cf.outflow, netCash: cf.net,
    receivables: sum(inc, (x) => x.balance),
    payables: sum(exp.filter((e) => e.status === 'pending'), (e) => e.amount),
    cf,
  }
}

/** Dashboard cards: collected = cash in minus refunds, spent = expenses actually paid. surplus == net cash flow. */
export function totalsFor(r) {
  const cf = cashFlow(r)
  const collected = round(cf.inflow - cf.refunds)
  return { collected, spent: cf.expensesPaid, surplus: round(collected - cf.expensesPaid) }
}

/* ---------------- period series (monthly / quarterly / yearly) ---------------- */
export function periodSeries(r, granularity = 'month') {
  const firstDates = [
    ...memberships.map((m) => m.start_date), ...bookings.map((b) => b.booking_date), ...incomeEntries.map((i) => i.income_date),
    ...expenses.map((e) => e.expense_date), ...payments.map((p) => p.payment_date.slice(0, 10)),
  ].sort()
  const from = parseISO(r ? r[0] : firstDates[0] || iso(TODAY))
  const to = parseISO(r ? r[1] : iso(TODAY))
  const start = { month: startOfMonth, quarter: startOfQuarter, year: startOfYear }[granularity]
  const end = { month: endOfMonth, quarter: endOfQuarter, year: endOfYear }[granularity]
  const step = { month: 1, quarter: 3, year: 12 }[granularity]
  const label = (d) => ({ month: format(d, 'MMM yyyy'), quarter: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`, year: String(d.getFullYear()) }[granularity])
  const out = []
  for (let d = start(from); d <= to; d = addMonths(d, step)) {
    // clip to the selected range so partial periods add up to the range total
    const pr = [iso(d) < (r?.[0] || '0000') ? r[0] : iso(d), iso(end(d)) > (r?.[1] || '9999') ? r[1] : iso(end(d))]
    const pl = profitAndLoss(pr)
    const cf = cashFlow(pr)
    out.push({ label: label(d), from: pr[0], to: pr[1], revenue: pl.revenue, cogs: pl.cogs, gross: pl.gross, opex: pl.opex, net: pl.net, cashIn: cf.inflow, cashOut: cf.outflow, netCash: cf.net })
  }
  return out
}

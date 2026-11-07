/*
 * Demo data layer. Business rules live here (not in components) so the whole
 * file can be swapped for Supabase calls later:
 *   - every function that mutates data  -> an insert/update/RPC
 *   - every selector                    -> a query / view
 * Payments, memberships and expenses are never overwritten; renewals create
 * new membership rows and refunds only flip a payment's status.
 */
import { useSyncExternalStore } from 'react'
import { addDays, addMonths, endOfMonth, format, isAfter, parseISO, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { formatDate, formatHour } from '@/utils/format'
import {
  BRAND, TODAY, bookings, daysLeft, expenses, incomeEntries, iso, membershipStatus, memberships, payments, plans, students,
} from '@/data/mock'
import { incomeRecords, totalsFor as accountingTotals } from './accounting'

export const totalsFor = accountingTotals

/* ---------------- subscription ---------------- */
let version = 0
const listeners = new Set()
const notify = () => {
  version += 1
  listeners.forEach((l) => l())
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
/** Call at the top of any component that reads data; returns a number to use as a memo dependency. */
export const useStore = () => useSyncExternalStore(subscribe, () => version)

/* ---------------- audit log (financial records) ---------------- */
export const auditLog = []
const actor = () => {
  try { return JSON.parse(localStorage.getItem('cricket_admin_session') || '{}').email || 'admin' } catch { return 'admin' }
}
/** changes: {field: [before, after]} for edits; summary: short human text. */
function audit(entity, entity_id, code, action, summary, changes) {
  auditLog.unshift({ id: `a${auditLog.length + 1}`, at: format(new Date(), "yyyy-MM-dd'T'HH:mm:ss"), actor: actor(), entity, entity_id, code, action, summary, changes: changes || null })
}
export const logExport = (summary) => { audit('export', '-', '-', 'export', summary); notify() }
const diff = (before, after, fields) => {
  const c = {}
  fields.forEach((f) => { if (String(before[f] ?? '') !== String(after[f] ?? '')) c[f] = [before[f] ?? '', after[f] ?? ''] })
  return c
}

let uid = 1000
const newId = (p) => `${p}${++uid}`

/* ---------------- settings (academy profile + UPI id) ---------------- */
const SETTINGS_KEY = 'cricket_settings'
let settings = { name: BRAND.name, phone: '', address: 'Chhindwara, Madhya Pradesh', upi_id: '', hourly_rate: 500, open_hour: 6, close_hour: 22 }
try {
  settings = { ...settings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
} catch { /* ignore */ }
export const getSettings = () => settings
export function updateSettings(patch) {
  settings = { ...settings, ...patch }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
  notify()
}

/* ---------------- lookups ---------------- */
export const getStudent = (id) => students.find((s) => s.id === id)
export const getPlan = (id) => plans.find((p) => p.id === id)
export const getMembership = (id) => memberships.find((m) => m.id === id)
export const getBooking = (id) => bookings.find((b) => b.id === id)
export const getPayment = (id) => payments.find((p) => p.id === id)

const sumPaid = (list) => list.filter((p) => p.status === 'completed').reduce((s, p) => s + p.amount, 0)
export const paidForMembership = (id) => sumPaid(payments.filter((p) => p.membership_id === id))
export const paidForBooking = (id) => sumPaid(payments.filter((p) => p.arena_booking_id === id))
export const membershipsOf = (studentId) =>
  memberships.filter((m) => m.student_id === studentId).sort((a, b) => b.start_date.localeCompare(a.start_date))

export const enrichMembership = (m) => {
  const paid = paidForMembership(m.id)
  return { ...m, status: membershipStatus(m), paid, balance: Math.max(0, m.amount - paid), days_left: daysLeft(m) }
}

export const paymentStatusOf = (amount, paid) => (paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid')

/** One row per student for the list: current membership + money position across ALL memberships. */
export function studentRow(s) {
  const list = membershipsOf(s.id).map(enrichMembership)
  const current = list.find((m) => m.status === 'active') || list.find((m) => m.status === 'upcoming') || list[0]
  const outstanding = list.reduce((t, m) => t + m.balance, 0)
  const total = list.reduce((t, m) => t + m.amount, 0)
  const paid = list.reduce((t, m) => t + m.paid, 0)
  return {
    ...s,
    current,
    membership_status: current?.status || 'none',
    outstanding,
    total_paid: paid,
    pay_status: list.length ? paymentStatusOf(total, paid) : 'none',
    // oldest unpaid membership first, so "collect" settles in order
    unpaid_membership: [...list].reverse().find((m) => m.balance > 0),
  }
}

export function enrichBooking(b) {
  const paid = paidForBooking(b.id)
  const cancelled = b.status === 'cancelled'
  return {
    ...b, paid, hours: b.end_hour - b.start_hour,
    balance: cancelled ? 0 : Math.max(0, b.total_amount - paid),
    pay_status: cancelled ? 'cancelled' : paymentStatusOf(b.total_amount, paid),
  }
}

export const payerName = (p) => (p.student_id ? getStudent(p.student_id)?.full_name : getBooking(p.arena_booking_id)?.customer_name) || '—'
export const paymentType = (p) => (p.student_id ? 'Membership' : 'Arena booking')
export const paymentLinkLabel = (p) =>
  p.membership_id ? `${getMembership(p.membership_id)?.plan_name} plan` : (() => { const b = getBooking(p.arena_booking_id); return b ? `${formatDate(b.booking_date)}, ${formatHour(b.start_hour)}–${formatHour(b.end_hour)}` : '—' })()

/* ---------------- membership dates ---------------- */
/** Calendar months, inclusive end date: 15 Jan + 1 month => 14 Feb. */
export const endDateFor = (startISO, months) => iso(addDays(addMonths(parseISO(startISO), months), -1))

/** Suggested start for a new/renewed membership: day after the latest end if still running, else today. */
export function suggestedStart(studentId) {
  const latest = membershipsOf(studentId).map((m) => m.end_date).sort().pop()
  if (latest && latest >= iso(TODAY)) return iso(addDays(parseISO(latest), 1))
  return iso(TODAY)
}
/** Existing membership that overlaps a proposed start date, if any. */
export const overlapFor = (studentId, startISO) => membershipsOf(studentId).find((m) => m.end_date >= startISO)

/* ---------------- mutations ---------------- */
const nowStamp = () => format(new Date(), "yyyy-MM-dd'T'HH:mm:ss")
const nextReceipt = () => `RCP-${String(payments.length + 1).padStart(5, '0')}`

export function addStudent({ full_name, mobile, gender, date_of_birth }) {
  const s = { id: newId('s'), full_name: full_name.trim(), mobile: mobile.trim(), gender: gender || '', date_of_birth: date_of_birth || '', admission_date: iso(TODAY), status: 'active' }
  students.unshift(s)
  notify()
  return s
}
export function updateStudent(id, patch) {
  Object.assign(getStudent(id), patch)
  notify()
}

export function addMembership({ student_id, plan_id, start_date }) {
  const plan = getPlan(plan_id)
  const m = {
    id: newId('m'), student_id, plan_id, plan_name: plan.name, duration_months: plan.duration_months,
    start_date, end_date: endDateFor(start_date, plan.duration_months), amount: plan.standard_price, // price snapshot
  }
  memberships.push(m)
  audit('membership', m.id, m.id, 'create', `${m.plan_name} ${m.start_date} to ${m.end_date}, ${m.amount}`)
  notify()
  return m
}

/**
 * Creates a completed payment linked to its source. Callers must only call this
 * AFTER the admin has confirmed the money was received.
 */
export function recordPayment({ student_id, membership_id, arena_booking_id, amount, payment_method, reference_number }) {
  const amt = Number(amount)
  if (!(amt > 0)) throw new Error('Enter an amount greater than zero.')
  const balance = membership_id
    ? enrichMembership(getMembership(membership_id)).balance
    : enrichBooking(getBooking(arena_booking_id)).balance
  if (amt > balance) throw new Error(`Amount is more than the balance due (₹${balance}).`)
  const p = {
    id: newId('p'), receipt_number: nextReceipt(), student_id, membership_id, arena_booking_id, amount: amt,
    payment_date: nowStamp(), payment_method, reference_number: reference_number || '', status: 'completed',
  }
  payments.push(p)
  audit('payment', p.id, p.receipt_number, 'create', `Received ${amt} by ${payment_method}`)
  notify()
  return p
}
export function refundPayment(id) {
  const p = getPayment(id)
  p.status = 'refunded'
  p.refunded_at = nowStamp()
  audit('payment', id, p.receipt_number, 'refund', `Refunded ${p.amount}`, { status: ['completed', 'refunded'] })
  notify()
}

/** Student + first membership + (optional) first payment in one go. */
export function enrollStudent({ student, plan_id, start_date, payment }) {
  const s = addStudent(student)
  let m = null
  let p = null
  if (plan_id) {
    m = addMembership({ student_id: s.id, plan_id, start_date })
    if (payment?.amount > 0) p = recordPayment({ student_id: s.id, membership_id: m.id, ...payment })
  }
  return { student: s, membership: m, payment: p }
}

/** Hours already taken on a date (cancelled bookings release their slots). */
export const bookedHours = (dateISO) => {
  const taken = new Set()
  bookings.filter((b) => b.booking_date === dateISO && b.status !== 'cancelled').forEach((b) => {
    for (let h = b.start_hour; h < b.end_hour; h++) taken.add(h)
  })
  return taken
}
/** Half-open interval overlap: [s1,e1) and [s2,e2) overlap iff s1 < e2 and s2 < e1. */
const overlaps = (s1, e1, s2, e2) => s1 < e2 && s2 < e1

/**
 * Re-checks the slot at save time, inside the same synchronous step as the insert.
 * The real protection must live in the database (see supabase/migrations/0001_arena_slots.sql);
 * this mirrors it so the demo behaves the same way.
 */
export function addBooking({ customer_name, mobile, booking_date, details, start_hour, end_hour, total_amount, advance }) {
  if (!(end_hour > start_hour)) throw new Error('Pick at least one time slot.')
  const clash = bookings.find((b) => b.booking_date === booking_date && b.status !== 'cancelled' && overlaps(start_hour, end_hour, b.start_hour, b.end_hour))
  if (clash) throw new Error('One of these slots was just booked. Pick another time.')
  const b = {
    id: newId('b'), customer_name: customer_name.trim(), mobile: mobile.trim(), booking_date, details: (details || '').trim(),
    start_hour, end_hour, total_amount: Number(total_amount), status: 'confirmed', created_at: iso(TODAY),
  }
  bookings.unshift(b)
  audit('booking', b.id, b.id, 'create', `${customer_name} ${booking_date} ${start_hour}:00-${end_hour}:00, total ${b.total_amount}`)
  let p = null
  if (advance?.amount > 0) p = recordPayment({ arena_booking_id: b.id, ...advance })
  else notify()
  return { booking: b, payment: p }
}
export function cancelBooking(id) {
  audit('booking', id, id, 'cancel', `Cancelled booking of ${getBooking(id).customer_name}`, { status: ['confirmed', 'cancelled'] })
  getBooking(id).status = 'cancelled' // payments stay in the ledger; refund separately if money is returned
  notify()
}

const EXP_FIELDS = ['name', 'category', 'amount', 'expense_date', 'payment_method', 'vendor', 'reason', 'status', 'paid_date', 'quantity']
export function saveExpense(data, id) {
  const status = data.status === 'pending' ? 'pending' : 'paid'
  const clean = {
    name: data.name.trim(), category: data.category, amount: Number(data.amount), expense_date: data.expense_date,
    vendor: (data.vendor || '').trim(), reason: (data.reason || '').trim(), quantity: data.quantity ? Number(data.quantity) : null,
    status, payment_method: status === 'paid' ? data.payment_method || 'cash' : '', paid_date: status === 'paid' ? data.paid_date || data.expense_date : null,
  }
  if (!(clean.amount > 0)) throw new Error('Amount must be more than zero.')
  if (id) {
    const e = expenses.find((x) => x.id === id)
    const changes = diff(e, clean, EXP_FIELDS)
    Object.assign(e, clean)
    if (data.attachment !== undefined) {
      if (e.attachment?.name !== data.attachment?.name) changes.attachment = [e.attachment?.name || '', data.attachment?.name || '']
      e.attachment = data.attachment
    }
    audit('expense', id, e.code, 'update', `Edited ${e.name}`, changes)
  } else {
    const e = { id: newId('e'), code: `EXP-${String(expenses.length + 1).padStart(5, '0')}`, ...clean, attachment: data.attachment || null }
    expenses.unshift(e)
    audit('expense', e.id, e.code, 'create', `${e.name} ${e.amount} (${e.category}, ${e.status})`)
  }
  expenses.sort((a, b) => b.expense_date.localeCompare(a.expense_date))
  notify()
}
export function markExpensePaid(id, method = 'cash') {
  const e = expenses.find((x) => x.id === id)
  const changes = { status: ['pending', 'paid'], paid_date: ['', iso(TODAY)], payment_method: ['', method] }
  Object.assign(e, { status: 'paid', paid_date: iso(TODAY), payment_method: method })
  audit('expense', id, e.code, 'update', `Marked paid: ${e.name}`, changes)
  notify()
}
export function deleteExpense(id) {
  const i = expenses.findIndex((x) => x.id === id)
  const [e] = expenses.splice(i, 1)
  audit('expense', id, e.code, 'delete', `Deleted ${e.name} ${e.amount}`, { snapshot: [JSON.stringify({ ...e, attachment: e.attachment?.name || null }), ''] })
  notify()
}

const INC_FIELDS = ['title', 'category', 'amount', 'income_date', 'payment_method', 'status', 'description', 'reference', 'received_date']
export function saveIncome(data, id) {
  const status = ['paid', 'pending', 'cancelled'].includes(data.status) ? data.status : 'paid'
  const clean = {
    title: data.title.trim(), category: data.category, amount: Number(data.amount), income_date: data.income_date, status,
    payment_method: status === 'paid' ? data.payment_method || 'cash' : data.payment_method || '', description: (data.description || '').trim(), reference: (data.reference || '').trim(),
    received_date: status === 'paid' ? data.received_date || data.income_date : null,
  }
  if (!(clean.amount > 0)) throw new Error('Amount must be more than zero.')
  if (id) {
    const i = incomeEntries.find((x) => x.id === id)
    audit('income', id, i.code, 'update', `Edited ${i.title}`, diff(i, clean, INC_FIELDS))
    Object.assign(i, clean)
  } else {
    const i = { id: newId('i'), code: `INC-${String(incomeEntries.length + 1).padStart(5, '0')}`, ...clean }
    incomeEntries.unshift(i)
    audit('income', i.id, i.code, 'create', `${i.title} ${i.amount} (${i.category}, ${i.status})`)
  }
  notify()
}
export function markIncomeReceived(id, method = 'cash') {
  const i = incomeEntries.find((x) => x.id === id)
  const changes = { status: [i.status, 'paid'], received_date: ['', iso(TODAY)] }
  Object.assign(i, { status: 'paid', received_date: iso(TODAY), payment_method: method })
  audit('income', id, i.code, 'update', `Marked received: ${i.title}`, changes)
  notify()
}
export function deleteIncome(id) {
  const k = incomeEntries.findIndex((x) => x.id === id)
  const [i] = incomeEntries.splice(k, 1)
  audit('income', id, i.code, 'delete', `Deleted ${i.title} ${i.amount}`, { snapshot: [JSON.stringify(i), ''] })
  notify()
}

export function savePlan(data, id) {
  const clean = { name: data.name.trim(), duration_months: Number(data.duration_months), standard_price: Number(data.standard_price), description: data.description || '', is_active: !!data.is_active }
  if (id) Object.assign(getPlan(id), clean)
  else plans.push({ id: newId('plan-'), ...clean })
  notify()
}

/* ---------------- periods & aggregates ---------------- */
/** Returns [fromISO, toISO] (inclusive) or null for all time. */
export function periodRange(period) {
  const now = TODAY
  switch (period) {
    case 'this_month': return [iso(startOfMonth(now)), iso(endOfMonth(now))]
    case 'last_month': { const d = subMonths(now, 1); return [iso(startOfMonth(d)), iso(endOfMonth(d))] }
    case 'last_3_months': return [iso(startOfMonth(subMonths(now, 2))), iso(endOfMonth(now))]
    case 'this_year': return [iso(startOfYear(now)), iso(endOfMonth(now))]
    default: return null
  }
}
export const inRange = (dateStr, range) => !range || (dateStr.slice(0, 10) >= range[0] && dateStr.slice(0, 10) <= range[1])

/** Receivables across all time, from the same income records the Accounts section uses. */
export function pendingTotals() {
  const recs = incomeRecords(null)
  const by = (k) => recs.filter((x) => x.kind === k).reduce((t, x) => t + x.balance, 0)
  const academy = by('membership'), arena = by('arena'), other = by('manual')
  return { academy, arena, other, total: academy + arena + other }
}

export function monthlySeries(n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const d = subMonths(TODAY, n - 1 - i)
    const range = [iso(startOfMonth(d)), iso(endOfMonth(d))]
    const t = totalsFor(range)
    return { month: format(d, 'MMM'), collections: t.collected, expenses: t.spent, surplus: t.surplus }
  })
}
export function admissionsSeries(n = 6) {
  return Array.from({ length: n }, (_, i) => {
    const d = subMonths(TODAY, n - 1 - i)
    const range = [iso(startOfMonth(d)), iso(endOfMonth(d))]
    return { month: format(d, 'MMM'), admissions: students.filter((s) => inRange(s.admission_date, range)).length }
  })
}
export function collectionsByMethod(range) {
  const map = {}
  payments.filter((p) => p.status === 'completed' && inRange(p.payment_date, range)).forEach((p) => { map[p.payment_method] = (map[p.payment_method] || 0) + p.amount })
  incomeEntries.filter((i) => i.status === 'paid' && inRange(i.received_date || i.income_date, range)).forEach((i) => { map[i.payment_method] = (map[i.payment_method] || 0) + i.amount })
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}
export function collectionsBySource(range) {
  const done = payments.filter((p) => p.status === 'completed' && inRange(p.payment_date, range))
  const other = incomeEntries.filter((i) => i.status === 'paid' && inRange(i.received_date || i.income_date, range)).reduce((t, i) => t + i.amount, 0)
  return [
    { name: 'Academy fees', value: sumPaid(done.filter((p) => p.student_id)) },
    { name: 'Arena bookings', value: sumPaid(done.filter((p) => p.arena_booking_id)) },
    ...(other > 0 ? [{ name: 'Other income', value: other }] : []),
  ]
}
/** Paid expenses grouped by category (cash basis, on the date they were paid). */
export function expenseBreakdown(range) {
  const map = new Map()
  expenses.filter((e) => e.status === 'paid' && inRange(e.paid_date || e.expense_date, range)).forEach((e) => {
    const cur = map.get(e.category) || { name: e.category, value: 0, count: 0 }
    cur.value += e.amount
    cur.count += 1
    map.set(e.category, cur)
  })
  return [...map.values()].sort((a, b) => b.value - a.value)
}

export const isUpcoming = (dateStr) => isAfter(parseISO(dateStr), addDays(TODAY, -1))

/* ---------------- external links ---------------- */
/** UPI deep link used for the QR. A scan only opens a payment app; it never confirms a payment. */
export const upiLink = ({ vpa, name, amount, note }) =>
  `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent(name)}&am=${Number(amount).toFixed(2)}&cu=INR${note ? `&tn=${encodeURIComponent(note)}` : ''}`

export function whatsappLink(mobile, message) {
  const digits = String(mobile).replace(/\D/g, '')
  const num = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`
}

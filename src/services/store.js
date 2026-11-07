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
import {
  BRAND, TODAY, bookings, daysLeft, expenses, iso, membershipStatus, memberships, payments, plans, students,
} from '@/data/mock'

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

let uid = 1000
const newId = (p) => `${p}${++uid}`

/* ---------------- settings (academy profile + UPI id) ---------------- */
const SETTINGS_KEY = 'cricket_settings'
let settings = { name: BRAND.name, phone: '', address: 'Chhindwara, Madhya Pradesh', upi_id: '' }
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
  return { ...b, paid, balance: Math.max(0, b.total_amount - paid), pay_status: paymentStatusOf(b.total_amount, paid) }
}

export const payerName = (p) => (p.student_id ? getStudent(p.student_id)?.full_name : getBooking(p.arena_booking_id)?.customer_name) || '—'
export const paymentType = (p) => (p.student_id ? 'Membership' : 'Arena booking')
export const paymentLinkLabel = (p) =>
  p.membership_id ? `${getMembership(p.membership_id)?.plan_name} plan` : getBooking(p.arena_booking_id)?.details || '—'

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
  notify()
  return p
}
export function refundPayment(id) {
  getPayment(id).status = 'refunded'
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

export function addBooking({ customer_name, mobile, booking_date, details, total_amount, advance }) {
  const b = { id: newId('b'), customer_name: customer_name.trim(), mobile: mobile.trim(), booking_date, details: details.trim(), total_amount: Number(total_amount), created_at: iso(TODAY) }
  bookings.unshift(b)
  let p = null
  if (advance?.amount > 0) p = recordPayment({ arena_booking_id: b.id, ...advance })
  else notify()
  return { booking: b, payment: p }
}

export function saveExpense(data, id) {
  const clean = { name: data.name.trim(), amount: Number(data.amount), expense_date: data.expense_date, reason: (data.reason || '').trim(), quantity: data.quantity ? Number(data.quantity) : null }
  if (id) Object.assign(expenses.find((e) => e.id === id), clean)
  else expenses.unshift({ id: newId('e'), ...clean })
  expenses.sort((a, b) => b.expense_date.localeCompare(a.expense_date))
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

/** Same arithmetic everywhere: collected = completed payments; surplus = collected − expenses. */
export function totalsFor(range) {
  const collected = sumPaid(payments.filter((p) => inRange(p.payment_date, range)))
  const spent = expenses.filter((e) => inRange(e.expense_date, range)).reduce((t, e) => t + e.amount, 0)
  return { collected, spent, surplus: collected - spent }
}

export function pendingTotals() {
  const academy = students.filter((s) => s.status === 'active').reduce((t, s) => t + studentRow(s).outstanding, 0)
  const arena = bookings.reduce((t, b) => t + enrichBooking(b).balance, 0)
  return { academy, arena, total: academy + arena }
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
  return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}
export function collectionsBySource(range) {
  const done = payments.filter((p) => p.status === 'completed' && inRange(p.payment_date, range))
  return [
    { name: 'Academy fees', value: sumPaid(done.filter((p) => p.student_id)) },
    { name: 'Arena bookings', value: sumPaid(done.filter((p) => p.arena_booking_id)) },
  ]
}
/** Groups by expense name (case-insensitive) so "Electricity bill" rolls up across months. */
export function expenseBreakdown(range) {
  const map = new Map()
  expenses.filter((e) => inRange(e.expense_date, range)).forEach((e) => {
    const k = e.name.trim().toLowerCase()
    const cur = map.get(k) || { name: e.name.trim(), value: 0, count: 0 }
    cur.value += e.amount
    cur.count += 1
    map.set(k, cur)
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

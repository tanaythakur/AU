/*
 * Data services for the screens.
 *  - READS are synchronous selectors over the collections filled by dataLoader.js (data/db.js arrays).
 *  - WRITES go to Supabase (RPCs for anything that moves money or must be atomic; plain CRUD for simple records),
 *    then refetch what changed, so the UI always shows what the database actually committed.
 * Business rules (overpayment, slot overlap, immutability, audit) are enforced IN THE DATABASE; the checks in the
 * UI are only for convenience. Payments, memberships and expenses history is never overwritten.
 */
import { addDays, addMonths, endOfMonth, format, isAfter, parseISO, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { supabase } from '@/lib/supabaseClient'
import { formatDate, formatHour } from '@/utils/format'
import {
  TODAY, bookings, daysLeft, expenses, incomeEntries, iso, membershipStatus, memberships, payments, plans, students,
} from '@/data/db'
import { incomeRecords, totalsFor as accountingTotals } from './accounting'
import { auditLog, friendlyError, getSettings, isAuthFailure, refresh, useStore } from './dataLoader'

export { auditLog, getSettings, useStore }
export const totalsFor = accountingTotals

/** Unwrap a Supabase response or throw a friendly Error. */
async function run(promise) {
  let res
  try { res = await promise } catch (e) { throw friendlyError(e) }
  if (res.error) {
    if (isAuthFailure(res.error)) await supabase.auth.signOut().catch(() => {}) // dead session: back to the login page
    throw friendlyError(res.error)
  }
  return res.data
}
const pad = (h) => String(h).padStart(2, '0')
const timeOf = (h) => `${pad(h)}:00:00` // 24 -> '24:00:00' (valid, means midnight at the end of the day)

/* ---------------- lookups & selectors ---------------- */
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

/* ---------------- mutations (all async; each refetches what it changed) ---------------- */
const payArgs = (pay) => ({ p_pay_amount: pay?.amount || 0, p_method: pay?.payment_method || null, p_reference: pay?.reference_number || null })

/** Student + first membership + first payment in ONE database transaction. Plan is optional. */
export async function enrollStudent({ student, plan_id, start_date, payment }) {
  const r = await run(supabase.rpc('enroll_student', {
    p_full_name: student.full_name, p_mobile: student.mobile, p_gender: student.gender || null, p_date_of_birth: student.date_of_birth || null,
    p_plan_id: plan_id || null, p_start_date: start_date || null, ...payArgs(payment),
  }))
  await refresh('students', 'memberships', 'payments', 'audit')
  return { student: students.find((s) => s.id === r.student_id), membership: memberships.find((m) => m.id === r.membership_id), payment: payments.find((p) => p.id === r.payment_id) }
}

/** New membership / renewal (always a NEW row) with an optional first payment, atomically. */
export async function addMembership({ student_id, plan_id, start_date, payment }) {
  const r = await run(supabase.rpc('add_membership', { p_student_id: student_id, p_plan_id: plan_id, p_start_date: start_date || null, ...payArgs(payment) }))
  await refresh('memberships', 'payments', 'audit')
  return { membership: memberships.find((m) => m.id === r.membership_id), payment: payments.find((p) => p.id === r.payment_id) }
}

/** Collect money against a membership OR a booking. Overpayment is rejected by the database. */
export async function recordPayment({ membership_id, arena_booking_id, amount, payment_method, reference_number }) {
  const r = await run(supabase.rpc('record_payment', {
    p_membership_id: membership_id || null, p_arena_booking_id: arena_booking_id || null, p_amount: amount, p_method: payment_method, p_reference: reference_number || null,
  }))
  await refresh('payments', 'audit')
  return payments.find((p) => p.id === r.payment_id)
}

export async function refundPayment(id) {
  await run(supabase.rpc('refund_payment', { p_payment_id: id, p_reason: '' }))
  await refresh('payments', 'audit')
}

export async function updateStudent(id, patch) {
  await run(supabase.from('students').update({
    full_name: patch.full_name.trim(), mobile: patch.mobile.trim(), gender: patch.gender || null, date_of_birth: patch.date_of_birth || null,
  }).eq('id', id))
  await refresh('students', 'audit')
}

/** Permanent delete. The database refuses it if the student has any membership/payment history (archive instead). */
export async function deleteStudent(id) {
  await run(supabase.rpc('delete_student', { p_student_id: id }))
  await refresh('students', 'audit')
}
/** 'archived' hides a student from lists but keeps every payment and report; 'active' restores. */
export async function setStudentStatus(id, status) {
  await run(supabase.from('students').update({ status }).eq('id', id))
  await refresh('students', 'audit')
}

/** Hours already taken on a date. Display aid only: the database exclusion constraint is the real guard. */
export const bookedHours = (dateISO) => {
  const taken = new Set()
  bookings.filter((b) => b.booking_date === dateISO && b.status !== 'cancelled').forEach((b) => {
    for (let h = b.start_hour; h < b.end_hour; h++) taken.add(h)
  })
  return taken
}

/** Create a booking (+ customer link + advance payment) atomically. A clash returns "That time slot was just booked". */
export async function addBooking({ customer_name, mobile, booking_date, details, start_hour, end_hour, total_amount, advance }) {
  let r
  try {
    r = await run(supabase.rpc('create_arena_booking', {
      p_customer_name: customer_name, p_mobile: mobile, p_booking_date: booking_date, p_start_time: timeOf(start_hour), p_end_time: timeOf(end_hour),
      p_total: Number(total_amount), p_notes: details || '', p_advance: advance?.amount || 0, p_method: advance?.payment_method || null, p_reference: advance?.reference_number || null,
    }))
  } catch (e) {
    await refresh('bookings').catch(() => {}) // someone else may have taken the slot: show the truth
    throw e
  }
  await refresh('bookings', 'payments', 'audit')
  return { booking: bookings.find((b) => b.id === r.booking_id), payment: payments.find((p) => p.id === r.payment_id) }
}

export async function cancelBooking(id) {
  await run(supabase.rpc('cancel_arena_booking', { p_booking_id: id }))
  await refresh('bookings', 'audit')
}

/* ---- expenses ---- */
const BUCKET = 'expense-bills'
const safeName = (n) => n.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80)
/** data.attachment: File (new upload) | {path,name} (keep) | null (none). */
async function uploadBill(file) {
  const path = `bills/${crypto.randomUUID()}__${safeName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw friendlyError(error)
  return path
}
export async function getAttachmentUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error) throw friendlyError(error)
  return data.signedUrl
}

export async function saveExpense(data, id) {
  const status = data.status === 'pending' ? 'pending' : 'paid'
  const amount = Number(data.amount)
  if (!(amount > 0)) throw new Error('Amount must be more than zero.')
  let attachment_path = null
  let uploaded = null
  if (data.attachment instanceof File) attachment_path = uploaded = await uploadBill(data.attachment)
  else if (data.attachment?.path) attachment_path = data.attachment.path
  const row = {
    title: data.name.trim(), category: data.category, amount, expense_date: data.expense_date, vendor: (data.vendor || '').trim(),
    description: (data.reason || '').trim(), quantity: data.quantity ? Number(data.quantity) : null, status,
    payment_method: status === 'paid' ? data.payment_method || 'cash' : null, paid_date: status === 'paid' ? data.paid_date || data.expense_date : null,
    attachment_path,
  }
  try {
    await run(id ? supabase.from('expenses').update(row).eq('id', id) : supabase.from('expenses').insert(row))
  } catch (e) {
    if (uploaded) await supabase.storage.from(BUCKET).remove([uploaded]).catch(() => {}) // don't leave an orphan file
    throw e
  }
  await refresh('expenses', 'audit')
}
export async function markExpensePaid(id, method = 'cash') {
  await run(supabase.from('expenses').update({ status: 'paid', paid_date: iso(TODAY), payment_method: method }).eq('id', id))
  await refresh('expenses', 'audit')
}
/** The bill file is kept (it is evidence); the deletion itself is recorded in the audit log with a full snapshot. */
export async function deleteExpense(id) {
  await run(supabase.from('expenses').delete().eq('id', id))
  await refresh('expenses', 'audit')
}

/* ---- other income ---- */
export async function saveIncome(data, id) {
  const status = ['paid', 'pending', 'cancelled'].includes(data.status) ? data.status : 'paid'
  const amount = Number(data.amount)
  if (!(amount > 0)) throw new Error('Amount must be more than zero.')
  const row = {
    title: data.title.trim(), category: data.category, amount, income_date: data.income_date, status,
    payment_method: status === 'paid' ? data.payment_method || 'cash' : data.payment_method || null,
    received_date: status === 'paid' ? data.received_date || data.income_date : null,
    description: (data.description || '').trim(), reference: (data.reference || '').trim(),
  }
  await run(id ? supabase.from('income_entries').update(row).eq('id', id) : supabase.from('income_entries').insert(row))
  await refresh('income', 'audit')
}
export async function markIncomeReceived(id, method = 'cash') {
  await run(supabase.from('income_entries').update({ status: 'paid', received_date: iso(TODAY), payment_method: method }).eq('id', id))
  await refresh('income', 'audit')
}
export async function deleteIncome(id) {
  await run(supabase.from('income_entries').delete().eq('id', id))
  await refresh('income', 'audit')
}

/* ---- plans & settings ---- */
export async function savePlan(data, id) {
  const row = { name: data.name.trim(), duration_months: Number(data.duration_months), price: Number(data.standard_price), description: data.description || '', is_active: !!data.is_active }
  await run(id ? supabase.from('membership_plans').update(row).eq('id', id) : supabase.from('membership_plans').insert(row))
  await refresh('plans', 'audit')
}
export async function updateSettings(patch) {
  await run(supabase.from('academy_settings').update({
    name: patch.name, phone: patch.phone || '', address: patch.address || '', upi_id: (patch.upi_id || '').trim(),
    hourly_rate: Number(patch.hourly_rate), open_hour: Number(patch.open_hour), close_hour: Number(patch.close_hour),
  }).eq('id', true))
  await refresh('settings', 'audit')
}

/** Record an Excel export in the audit log (server-side). */
export async function logExport(summary) {
  await run(supabase.rpc('log_export', { p_summary: summary }))
  await refresh('audit')
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

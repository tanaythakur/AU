/*
 * Database row -> UI shape. Pure functions (no Supabase import) so they are unit-testable.
 * Timestamps are converted to Asia/Kolkata wall-clock strings ('YYYY-MM-DDTHH:mm:ss'),
 * so a date means the same day for the admin no matter where the browser's clock is set.
 */
const istFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})

export function toIST(ts) {
  if (!ts) return ''
  const p = Object.fromEntries(istFmt.formatToParts(new Date(ts)).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`
}
const num = (v) => (v === null || v === undefined ? 0 : Number(v))
const hourOf = (t) => Number(String(t).slice(0, 2)) // '06:00:00' -> 6, '24:00:00' -> 24

export const mapSettings = (r) => ({
  name: r.name, phone: r.phone, address: r.address, upi_id: r.upi_id,
  hourly_rate: num(r.hourly_rate), open_hour: Number(r.open_hour), close_hour: Number(r.close_hour),
})
export const mapPlan = (r) => ({
  id: r.id, name: r.name, duration_months: r.duration_months, standard_price: num(r.price), description: r.description, is_active: r.is_active,
})
export const mapStudent = (r) => ({
  id: r.id, full_name: r.full_name, mobile: r.mobile, gender: r.gender || '', date_of_birth: r.date_of_birth || '',
  admission_date: r.admission_date, status: r.status,
})
export const mapMembership = (r) => ({
  id: r.id, student_id: r.student_id, plan_id: r.plan_id, plan_name: r.plan_name, duration_months: r.duration_months,
  start_date: r.start_date, end_date: r.end_date, amount: num(r.price),
})
export const mapPayment = (r, membershipById) => ({
  id: r.id, receipt_number: r.receipt_number, membership_id: r.membership_id, arena_booking_id: r.arena_booking_id,
  student_id: r.membership_id ? membershipById.get(r.membership_id)?.student_id : undefined,
  amount: num(r.amount), payment_method: r.payment_method, reference_number: r.reference_number, status: r.status,
  payment_date: toIST(r.payment_date), refunded_at: r.refunded_at ? toIST(r.refunded_at) : undefined,
})
export const mapBooking = (r, customerById) => {
  const c = customerById.get(r.customer_id)
  return {
    id: r.id, customer_id: r.customer_id, customer_name: c?.name || '', mobile: c?.mobile || '', facility_id: r.facility_id,
    booking_date: r.booking_date, details: r.notes, start_hour: hourOf(r.start_time), end_hour: hourOf(r.end_time),
    total_amount: num(r.total_amount), status: r.status, created_at: toIST(r.created_at).slice(0, 10),
  }
}
const fileNameOf = (path) => (path ? path.split('/').pop().replace(/^[0-9a-f-]{36}__/, '') : '')
export const mapExpense = (r) => ({
  id: r.id, code: r.code, name: r.title, category: r.category, amount: num(r.amount), expense_date: r.expense_date,
  payment_method: r.payment_method || '', vendor: r.vendor, reason: r.description, quantity: r.quantity, status: r.status,
  paid_date: r.paid_date, attachment: r.attachment_path ? { path: r.attachment_path, name: fileNameOf(r.attachment_path) } : null,
})
export const mapIncome = (r) => ({
  id: r.id, code: r.code, title: r.title, category: r.category, amount: num(r.amount), income_date: r.income_date,
  payment_method: r.payment_method || '', status: r.status, description: r.description, reference: r.reference,
  received_date: r.received_date,
})
export const mapCategory = (r) => ({ name: r.name, cogs: r.is_cogs })

/* ---------------- audit ---------------- */
const ENTITY = {
  payments: 'payment', expenses: 'expense', income_entries: 'income', arena_bookings: 'booking', memberships: 'membership',
  students: 'student', arena_customers: 'customer', membership_plans: 'plan', academy_settings: 'settings',
  expense_categories: 'category', export: 'export',
}
const SKIP = new Set(['updated_at', 'created_at', 'created_by'])
function changesOf(before, after) {
  const out = {}
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  keys.forEach((k) => {
    if (SKIP.has(k)) return
    const b = before?.[k] ?? '', a = after?.[k] ?? ''
    if (String(b) !== String(a)) out[k] = [b, a]
  })
  return out
}
export function mapAudit(r) {
  const entity = ENTITY[r.entity] || r.entity
  const row = r.after || r.before || {}
  const money = row.amount !== undefined ? ` ₹${Number(row.amount)}` : row.total_amount !== undefined ? ` ₹${Number(row.total_amount)}` : ''
  const code = r.code && r.code !== '-' ? r.code : String(r.entity_id).slice(0, 8)
  const verb = { create: 'Created', update: 'Edited', delete: 'Deleted', refund: 'Refunded', cancel: 'Cancelled', export: 'Exported' }[r.action]
  const summary = r.action === 'export' ? r.after?.summary || 'Excel export' : `${verb} ${entity} ${code}${money}`
  const changes = r.action === 'update' || r.action === 'refund' || r.action === 'cancel' ? changesOf(r.before, r.after) : null
  return { id: String(r.id), at: toIST(r.at), actor: r.actor_email || 'system', entity, entity_id: r.entity_id, code, action: r.action, summary, changes }
}

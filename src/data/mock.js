/*
 * Fictional sample data for the UI build. Replace with Supabase queries later
 * (see src/services). All names, numbers and contacts are made up.
 * These arrays are mutated by src/services/store.js so the demo flows work.
 */
import { addDays, addMonths, format, parseISO, startOfDay, differenceInCalendarDays } from 'date-fns'

export const BRAND = { name: 'Cricket Academy', tagline: 'Sports Arena · Chhindwara' }

export const TODAY = startOfDay(new Date())
export const iso = (d) => format(d, 'yyyy-MM-dd')
export const off = (n) => iso(addDays(TODAY, n))

// deterministic pseudo-random so the sample data is stable between reloads
let seed = 11
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const int = (a, b) => Math.floor(rnd() * (b - a + 1)) + a
const pick = (arr) => arr[int(0, arr.length - 1)]

/* ---------------- Plans ---------------- */
export const plans = [
  { id: 'plan-1', name: 'Monthly', duration_months: 1, standard_price: 1500, description: '1 calendar month', is_active: true },
  { id: 'plan-3', name: 'Quarterly', duration_months: 3, standard_price: 4000, description: '3 calendar months', is_active: true },
  { id: 'plan-6', name: 'Half-yearly', duration_months: 6, standard_price: 7500, description: '6 calendar months', is_active: true },
  { id: 'plan-12', name: 'Annual', duration_months: 12, standard_price: 14000, description: '12 calendar months', is_active: true },
]

/* ---------------- Students ---------------- */
const boys = ['Aarav', 'Vihaan', 'Ishaan', 'Kabir', 'Arjun', 'Aditya', 'Rohan', 'Yash', 'Dev', 'Harsh', 'Naman', 'Kunal', 'Pranav', 'Tanmay', 'Atharv', 'Shaurya', 'Om', 'Lakshya', 'Veer', 'Karan', 'Parth', 'Rudra']
const girls = ['Ananya', 'Diya', 'Riya', 'Sanvi', 'Meera', 'Isha', 'Kavya', 'Tanvi', 'Aditi', 'Pooja', 'Nisha', 'Shreya', 'Mansi', 'Khushi']
const lasts = ['Sharma', 'Verma', 'Patel', 'Yadav', 'Choudhary', 'Thakur', 'Jain', 'Dubey', 'Rathore', 'Pawar', 'Kushwaha', 'Soni', 'Malviya', 'Deshmukh', 'Rajput', 'Uikey', 'Bhalavi', 'Gour']

export const students = Array.from({ length: 38 }, (_, i) => {
  const female = i % 3 === 2
  const last = lasts[(i * 7) % lasts.length]
  const first = female ? girls[i % girls.length] : boys[i % boys.length]
  return {
    id: `s${i + 1}`,
    full_name: `${first} ${last}`,
    mobile: `98${int(10000000, 99999999)}`,
    gender: female ? 'Female' : 'Male',
    date_of_birth: '',
    admission_date: i < 8 ? off(-int(0, 7)) : off(-int(8, 420)),
    status: i === 9 || i === 27 ? 'archived' : 'active',
  }
})

/* ---------------- Memberships & payments ---------------- */
export const memberships = []
export const payments = []

function addMembership(student, plan, start, { payMode = 'full' } = {}) {
  const end = addDays(addMonths(start, plan.duration_months), -1)
  const m = {
    id: `m${memberships.length + 1}`,
    student_id: student.id,
    plan_id: plan.id,
    plan_name: plan.name,
    duration_months: plan.duration_months,
    start_date: iso(start),
    end_date: iso(end),
    amount: plan.standard_price,
  }
  memberships.push(m)
  const target = payMode === 'full' ? m.amount : payMode === 'partial' ? Math.round((m.amount * 0.5) / 100) * 100 : 0
  if (target > 0) {
    const when = start > TODAY ? TODAY : start
    payments.push({
      _sort: when.getTime(),
      student_id: student.id,
      membership_id: m.id,
      amount: target,
      payment_date: `${iso(when)}T${String(int(9, 19)).padStart(2, '0')}:${String(int(0, 59)).padStart(2, '0')}:00`,
      payment_method: pick(['upi', 'upi', 'upi', 'cash', 'cash', 'bank_transfer']),
      reference_number: '',
      status: 'completed',
    })
  }
  return m
}

students.forEach((s, i) => {
  const plan = pick(plans)
  const months = plan.duration_months
  let start
  if (s.status === 'archived') start = addMonths(TODAY, -(months + 3))
  else if (i % 7 === 0) start = addMonths(addDays(addDays(TODAY, int(0, 6)), 1), -months) // expires within 7 days
  else start = addDays(TODAY, -int(0, months * 30 + 12))
  if (i % 4 === 0) addMembership(s, pick(plans), addMonths(start, -pick([1, 3, 6])), { payMode: 'full' })
  const r = rnd()
  addMembership(s, plan, start, { payMode: r < 0.72 ? 'full' : r < 0.9 ? 'partial' : 'none' })
})

export function membershipStatus(m, today = TODAY) {
  const start = parseISO(m.start_date)
  const end = parseISO(m.end_date)
  if (start > today) return 'upcoming'
  if (end < today) return 'expired'
  return 'active'
}
export const daysLeft = (m) => differenceInCalendarDays(parseISO(m.end_date), TODAY)
export const isExpiringSoon = (m) => membershipStatus(m) === 'active' && daysLeft(m) <= 7

/* ---------------- Arena bookings ---------------- */
export const bookings = []
// [name, mobile, dayOffset, details, total, advance, method]
;[
  ['Chhindwara Lions XI', '9893012345', 3, 'Outdoor pitch, Sat 6–8 AM', 3000, 1000, 'upi'],
  ['Rahul Deshmukh', '9826098765', 1, 'Indoor turf, 4 nets, 7–8 PM', 1200, 1200, 'cash'],
  ['Satpura Cricket Club', '9770011223', -2, 'Full ground, practice match', 6000, 3000, 'bank_transfer'],
  ['Vikram Malviya', '9425077889', -6, 'Indoor turf, 2 hrs', 800, 0, 'cash'],
  ['Mahadev Sports Association', '9302055667', 8, 'Outdoor pitch, Sunday league', 4500, 1500, 'upi'],
  ['Pench Warriors', '9981044556', -12, 'Team nets, evening', 2000, 2000, 'cash'],
].forEach(([customer_name, mobile, d, details, total_amount, advance, method], i) => {
  const created = off(Math.min(d, 0) - 1)
  const b = { id: `b${i + 1}`, customer_name, mobile, booking_date: off(d), details, total_amount, created_at: created }
  bookings.push(b)
  if (advance > 0)
    payments.push({
      _sort: addDays(TODAY, Math.min(d, 0) - 1).getTime(),
      arena_booking_id: b.id,
      amount: advance,
      payment_date: `${created}T1${int(0, 8)}:${String(int(0, 59)).padStart(2, '0')}:00`,
      payment_method: method,
      reference_number: method === 'bank_transfer' ? `NEFT${int(100000, 999999)}` : '',
      status: 'completed',
    })
})
// one refunded example
const refundable = payments.find((p) => p.student_id && p._sort < TODAY.getTime() - 86400000 * 5)
if (refundable) refundable.status = 'refunded'

payments.sort((a, b) => a._sort - b._sort)
payments.forEach((p, i) => {
  p.id = `p${i + 1}`
  p.receipt_number = `RCP-${String(i + 1).padStart(5, '0')}`
  delete p._sort
})

/* ---------------- Expenses ---------------- */
// [name, amount, dayOffset, quantity, reason]
export const expenses = [
  ['Coach salaries', 22000, -6, null, 'Monthly coach salaries'],
  ['Electricity bill', 4850, -5, null, 'Floodlights, monthly'],
  ['Ground rent', 8000, -4, null, 'Monthly land lease'],
  ['Cricket balls', 8000, -12, 100, 'New ball purchase'],
  ['Pitch preparation', 3200, -9, null, 'Roller and labour'],
  ['Net repair', 1400, -17, null, 'Stitching and repair'],
  ['Broadband', 799, -8, null, 'Monthly internet'],
  ['Stumps set', 2400, -20, 4, 'Wooden stumps'],
  ['Water tanker', 900, -2, null, ''],
  ['Cleaning supplies', 1250, -11, null, ''],
  ['Coach salaries', 22000, -36, null, 'Monthly coach salaries'],
  ['Electricity bill', 5120, -35, null, 'Floodlights, monthly'],
  ['Trophies', 3800, -1, 6, 'Academy cup trophies'],
]
  .map(([name, amount, d, quantity, reason], i) => ({ id: `e${i + 1}`, name, amount, quantity, expense_date: off(d), reason }))
  .sort((a, b) => b.expense_date.localeCompare(a.expense_date))

/* ---------------- Constants ---------------- */
export const PAYMENT_METHODS = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
]
export const methodLabel = (v) => PAYMENT_METHODS.find((m) => m.value === v)?.label || '—'
export const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'all', label: 'All time' },
]

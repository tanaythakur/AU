/*
 * Live data held in memory for the screens. These arrays start EMPTY and are filled ONLY from Supabase by
 * services/dataLoader.js (in place, so every import keeps pointing at the same array).
 * There is no sample data here. The old demo generator lives in tests/fixtures/ and is never bundled.
 */
import { differenceInCalendarDays, format, parseISO, startOfDay } from 'date-fns'

export const BRAND = { name: 'Cricket Academy', tagline: 'Sports Arena · Chhindwara' }

/** Today's date in India (Asia/Kolkata), as a local-midnight Date and as YYYY-MM-DD. */
export const IST_TODAY_STR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
export const TODAY = startOfDay(parseISO(IST_TODAY_STR))
export const iso = (d) => format(d, 'yyyy-MM-dd')
export const off = (n) => {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + n)
  return iso(d)
}

/* ---------------- live collections (filled by the data loader) ---------------- */
export const plans = []
export const students = []
export const memberships = []
export const payments = []
export const bookings = []
export const expenses = []
export const incomeEntries = []

/** Same nine categories the database is seeded with; replaced by the real rows after load. */
export const EXPENSE_CATEGORIES = [
  { name: 'Rent', cogs: false }, { name: 'Salary', cogs: false }, { name: 'Marketing', cogs: false },
  { name: 'Electricity', cogs: false }, { name: 'Internet', cogs: false }, { name: 'Travel', cogs: false },
  { name: 'Maintenance', cogs: false }, { name: 'Purchases', cogs: true }, { name: 'Miscellaneous', cogs: false },
]
export const isCogs = (category) => !!EXPENSE_CATEGORIES.find((c) => c.name === category)?.cogs
export const INCOME_CATEGORIES = ['Tournament fees', 'Sponsorship', 'Merchandise / canteen', 'Miscellaneous income']

/** Replace the contents of a live array without changing its identity. */
export function replaceAll(target, rows) {
  target.length = 0
  target.push(...rows)
}

/* ---------------- membership status ---------------- */
export function membershipStatus(m, today = TODAY) {
  const start = parseISO(m.start_date)
  const end = parseISO(m.end_date)
  if (start > today) return 'upcoming'
  if (end < today) return 'expired'
  return 'active'
}
export const daysLeft = (m) => differenceInCalendarDays(parseISO(m.end_date), TODAY)
export const isExpiringSoon = (m) => membershipStatus(m) === 'active' && daysLeft(m) <= 7

/* ---------------- constants ---------------- */
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

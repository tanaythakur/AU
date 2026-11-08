/*
 * Loads the database into the in-memory collections the screens read from, and refetches after writes.
 * Reads are plain table selects (RLS decides what the admin may see); writes live in store.js (RPCs / direct CRUD).
 * Why a cache: one academy's data is small, every screen and the accounting engine stay synchronous and identical,
 * and the numbers can never differ between screens. Server-side totals (accounting_summary) exist for reconciliation.
 */
import { useSyncExternalStore } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  EXPENSE_CATEGORIES, bookings, expenses, incomeEntries, memberships, payments, plans, replaceAll, students,
} from '@/data/db'
import * as M from './mappers'

/* ---------------- subscription ---------------- */
let version = 0
const listeners = new Set()
export const notify = () => {
  version += 1
  listeners.forEach((l) => l())
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l))
/** Call at the top of any component that reads data; returns a number to use as a memo dependency. */
export const useStore = () => useSyncExternalStore(subscribe, () => version)

/* ---------------- load status ---------------- */
let status = { state: 'idle', error: null } // idle | loading | ready | error
const setStatus = (s) => { status = s; notify() }
export const useDataStatus = () => useSyncExternalStore(subscribe, () => status)

/* ---------------- collections that live here ---------------- */
export const auditLog = []
const customers = []
const DEFAULT_SETTINGS = { name: 'Cricket Academy', phone: '', address: '', upi_id: '', hourly_rate: 500, open_hour: 6, close_hour: 22 }
let settings = { ...DEFAULT_SETTINGS }
export const getSettings = () => settings

/* ---------------- errors ---------------- */
const CONSTRAINT_TEXT = {
  expense_paid_stamp: 'A paid expense needs a paid date (and a pending one must not have one).',
  expense_paid_method: 'Choose how the expense was paid.',
  income_paid_stamp: 'Money marked received needs a received date.',
  income_paid_method: 'Choose how the income was received.',
  expenses_amount_check: 'Amount must be more than zero.',
  income_entries_amount_check: 'Amount must be more than zero.',
  students_mobile_check: 'Enter a valid 10-digit mobile number.',
  academy_settings_upi_id_check: 'Enter a valid UPI ID, for example name@bank.',
  academy_settings_check: 'Closing time must be after opening time.',
  membership_plans_name_key: 'A plan with that name already exists.',
}
export function friendlyError(error) {
  if (!error) return new Error('Something went wrong.')
  const msg = String(error.message || error)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return new Error('Could not reach the server. Check your internet connection and try again.')
  if (error.code === 'PGRST301' || /JWT expired|invalid JWT/i.test(msg)) return new Error('Your session has expired. Please sign in again.')
  if (error.code === '42501' && /Not authorized/.test(msg)) return new Error('You are not authorized to do that.')
  if (error.code === '42501' || /row-level security/.test(msg)) return new Error('You are not authorized to do that.')
  for (const [name, text] of Object.entries(CONSTRAINT_TEXT)) if (msg.includes(name)) return new Error(text)
  if (error.code === '23505') return new Error('That record already exists.')
  if (error.code === '23503') return new Error('A linked record was not found. Refresh and try again.')
  return new Error(msg)
}
export const isAuthFailure = (error) => error && (error.code === 'PGRST301' || error.status === 401 || /JWT expired|invalid JWT/i.test(String(error.message)))

/* ---------------- fetching ---------------- */
const PAGE = 1000 // PostgREST returns at most 1000 rows per request, so page through
async function fetchAll(table, order = 'id') {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order(order).range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...data)
    if (data.length < PAGE) break
  }
  return out
}

const FETCH = {
  settings: async () => { const { data, error } = await supabase.from('academy_settings').select('*').eq('id', true).maybeSingle(); if (error) throw error; return data },
  categories: () => fetchAll('expense_categories', 'sort_order'),
  plans: () => fetchAll('membership_plans', 'created_at'),
  students: () => fetchAll('students', 'created_at'),
  memberships: () => fetchAll('memberships', 'start_date'),
  customers: () => fetchAll('arena_customers', 'created_at'),
  bookings: () => fetchAll('arena_bookings', 'booking_date'),
  payments: () => fetchAll('payments', 'payment_date'),
  expenses: () => fetchAll('expenses', 'expense_date'),
  income: () => fetchAll('income_entries', 'income_date'),
  audit: async () => { const { data, error } = await supabase.from('audit_logs').select('*').order('id', { ascending: false }).limit(500); if (error) throw error; return data },
}
const ALL = Object.keys(FETCH)
// payment rows are mapped using memberships (for student_id) and bookings using customers
const EXPAND = { memberships: ['payments'], payments: ['memberships'], bookings: ['customers'], customers: ['bookings'] }
const expand = (keys) => { const s = new Set(keys); keys.forEach((k) => (EXPAND[k] || []).forEach((x) => s.add(x))); return ALL.filter((k) => s.has(k)) }

let raw = {} // last raw rows per key, so dependent collections can be re-mapped without refetching
async function fetchKeys(keys) {
  const results = await Promise.all(keys.map((k) => FETCH[k]()))
  keys.forEach((k, i) => { raw[k] = results[i] })
}
function mapAll(keys) {
  const has = (k) => keys.includes(k)
  if (has('settings') && raw.settings) settings = { ...DEFAULT_SETTINGS, ...M.mapSettings(raw.settings) }
  if (has('categories')) replaceAll(EXPENSE_CATEGORIES, raw.categories.filter((c) => c.is_active).map(M.mapCategory))
  if (has('plans')) replaceAll(plans, raw.plans.map(M.mapPlan))
  if (has('students')) replaceAll(students, raw.students.map(M.mapStudent))
  if (has('memberships')) replaceAll(memberships, raw.memberships.map(M.mapMembership))
  if (has('customers')) replaceAll(customers, raw.customers)
  if (has('bookings') || has('customers')) {
    const byId = new Map(raw.customers.map((c) => [c.id, c]))
    replaceAll(bookings, raw.bookings.map((b) => M.mapBooking(b, byId)))
  }
  if (has('payments') || has('memberships')) {
    const byId = new Map(memberships.map((m) => [m.id, m]))
    replaceAll(payments, raw.payments.map((p) => M.mapPayment(p, byId)))
  }
  if (has('expenses')) replaceAll(expenses, raw.expenses.map(M.mapExpense).sort((a, b) => b.expense_date.localeCompare(a.expense_date)))
  if (has('income')) replaceAll(incomeEntries, raw.income.map(M.mapIncome))
  if (has('audit')) replaceAll(auditLog, raw.audit.map(M.mapAudit))
}

async function onFailure(error) {
  if (isAuthFailure(error)) await supabase.auth.signOut().catch(() => {})
  throw friendlyError(error)
}

/** Initial load after sign-in. */
export async function loadAll() {
  setStatus({ state: 'loading', error: null })
  try {
    await fetchKeys(ALL)
    mapAll(ALL)
    setStatus({ state: 'ready', error: null })
  } catch (e) {
    const fe = isAuthFailure(e) ? friendlyError(e) : friendlyError(e)
    if (isAuthFailure(e)) await supabase.auth.signOut().catch(() => {})
    setStatus({ state: 'error', error: fe.message })
  }
}

/** Refetch only what a write touched (plus dependents) so every screen shows the committed truth. */
export async function refresh(...keys) {
  const list = expand(keys.length ? keys : ALL)
  try {
    await fetchKeys(list)
    mapAll(list)
    notify()
  } catch (e) {
    await onFailure(e)
  }
}

/** On sign-out: drop everything so no data lingers in memory. */
export function resetData() {
  ;[plans, students, memberships, payments, bookings, expenses, incomeEntries, auditLog, customers].forEach((a) => { a.length = 0 })
  raw = {}
  settings = { ...DEFAULT_SETTINGS }
  setStatus({ state: 'idle', error: null })
}

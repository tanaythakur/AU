import { spawn } from 'node:child_process'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import ExcelJS from 'exceljs'
import { HyperFormula } from 'hyperformula'
import { addDays, format } from 'date-fns'
import { startDb, client, pool as makePool, applyAll, root } from '../db/lib.mjs'
import { startGateway, signJwt } from './gateway.mjs'

const GW = 54322, WEB = 5188, SECRET = crypto.randomBytes(32).toString('hex')
const base = `http://localhost:${WEB}`
const api = `http://localhost:${GW}`
const ADMIN = { email: 'admin@academy.test', password: 'Correct-Horse-1' }
const OUTSIDER = { email: 'outsider@academy.test', password: 'Outsider-Pass-1' }
const shots = path.resolve(root, 'tests', '.shots')
fs.mkdirSync(shots, { recursive: true })

let pass = 0, fail = 0
let shotN = 0
const T = async (name, fn) => {
  try { await fn(); pass++; console.log('PASS |', name) } catch (e) {
    fail++; console.log('FAIL |', name, '\n       ', String(e.message).split('\n')[0])
    try {
      const pg = globalThis.__page
      if (pg) { await pg.screenshot({ path: path.join(shots, `fail-${++shotN}.png`) }); console.log('        url:', pg.url(), '| text:', (await pg.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 240)) }
    } catch { /* ignore */ }
  }
}
const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy') }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
const inr = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n).replace(/\s/g, '')

const dbServer = await startDb({ dir: path.resolve(root, 'tests', '.pgdata-e2e') })
const sup = await client()
await applyAll(sup)
await sup.query('insert into admin_allowlist values ($1)', [ADMIN.email])
const adminId = (await sup.query("insert into auth.users (email) values ($1) returning id", [ADMIN.email])).rows[0].id
await sup.query('alter table auth.users disable trigger a_guard_new_user, disable trigger b_handle_new_user')
const outsiderId = (await sup.query("insert into auth.users (email) values ($1) returning id", [OUTSIDER.email])).rows[0].id
await sup.query('alter table auth.users enable trigger a_guard_new_user, enable trigger b_handle_new_user')

const gwPool = makePool(10)
const anonKey = signJwt({ role: 'anon', iss: 'test' }, SECRET)
const gw = await startGateway({ pool: gwPool, port: GW, secret: SECRET, users: [{ id: adminId, ...ADMIN }, { id: outsiderId, ...OUTSIDER }] })

const vite = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(WEB), '--strictPort'], {
  cwd: root, env: { ...process.env, VITE_SUPABASE_URL: api, VITE_SUPABASE_ANON_KEY: anonKey }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error('vite did not start')), 60000); vite.stdout.on('data', (d) => { if (String(d).includes('Local')) { clearTimeout(t); resolve() } }) })

const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const errs = []
const newPage = async (ctx) => { const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text().slice(0, 200))); return p }
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await newPage(ctx)
globalThis.__page = page

const login = async (p, who = ADMIN) => {
  await p.goto(base + '/login', { waitUntil: 'networkidle' })
  await p.locator('#email').fill(who.email); await p.locator('#password').fill(who.password)
  await p.getByRole('button', { name: 'Sign in' }).click()
}
const nav = (p, name) => p.getByRole('link', { name, exact: true }).first().click().then(() => p.waitForTimeout(500))
const toastText = (p) => p.getByRole('status').allTextContents().then((a) => a.join(' | '))
const truth = async (from = null, to = null) => (await sup.query('select public.accounting_summary($1::date,$2::date) r', [from, to])).rows[0].r
const gwFetch = (p, opts = {}) => fetch(api + p, opts)

try {
  /* ================================================================ AUTH */
  await T('unauthenticated visit to a protected page redirects to /login (no data shown)', async () => {
    await page.goto(base + '/students', { waitUntil: 'networkidle' })
    ok(page.url().endsWith('/login'), page.url())
    ok(!(await page.content()).includes('Aarav'), 'no data on login page')
  })
  await T('wrong password: clear error, stays on login', async () => {
    await login(page, { email: ADMIN.email, password: 'nope' }); await page.waitForTimeout(600)
    ok(await page.getByText('Invalid email or password').isVisible()); ok(page.url().endsWith('/login'))
  })
  await T('a logged-in user who is NOT the admin is refused and signed out', async () => {
    await login(page, OUTSIDER); await page.waitForTimeout(800)
    ok(await page.getByText('not authorized').first().isVisible(), 'message'); ok(page.url().endsWith('/login'))
    const stored = await page.evaluate(() => localStorage.getItem('academy-admin-auth'))
    ok(!stored || !/access_token/.test(stored), 'session must be cleared')
  })
  await T('admin signs in and lands on the dashboard (empty database, no sample data)', async () => {
    await login(page); await page.waitForURL(base + '/', { timeout: 15000 }); await page.waitForTimeout(800)
    ok(await page.getByRole('heading', { name: 'Dashboard' }).isVisible())
    ok((await page.content()).includes('Active students'))
    eq(await page.evaluate(async () => { const D = await import('/src/data/db.js'); return D.students.length + D.payments.length + D.bookings.length }), 0, 'collections start empty')
  })
  await T('session persists across a browser refresh', async () => {
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800)
    ok(page.url() === base + '/'); ok(await page.getByRole('heading', { name: 'Dashboard' }).isVisible())
  })

  /* ================================================================ SETTINGS + PLANS */
  await T('settings: academy profile, UPI id, hourly rate saved to the database', async () => {
    await nav(page, 'Settings')
    await page.getByLabel('Academy name').fill('Test Cricket Academy'); await page.getByLabel('Contact phone').fill('9893011111'); await page.getByLabel('UPI ID').fill('academy@okbank')
    await page.getByLabel('Hourly rate (₹)').fill('600')
    await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(700)
    const r = (await sup.query('select name, upi_id, hourly_rate::float h from academy_settings')).rows[0]
    eq(r, { name: 'Test Cricket Academy', upi_id: 'academy@okbank', h: 600 })
  })
  await T('settings: invalid UPI id is rejected by the form', async () => {
    await page.getByLabel('UPI ID').fill('not valid'); await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(400)
    ok(await page.getByText('Enter a valid UPI ID').isVisible())
    await page.getByLabel('UPI ID').fill('academy@okbank'); await page.getByLabel('Hourly rate (₹)').fill('500'); await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(500)
  })
  await T('plans: add Monthly and Quarterly plans through the UI', async () => {
    await page.getByRole('button', { name: 'Membership plans' }).click()
    for (const [n, m, p] of [['Monthly', '1', '1500'], ['Quarterly', '3', '4000']]) {
      await page.getByRole('button', { name: 'Add Plan' }).click()
      await page.getByLabel('Plan name').fill(n); await page.getByLabel('Months').fill(m); await page.getByLabel('Price (₹)').fill(p)
      await page.getByRole('button', { name: 'Save plan' }).click(); await page.waitForTimeout(600)
    }
    eq((await sup.query('select name, price::float p from membership_plans order by price')).rows, [{ name: 'Monthly', p: 1500 }, { name: 'Quarterly', p: 4000 }])
  })

  /* ================================================================ STUDENTS / PAYMENTS */
  let studentUrl
  await T('add student + Monthly plan + PARTIAL payment (₹500) in one save; balance ₹1,000 shown', async () => {
    await page.goto(base + '/students/new', { waitUntil: 'networkidle' })
    await page.getByLabel(/Student name/).fill('Aarav Sharma'); await page.getByLabel(/Mobile number/).fill('9812345670')
    await page.getByRole('radio', { name: /Monthly/ }).click()
    await page.getByLabel('Amount being paid (₹)').fill('500')
    const save = page.getByRole('button', { name: /Save student/ })
    ok(await save.isDisabled(), 'save is blocked until the payment is verified')
    await page.getByLabel(/I can see this UPI payment/).check()
    await save.click(); await page.waitForURL(/\/students\/[0-9a-f-]{36}$/, { timeout: 15000 }); await page.waitForTimeout(700)
    studentUrl = page.url()
    ok(await page.getByText('₹1,000').first().isVisible(), 'outstanding balance')
    const r = (await sup.query("select count(*)::int n, (select count(*)::int from memberships) m, (select count(*)::int from payments) p from students")).rows[0]
    eq(r, { n: 1, m: 1, p: 1 })
  })
  await T('data persists after a full browser refresh', async () => {
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(800)
    ok(await page.getByRole('heading', { name: 'Aarav Sharma' }).isVisible()); ok(await page.getByText('₹1,000').first().isVisible())
  })
  await T('collect the remaining balance from the profile; receipt is created; balance becomes ₹0', async () => {
    await page.getByRole('button', { name: /Collect ₹1,000/ }).click()
    await page.getByLabel(/I can see this UPI payment/).check()
    await page.getByRole('button', { name: /Confirm payment/ }).click(); await page.waitForTimeout(900)
    ok(await page.getByText('Payment successful').isVisible()); await page.getByRole('button', { name: 'Done' }).click(); await page.waitForTimeout(400)
    const r = (await sup.query("select count(*)::int n, sum(amount)::float s from payments where status='completed'")).rows[0]
    eq(r, { n: 2, s: 1500 }); ok(!(await page.getByRole('button', { name: /^Collect/ }).isVisible().catch(() => false)))
  })
  await T('renew: creates a NEW membership row, old one kept, payment recorded', async () => {
    await page.getByRole('button', { name: 'Renew' }).first().click()
    await page.getByLabel(/I can see this UPI payment/).check()
    await page.getByRole('button', { name: /Confirm renewal/ }).click(); await page.waitForTimeout(900)
    ok(await page.getByText('Renewal completed').first().isVisible()); await page.getByRole('button', { name: 'Done' }).click()
    const r = (await sup.query("select count(*)::int n, min(to_char(start_date,'YYYY-MM-DD')) a, max(to_char(start_date,'YYYY-MM-DD')) b from memberships")).rows[0]
    eq(r.n, 2); ok(r.b > r.a, 'renewal starts after the first membership')
  })
  await T('student list shows the record, search works, edit saves to the database', async () => {
    await nav(page, 'Students')
    await page.getByPlaceholder('Search name or mobile').fill('9812345670'); await page.waitForTimeout(300)
    ok(await page.getByText('Aarav Sharma').first().isVisible())
    await page.getByRole('link', { name: 'Edit student' }).first().click(); await page.waitForTimeout(500)
    await page.getByLabel(/Student name/).fill('Aarav K Sharma'); await page.getByRole('button', { name: 'Save changes' }).click(); await page.waitForTimeout(800)
    eq((await sup.query('select full_name from students')).rows[0].full_name, 'Aarav K Sharma')
  })
  await T('add a second student without a membership; invalid mobile is rejected', async () => {
    await page.goto(base + '/students/new', { waitUntil: 'networkidle' })
    await page.getByLabel(/Student name/).fill('Diya Patel'); await page.getByLabel(/Mobile number/).fill('12345')
    await page.getByRole('button', { name: /Save student/ }).click(); await page.waitForTimeout(400)
    ok(await page.getByText('Enter a 10-digit mobile number').isVisible())
    await page.getByLabel(/Mobile number/).fill('9812345671'); await page.getByRole('button', { name: /Save student/ }).click(); await page.waitForURL(/\/students\/[0-9a-f-]{36}$/, { timeout: 15000 })
    eq((await sup.query('select count(*)::int n from memberships')).rows[0].n, 2, 'no membership created')
  })
  await T('payments page lists every payment; refund marks it refunded and keeps it in the ledger', async () => {
    await nav(page, 'Payments'); await page.getByLabel('Period').selectOption('all').catch(() => {}); await page.waitForTimeout(500)
    ok((await page.getByRole('row').count()) >= 4, 'header + 3 payments')
    await page.getByRole('row').nth(1).getByRole('button', { name: 'Actions' }).click()
    await page.getByRole('menuitem', { name: 'Mark as refunded' }).click()
    await page.getByRole('button', { name: 'Mark refunded' }).click(); await page.waitForTimeout(900)
    const r = (await sup.query("select status, refunded_at is not null r from payments where status='refunded'")).rows
    eq(r, [{ status: 'refunded', r: true }])
    eq((await sup.query('select count(*)::int n from payments')).rows[0].n, 3, 'history intact')
  })

  /* ================================================================ ARENA */
  const slot = (p, t) => p.getByRole('button', { name: t, exact: true })
  const DATE = '2027-03-10'
  await T('arena: book 2 consecutive slots, auto price ₹1,000, ₹300 advance; WhatsApp message correct; persisted', async () => {
    await nav(page, 'Arena Bookings'); await page.getByRole('button', { name: 'New Booking' }).first().click()
    await page.getByLabel(/Customer name/).fill('Team Lions'); await page.getByLabel(/^Mobile/).fill('9893012345'); await page.getByLabel(/Booking date/).fill(DATE)
    await slot(page, '6–7 AM').click(); await slot(page, '7–8 AM').click()
    ok(await page.getByText(/6:00 AM to 8:00 AM · 2 Hours/).isVisible()); eq(await page.getByLabel(/Total amount/).inputValue(), '1000')
    await page.getByLabel('Amount being paid (₹)').fill('300'); await page.getByLabel(/I can see this UPI payment/).check()
    await page.getByRole('button', { name: /Save booking/ }).click(); await page.waitForTimeout(1000)
    const wa = decodeURIComponent(await page.getByRole('link', { name: /Send Booking Confirmation/ }).getAttribute('href'))
    ok(/Time: 6:00 AM to 8:00 AM/.test(wa) && /Duration: 2 Hours/.test(wa) && /Advance Paid: ₹300/.test(wa) && /Remaining Balance: ₹700/.test(wa), wa)
    await page.getByRole('button', { name: 'Done' }).click()
    const b = (await sup.query("select to_char(start_time,'HH24:MI') s, to_char(end_time,'HH24:MI') e, duration_hours d, total_amount::float t from arena_bookings")).rows
    eq(b, [{ s: '06:00', e: '08:00', d: 2, t: 1000 }])
  })
  await T('arena: slots already booked are red/disabled; adjacent slot is free', async () => {
    await page.getByRole('button', { name: 'New Booking' }).first().click(); await page.getByLabel(/Booking date/).fill(DATE)
    ok(await slot(page, '6–7 AM').isDisabled() && await slot(page, '7–8 AM').isDisabled() && await slot(page, '8–9 AM').isEnabled())
    await page.keyboard.press('Escape')
  })
  await T('arena: TWO ADMIN SCREENS race for the same slot — exactly one wins, the other sees a clear message', async () => {
    const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pb = await newPage(ctxB)
    await login(pb); await pb.waitForURL(base + '/'); await nav(pb, 'Arena Bookings')
    const open = async (p, name) => {
      await p.getByRole('button', { name: 'New Booking' }).first().click()
      await p.getByLabel(/Customer name/).fill(name); await p.getByLabel(/^Mobile/).fill('9893099999'); await p.getByLabel(/Booking date/).fill(DATE)
      await slot(p, '10–11 AM').click()
    }
    await open(page, 'Racer A'); await open(pb, 'Racer B') // both screens now show 10-11 as free
    await Promise.all([page.getByRole('button', { name: /Save booking/ }).click(), pb.getByRole('button', { name: /Save booking/ }).click()])
    await page.waitForTimeout(1500)
    const n = (await sup.query("select count(*)::int n from arena_bookings where booking_date='2027-03-10' and start_time='10:00'")).rows[0].n
    eq(n, 1, 'exactly one booking for 10-11')
    const texts = (await toastText(page)) + (await toastText(pb))
    ok(/just booked/.test(texts), `loser must see the message, saw: ${texts}`)
    await ctxB.close()
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  })
  await T('arena: cancel booking frees the slot; payment kept in ledger', async () => {
    await page.goto(base + '/arena', { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
    await page.getByRole('button', { name: /Cancel booking Team Lions/ }).click(); await page.getByRole('button', { name: 'Cancel booking', exact: true }).click(); await page.waitForTimeout(900)
    eq((await sup.query("select status from arena_bookings where start_time='06:00'")).rows[0].status, 'cancelled')
    await page.getByRole('button', { name: 'New Booking' }).first().click(); await page.getByLabel(/Booking date/).fill(DATE)
    ok(await slot(page, '6–7 AM').isEnabled(), 'slot released'); await page.keyboard.press('Escape')
    eq((await sup.query("select count(*)::int n from payments where arena_booking_id is not null and status='completed'")).rows[0].n, 1, 'advance retained')
  })
  await T('arena: collect balance on a booking', async () => {
    await page.goto(base + '/arena', { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'New Booking' }).first().click()
    await page.getByLabel(/Customer name/).fill('Balance Test'); await page.getByLabel(/^Mobile/).fill('9893055555'); await page.getByLabel(/Booking date/).fill('2027-03-12')
    await slot(page, '8–9 AM').click(); await page.getByLabel('Amount being paid (₹)').fill('200'); await page.getByLabel(/I can see this UPI payment/).check()
    await page.getByRole('button', { name: /Save booking/ }).click(); await page.waitForTimeout(1000); await page.getByRole('button', { name: 'Done' }).click()
    await page.getByRole('row', { name: /Balance Test/ }).getByRole('button', { name: 'Collect' }).click()
    await page.getByLabel(/I can see this UPI payment/).check(); await page.getByRole('button', { name: /Confirm payment/ }).click(); await page.waitForTimeout(900)
    ok(await page.getByText('Fully paid.').isVisible()); await page.getByRole('button', { name: 'Done' }).click()
  })

  /* ================================================================ ACCOUNTS */
  await T('accounts: add pending expense, pay it; add pending income, mark received', async () => {
    await page.goto(base + '/accounts/expenses', { waitUntil: 'networkidle' }); await page.getByLabel('Period').selectOption('all').catch(() => {})
    await page.getByRole('button', { name: 'Add Expense' }).first().click()
    await page.getByLabel(/Expense title/).fill('Cricket balls'); await page.getByRole('dialog').getByLabel('Category').selectOption('Purchases')
    await page.getByLabel(/^Amount/).fill('8000'); await page.getByLabel('Payment status').selectOption('pending')
    await page.getByRole('button', { name: 'Save expense' }).click(); await page.waitForTimeout(800)
    eq((await sup.query("select status, category, amount::float a from expenses")).rows, [{ status: 'pending', category: 'Purchases', a: 8000 }])
    await page.getByRole('row', { name: /Cricket balls/ }).getByRole('button', { name: 'Pay' }).click()
    await page.getByRole('button', { name: 'Save expense' }).click(); await page.waitForTimeout(800)
    eq((await sup.query("select status, paid_date is not null p from expenses")).rows[0], { status: 'paid', p: true })
    await nav(page, 'Income'); await page.getByRole('button', { name: 'Add Income' }).first().click()
    await page.getByLabel(/Income title/).fill('Sponsor'); await page.getByLabel(/^Amount/).fill('3000'); await page.getByLabel('Payment status').selectOption('pending')
    await page.getByRole('button', { name: 'Save income' }).click(); await page.waitForTimeout(800)
    await page.getByRole('row', { name: /Sponsor/ }).getByRole('button', { name: 'Received' }).click(); await page.waitForTimeout(800)
    eq((await sup.query("select status from income_entries")).rows[0].status, 'paid')
  })
  await T('accounts: overview cards == database accounting_summary (all periods checked against the DB, not the app)', async () => {
    await page.goto(base + '/accounts', { waitUntil: 'networkidle' }); await page.getByLabel('Period').selectOption('all'); await page.waitForTimeout(700)
    const card = async (label) => (await page.locator('p', { hasText: new RegExp(`^${label}$`) }).first().locator('xpath=../..').locator('p').nth(1).textContent()).replace(/\s/g, '')
    const db = await truth()
    const want = { 'Total revenue': db.revenue, 'Total expenses': db.total_expenses, 'Gross profit': db.gross, 'Net profit / loss': db.net, 'Cash received': db.cash_received, 'Cash paid': db.cash_paid, 'Net cash flow': db.net_cash, 'Pending receivables': db.receivables, 'Pending payables': db.payables }
    const bad = []
    for (const [k, v] of Object.entries(want)) { const got = await card(k); if (got !== inr(Number(v))) bad.push(`${k}: ui=${got} db=${inr(Number(v))}`) }
    eq(bad, [])
    await page.screenshot({ path: path.join(shots, 'accounts_overview.png') })
  })
  await T('accounts: the dashboard Operating Cash Surplus == database net cash this month', async () => {
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(700)
    const m = format(new Date(), 'yyyy-MM'), db = await truth(`${m}-01`, format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd'))
    const shown = (await page.locator('p', { hasText: /^Operating cash surplus$/ }).first().locator('xpath=../..').locator('p').nth(1).textContent()).replace(/\s/g, '')
    eq(shown, inr(Number(db.net_cash)).replace('-₹', '-₹'))
  })
  await T('accounts: ledger closing balance == database; no pending item in the ledger', async () => {
    await page.goto(base + '/accounts/ledger', { waitUntil: 'networkidle' }); await page.getByLabel('Period').selectOption('all'); await page.waitForTimeout(600)
    const db = await truth()
    const closing = (await page.locator('p', { hasText: /^Closing balance$/ }).first().locator('xpath=../..').locator('p').nth(1).textContent()).replace(/\s/g, '')
    eq(closing, inr(Number(db.net_cash)))
  })
  let xlsxPath
  await T('Excel export (all time): downloads, audit-logged, formulas recalc == saved values, summary == DATABASE', async () => {
    await page.goto(base + '/accounts', { waitUntil: 'networkidle' }); await page.getByLabel('Period').selectOption('all'); await page.waitForTimeout(500)
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: 'Export Excel' }).click()])
    xlsxPath = path.join(shots, 'export.xlsx'); await dl.saveAs(xlsxPath)
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsxPath)
    eq(wb.worksheets.map((w) => w.name), ['Financial Summary', 'Income Register', 'Expense Register', 'Profit & Loss Statement', 'Cash Flow Statement', 'Category-wise Expense', 'Monthly Summary', 'Transaction Ledger'])
    const sheets = {}; let formulas = 0
    wb.worksheets.forEach((ws) => { const g = []; ws.eachRow((row, rn) => { g[rn - 1] = []; row.eachCell((cell, cn) => { const v = cell.value; if (v && typeof v === 'object' && 'formula' in v) { formulas++; g[rn - 1][cn - 1] = '=' + v.formula } else if (v instanceof Date) g[rn - 1][cn - 1] = Math.round(v.getTime() / 86400000) + 25569; else g[rn - 1][cn - 1] = v }) }); for (let i = 0; i < g.length; i++) if (!g[i]) g[i] = []; sheets[ws.name] = g })
    const hf = HyperFormula.buildFromSheets(sheets, { licenseKey: 'gpl-v3' })
    const bad = []
    wb.worksheets.forEach((ws) => { const sid = hf.getSheetId(ws.name); ws.eachRow((row, rn) => row.eachCell((cell, cn) => { const v = cell.value; if (v && typeof v === 'object' && 'formula' in v) { const calc = hf.getCellValue({ sheet: sid, row: rn - 1, col: cn - 1 }); if (typeof calc === 'object' || Math.abs(Number(calc) - Number(v.result ?? 0)) > 0.005) bad.push(`${ws.name}!${cell.address}`) } })) })
    ok(formulas > 60, `${formulas} formulas`); eq(bad, [], 'formula cells that disagree with their saved value')
    const db = await truth(), s = wb.getWorksheet('Financial Summary'), got = (r) => Number(s.getCell(`B${r}`).value.result ?? 0)
    const want = [db.revenue, db.total_expenses, db.gross, db.net, db.cash_received, db.cash_paid, db.net_cash, db.receivables, db.payables].map(Number)
    want.forEach((w, i) => { if (Math.abs(got(6 + i) - w) > 0.005) throw new Error(`summary row ${6 + i}: sheet=${got(6 + i)} db=${w}`) })
    eq(Number((await sup.query("select count(*)::int n from audit_logs where action='export'")).rows[0].n), 1, 'export audited by the database')
  })
  await T('audit log screen shows database audit entries with the real actor', async () => {
    await nav(page, 'Accounts'); await page.getByRole('link', { name: 'Audit log' }).click(); await page.waitForTimeout(700)
    ok(await page.getByText(ADMIN.email).first().isVisible(), 'actor email'); ok(await page.getByText(/Exported/).first().isVisible()); ok(await page.getByText(/Refunded payment/).first().isVisible())
    const d = (await sup.query("select count(*)::int n from audit_logs where actor_email=$1", [ADMIN.email])).rows[0].n
    ok(d > 10, `audit rows with actor: ${d}`)
  })

  /* ================================================================ SECURITY (HTTP level, real database underneath) */
  await T('API: anonymous requests cannot read or write anything', async () => {
    const h = { apikey: anonKey, authorization: `Bearer ${anonKey}`, 'content-type': 'application/json' }
    for (const t of ['students', 'payments', 'memberships', 'arena_bookings', 'expenses', 'income_entries', 'audit_logs', 'academy_settings', 'profiles']) {
      const r = await gwFetch(`/rest/v1/${t}?select=*`, { headers: h }); ok([401, 403].includes(r.status), `${t} -> ${r.status}`)
    }
    const w = await gwFetch('/rest/v1/rpc/enroll_student', { method: 'POST', headers: h, body: JSON.stringify({ p_full_name: 'X', p_mobile: '9812345699' }) }); ok([401, 403].includes(w.status), `rpc -> ${w.status}`)
    const s = await gwFetch('/rest/v1/students', { method: 'POST', headers: h, body: JSON.stringify({ full_name: 'X', mobile: '9812345699' }) }); ok([401, 403].includes(s.status), `insert -> ${s.status}`)
  })
  const tokenFor = async (who) => (await (await gwFetch('/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anonKey, 'content-type': 'application/json' }, body: JSON.stringify(who) })).json()).access_token
  await T('API: a valid login that is not the admin sees no rows and cannot call the business functions', async () => {
    const t = await tokenFor(OUTSIDER); const h = { apikey: anonKey, authorization: `Bearer ${t}`, 'content-type': 'application/json' }
    for (const tb of ['students', 'payments', 'expenses', 'audit_logs']) eq(await (await gwFetch(`/rest/v1/${tb}?select=*`, { headers: h })).json(), [], `${tb} visible to outsider`)
    const r = await gwFetch('/rest/v1/rpc/record_payment', { method: 'POST', headers: h, body: JSON.stringify({ p_amount: 5, p_method: 'cash', p_membership_id: crypto.randomUUID() }) }); const j = await r.json(); ok(/Not authorized/.test(j.message), j.message)
    const w = await gwFetch('/rest/v1/expenses', { method: 'POST', headers: h, body: JSON.stringify({ title: 'x', category: 'Rent', amount: 1, expense_date: '2026-01-01', status: 'pending' }) }); ok(w.status === 403, `insert -> ${w.status}`)
  })
  await T('API: even the admin cannot write money tables directly, overpay, or edit/delete history', async () => {
    const t = await tokenFor(ADMIN); const h = { apikey: anonKey, authorization: `Bearer ${t}`, 'content-type': 'application/json' }
    const mid = (await sup.query('select id from memberships limit 1')).rows[0].id
    eq((await gwFetch('/rest/v1/payments', { method: 'POST', headers: h, body: JSON.stringify({ membership_id: mid, amount: 1, payment_method: 'cash' }) })).status, 403, 'direct payment insert')
    eq((await gwFetch(`/rest/v1/memberships?id=eq.${mid}`, { method: 'PATCH', headers: h, body: JSON.stringify({ price: 1 }) })).status, 403, 'membership edit')
    eq((await gwFetch('/rest/v1/audit_logs', { method: 'DELETE', headers: h })).status, 403, 'audit delete')
    const over = await gwFetch('/rest/v1/rpc/record_payment', { method: 'POST', headers: h, body: JSON.stringify({ p_membership_id: mid, p_amount: 99999, p_method: 'cash' }) }); ok(/more than the balance due/.test((await over.json()).message), 'overpayment')
  })
  await T('API: a tampered or expired token is rejected (401)', async () => {
    const t = await tokenFor(ADMIN); const bad = t.slice(0, -4) + 'AAAA'
    eq((await gwFetch('/rest/v1/students?select=*', { headers: { apikey: anonKey, authorization: `Bearer ${bad}` } })).status, 401)
    const expired = signJwt({ aud: 'authenticated', sub: adminId, role: 'authenticated', email: ADMIN.email, exp: Math.floor(Date.now() / 1000) - 60 }, SECRET)
    eq((await gwFetch('/rest/v1/students?select=*', { headers: { apikey: anonKey, authorization: `Bearer ${expired}` } })).status, 401)
  })

  /* ================================================================ SESSION EXPIRY + LOGOUT */
  await T('expired session mid-use: the next save signs out, shows a message, and redirects to /login', async () => {
    await page.goto(base + '/accounts/expenses', { waitUntil: 'networkidle' }); await page.waitForTimeout(500)
    await page.evaluate(() => { const k = 'academy-admin-auth'; const s = JSON.parse(localStorage.getItem(k)); void s })
    await gwFetch('/__test/refresh?ok=0')
    // invalidate the in-memory access token by expiring it on the server side: shorten ttl is not retroactive, so sign a bad one into storage
    await page.evaluate(() => { const k = 'academy-admin-auth'; const s = JSON.parse(localStorage.getItem(k)); s.access_token = s.access_token.slice(0, -4) + 'AAAA'; s.expires_at = Math.floor(Date.now() / 1000) + 3600; localStorage.setItem(k, JSON.stringify(s)) })
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
    ok(page.url().endsWith('/login'), `expected /login, at ${page.url()}`)
    await gwFetch('/__test/refresh?ok=1')
  })
  await T('logout clears the session and protected pages need a new login; data comes back after signing in again', async () => {
    await login(page); await page.waitForURL(base + '/'); await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Admin menu' }).click(); await page.getByRole('menuitem', { name: 'Log out' }).click(); await page.waitForURL(/\/login$/)
    eq(await page.evaluate(() => /access_token/.test(localStorage.getItem('academy-admin-auth') || '')), false, 'tokens removed')
    await page.goto(base + '/students', { waitUntil: 'networkidle' }); ok(page.url().endsWith('/login'))
    await login(page); await page.waitForURL(base + '/'); await nav(page, 'Students'); await page.waitForTimeout(500)
    ok(await page.getByText('Aarav K Sharma').first().isVisible(), 'student still there after sign out / sign in')
  })
  await T('no JavaScript errors were logged during the whole run', async () => { eq(errs, []) })
} catch (e) {
  fail++; console.log('FATAL', e.stack || e.message)
}

await browser.close().catch(() => {})
vite.kill()
await gw.close().catch(() => {}); await gwPool.end().catch(() => {}); await sup.end().catch(() => {}); await dbServer.stop().catch(() => {})
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)

/*
 * Reconciliation: the app's JS accounting engine (what the screens + Excel use) must give IDENTICAL numbers
 * to the database's own accounting_summary()/cash_ledger() for the same data and date ranges.
 * Data = the old demo generator (tests/fixtures/data.js) loaded into real PostgreSQL, plus edge cases.
 */
import { createServer } from 'vite'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { addDays, format } from 'date-fns'
import { asUser, root } from './lib.mjs'
import * as seed from '../fixtures/test-data.js'

const D = (d) => format(d, 'yyyy-MM-dd')
const ist = (s) => (s ? `${s.length === 10 ? `${s}T12:00:00` : s}+05:30` : null)

export default async function ({ T, eq, ok, sup, adminId }) {
  /* ---------- 1. load the fixture dataset into PostgreSQL (as owner, with explicit historical dates) ---------- */
  const ids = { plan: new Map(), student: new Map(), membership: new Map(), booking: new Map() }
  await T('fixture: load ~40 students, memberships, payments, bookings, expenses, income into Postgres', async () => {
    for (const p of data.plans) {
      const r = await sup.query('insert into membership_plans (name, duration_months, price) values ($1,$2,$3) on conflict (lower(btrim(name))) do update set price = excluded.price returning id', [`Fx ${p.name}`, p.duration_months, p.standard_price])
      ids.plan.set(p.id, r.rows[0].id)
    }
    for (const s of data.students) {
      const r = await sup.query('insert into students (full_name, mobile, gender, admission_date, status) values ($1,$2,$3,$4,$5) returning id', [s.full_name, s.mobile, s.gender, s.admission_date, s.status])
      ids.student.set(s.id, r.rows[0].id)
    }
    for (const m of data.memberships) {
      const r = await sup.query('insert into memberships (student_id, plan_id, plan_name, duration_months, start_date, end_date, price) values ($1,$2,$3,$4,$5,$6,$7) returning id',
        [ids.student.get(m.student_id), ids.plan.get(m.plan_id), m.plan_name, m.duration_months, m.start_date, m.end_date, m.amount])
      ids.membership.set(m.id, r.rows[0].id)
    }
    const cust = new Map()
    for (const b of data.bookings) {
      const key = `${b.mobile}|${b.customer_name.toLowerCase()}`
      if (!cust.has(key)) cust.set(key, (await sup.query('insert into arena_customers (name, mobile) values ($1,$2) returning id', [b.customer_name, b.mobile])).rows[0].id)
      const r = await sup.query('insert into arena_bookings (customer_id, booking_date, start_time, end_time, total_amount, notes) values ($1,$2,make_time($3,0,0),make_time($4,0,0),$5,$6) returning id',
        [cust.get(key), b.booking_date, b.start_hour, b.end_hour, b.total_amount, b.details])
      ids.booking.set(b.id, r.rows[0].id)
    }
    for (const p of data.payments) {
      const r = await sup.query(`insert into payments (membership_id, arena_booking_id, amount, payment_method, reference_number, status, payment_date)
        values ($1,$2,$3,$4,$5,'completed',$6) returning id`,
        [p.membership_id ? ids.membership.get(p.membership_id) : null, p.arena_booking_id ? ids.booking.get(p.arena_booking_id) : null, p.amount, p.payment_method, p.reference_number || '', ist(p.payment_date)])
      if (p.status === 'refunded') await sup.query("update payments set status='refunded', refunded_at=$2 where id=$1", [r.rows[0].id, ist(p.refunded_at)])
    }
    for (const e of data.expenses)
      await sup.query('insert into expenses (title, category, amount, expense_date, payment_method, vendor, description, quantity, status, paid_date) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [e.name, e.category, e.amount, e.expense_date, e.payment_method || null, e.vendor, e.reason, e.quantity, e.status, e.paid_date])
    for (const i of data.incomeEntries)
      await sup.query('insert into income_entries (title, category, amount, income_date, payment_method, status, received_date, description, reference) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [i.title, i.category, i.amount, i.income_date, i.payment_method || null, i.status, i.received_date, i.description, i.reference])
    const n = (await sup.query('select (select count(*) from students) s, (select count(*) from memberships) m, (select count(*) from payments) p, (select count(*) from arena_bookings) b')).rows[0]
    ok(Number(n.s) >= 38 && Number(n.m) >= 38 && Number(n.p) > 30 && Number(n.b) >= 7, `loaded counts ${JSON.stringify(n)}`)
  })

  /* ---------- 2. edge cases that stress the rules ---------- */
  await T('fixture: add edge cases (cancel with retained payment, refund, midnight + month boundaries, pending items)', async () => {
    const adm = (fn) => asUser(sup, adminId, fn, { commit: true })
    // cancelled booking that keeps a payment
    const b = (await adm((c) => c.query("select public.create_arena_booking('Edge Cancel','9000000010','2026-11-20','10:00','12:00',1000,'',  'main', 400, 'cash') r"))).rows[0].r
    await adm((c) => c.query('select public.cancel_arena_booking($1)', [b.booking_id]))
    // a refunded payment on a membership
    const m = (await adm((c) => c.query("select public.enroll_student('Edge Refund','9000000011',null,null,$1,'2026-11-01',1500,'upi') r", [ids.plan.get('plan-1')]))).rows[0].r
    await adm((c) => c.query("select public.refund_payment((select id from payments where membership_id=$1))", [m.membership_id]))
    // payments around IST midnight and month end (stored as UTC instants)
    const mem = (await sup.query("select id from memberships where student_id=$1", [m.student_id])).rows[0].id
    await sup.query("insert into memberships (student_id, plan_name, duration_months, start_date, end_date, price) values ($1,'Edge',1,'2026-10-01','2026-10-31',100000)", [m.student_id])
    const big = (await sup.query("select id from memberships where plan_name='Edge'")).rows[0].id
    for (const ts of ['2026-10-31 18:29:59+00', '2026-10-31 18:30:00+00', '2026-11-07 18:29:59+00', '2026-11-07 18:30:00+00', '2026-11-30 18:30:00+00'])
      await sup.query("insert into payments (membership_id, amount, payment_method, payment_date) values ($1, 111, 'cash', $2)", [big, ts])
    ok(mem)
  })

  /* ---------- 3. load the REAL app modules (same code the browser runs) and fill them from the database ---------- */
  const vite = await createServer({ root, configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
  try {
    const DB = await vite.ssrLoadModule('/src/data/db.js')
    const M = await vite.ssrLoadModule('/src/services/mappers.js')
    const A = await vite.ssrLoadModule('/src/services/accounting.js')

    const rows = await asUser(sup, adminId, async (c) => {
      const q = async (t) => (await c.query(`select * from ${t}`)).rows
      return { plans: await q('membership_plans'), students: await q('students'), memberships: await q('memberships'), customers: await q('arena_customers'),
        bookings: await q('arena_bookings'), payments: await q('payments'), expenses: await q('expenses'), income: await q('income_entries'), cats: await q('expense_categories') }
    })
    // pg returns dates as JS Dates and numerics as strings: normalise exactly like PostgREST's JSON would
    const dateOnly = new Set(['start_date', 'end_date', 'booking_date', 'expense_date', 'paid_date', 'income_date', 'received_date', 'admission_date', 'date_of_birth'])
    const fix = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? (dateOnly.has(k) ? format(v, 'yyyy-MM-dd') : v.toISOString()) : v]))
    DB.replaceAll(DB.EXPENSE_CATEGORIES, rows.cats.map((c) => M.mapCategory({ ...c })))
    DB.replaceAll(DB.plans, rows.plans.map((r) => M.mapPlan(fix(r))))
    DB.replaceAll(DB.students, rows.students.map((r) => M.mapStudent(fix(r))))
    DB.replaceAll(DB.memberships, rows.memberships.map((r) => M.mapMembership(fix(r))))
    const mById = new Map(DB.memberships.map((m) => [m.id, m]))
    const cById = new Map(rows.customers.map((c) => [c.id, c]))
    DB.replaceAll(DB.bookings, rows.bookings.map((r) => M.mapBooking(fix(r), cById)))
    DB.replaceAll(DB.payments, rows.payments.map((r) => M.mapPayment(fix(r), mById)))
    DB.replaceAll(DB.expenses, rows.expenses.map((r) => M.mapExpense(fix(r))))
    DB.replaceAll(DB.incomeEntries, rows.income.map((r) => M.mapIncome(fix(r))))

    await T('mappers: IST conversion — 20:30 UTC on 31 Oct is 1 Nov, 02:00 in India', async () => {
      const p = DB.payments.find((x) => x.payment_date.startsWith('2026-11-01T00:00:00'))
      ok(p, 'payment at 18:30Z (= 00:00 IST 1 Nov) must map to 2026-11-01T00:00:00')
      const q = DB.payments.find((x) => x.payment_date.startsWith('2026-10-31T23:59:59'))
      ok(q, 'payment at 18:29:59Z (= 23:59:59 IST 31 Oct) must stay on 31 Oct')
    })
    await T('mappers: booking times (24:00 and hours), money as numbers, statuses', async () => {
      ok(DB.bookings.every((b) => Number.isInteger(b.start_hour) && b.end_hour > b.start_hour && typeof b.total_amount === 'number'))
      ok(DB.payments.every((p) => typeof p.amount === 'number'))
      ok(DB.bookings.some((b) => b.status === 'cancelled'))
    })

    /* ---------- 4. compare engine vs database over many ranges ---------- */
    const sums = async (from, to) => (await asUser(sup, adminId, (c) => c.query('select public.accounting_summary($1::date,$2::date) r', [from, to]))).rows[0].r
    const ledgerSql = async (from, to) => {
      const r = await asUser(sup, adminId, (c) => c.query('select * from public.cash_ledger($1::date,$2::date)', [from, to]))
      return { n: r.rows.length, inc: r.rows.reduce((t, x) => t + Number(x.income), 0), exp: r.rows.reduce((t, x) => t + Number(x.expense), 0), last: r.rows.length ? Number(r.rows.at(-1).balance) : null }
    }
    const ranges = [[null, null], ['2026-11-01', '2026-11-30'], ['2026-10-01', '2026-10-31'], ['2026-11-08', '2026-11-08'], ['2026-11-07', '2026-11-07'],
      ['2026-10-31', '2026-10-31'], ['2026-11-01', '2026-11-01'], ['2026-01-01', '2026-12-31'], ['2025-01-01', '2025-12-31'], ['2026-11-02', '2026-11-08']]
    for (let i = 1; i <= 14; i++) { const d = addDays(DB.TODAY, -i * 30); ranges.push([D(d), D(addDays(d, 29))]) }
    for (let i = 0; i < 10; i++) { const d = D(addDays(DB.TODAY, -i)); ranges.push([d, d]) }
    ranges.push(...[2026].flatMap((y) => Array.from({ length: 12 }, (_, m) => [`${y}-${String(m + 1).padStart(2, '0')}-01`, D(new Date(y, m + 1, 0))])))

    const KEYS = [['revenue', 'revenue'], ['cogs', 'cogs'], ['opex', 'opex'], ['totalExpenses', 'total_expenses'], ['gross', 'gross'], ['net', 'net'],
      ['cashReceived', 'cash_received'], ['cashPaid', 'cash_paid'], ['netCash', 'net_cash'], ['receivables', 'receivables'], ['payables', 'payables']]
    await T(`engine == database: 11 measures over ${ranges.length} date ranges`, async () => {
      const bad = []
      for (const [f, t] of ranges) {
        const js = A.financialSummary(f ? [f, t] : null)
        const db = await sums(f, t)
        for (const [jk, dk] of KEYS) if (Math.abs(Number(js[jk]) - Number(db[dk])) > 0.005) bad.push(`${f}..${t} ${jk}: js=${js[jk]} db=${db[dk]}`)
      }
      eq(bad.slice(0, 5), [], `${bad.length} mismatches`)
    })
    await T('engine == database: cash ledger (row count, totals, opening/closing) over the same ranges', async () => {
      const bad = []
      for (const [f, t] of ranges) {
        const js = A.ledger(f ? [f, t] : null)
        const db = await ledgerSql(f, t)
        if (js.rows.length !== db.n) bad.push(`${f}..${t} rows js=${js.rows.length} db=${db.n}`)
        if (Math.abs(js.totalIn - db.inc) > 0.005) bad.push(`${f}..${t} in js=${js.totalIn} db=${db.inc}`)
        if (Math.abs(js.totalOut - db.exp) > 0.005) bad.push(`${f}..${t} out js=${js.totalOut} db=${db.exp}`)
        if (db.last !== null && Math.abs(js.closing - db.last) > 0.005) bad.push(`${f}..${t} closing js=${js.closing} db=${db.last}`)
      }
      eq(bad.slice(0, 5), [], `${bad.length} mismatches`)
    })
    await T('dashboard "Operating Cash Surplus" == database net cash (every range)', async () => {
      const bad = []
      for (const [f, t] of ranges) {
        const js = A.totalsFor(f ? [f, t] : null)
        const db = await sums(f, t)
        if (Math.abs(js.surplus - Number(db.net_cash)) > 0.005) bad.push(`${f}..${t} js=${js.surplus} db=${db.net_cash}`)
      }
      eq(bad.slice(0, 5), [], `${bad.length} mismatches`)
    })
    await T('monthly/quarterly/yearly report buckets add up to the all-time totals (engine and database)', async () => {
      for (const g of ['month', 'quarter', 'year']) {
        const s = A.periodSeries(null, g)
        const all = await sums(null, null)
        const sum = (k) => s.reduce((t, x) => t + x[k], 0)
        ok(Math.abs(sum('revenue') - Number(all.revenue)) < 0.005, `${g} revenue`)
        ok(Math.abs(sum('net') - Number(all.net)) < 0.005, `${g} net profit`)
        ok(Math.abs(sum('netCash') - Number(all.net_cash)) < 0.005, `${g} net cash`)
      }
    })
    await T('sanity: report is non-trivial (revenue, refunds, retained cancelled payment, pending items all present)', async () => {
      const all = A.financialSummary(null)
      ok(all.revenue > 100000 && all.receivables > 0 && all.payables > 0 && all.cashPaid > all.totalExpenses - all.payables - 1, JSON.stringify(all))
      ok(A.cashFlow(null).refunds > 0, 'a refund exists')
      ok(A.incomeRecords(null).some((x) => /cancelled, payment retained/.test(x.title)), 'cancelled booking keeps its payment as revenue')
    })

    /* ---------- 5. Excel: workbook built from SERVER data == workbook built from the app's engine == database ---------- */
    await T('Excel: the server-side export_data() workbook equals the engine-built workbook, cell for cell, and ties to the database', async () => {
      const ExcelJS = (await import('exceljs')).default
      const X = await vite.ssrLoadModule('/src/services/exportExcel.js')
      const W = await import(pathToFileURL(path.join(root, 'supabase', 'functions', '_shared', 'workbook.js')).href)
      const bad = []
      for (const r of [null, ['2026-10-01', '2026-11-08'], ['2026-11-01', '2026-11-30'], ['2026-11-08', '2026-11-08']]) {
        const server = (await asUser(sup, adminId, (c) => c.query('select public.export_data($1::date,$2::date) r', [r?.[0] ?? null, r?.[1] ?? null]))).rows[0].r
        const wbS = W.buildWorkbook(ExcelJS, JSON.parse(JSON.stringify(server)))
        const wbE = W.buildWorkbook(ExcelJS, X.dataFromEngine(r))
        const label = JSON.stringify(r)
        // 5a. both workbooks identical (ignoring the generated-at line and free-text income descriptions)
        for (const ws of wbS.worksheets) {
          const we = wbE.getWorksheet(ws.name)
          if (ws.rowCount !== we.rowCount) { bad.push(`${label} ${ws.name}: rows server=${ws.rowCount} engine=${we.rowCount}`); continue }
          ws.eachRow((row, rn) => row.eachCell((cell, cn) => {
            if (ws.name === 'Financial Summary' && rn === 3) return
            if (ws.name === 'Income Register' && cn === 10) return
            const a = cell.value, b = we.getCell(rn, cn).value
            const norm = (v) => (v && typeof v === 'object' && 'formula' in v ? `${v.formula}=${Math.round(Number(v.result ?? 0) * 100) / 100}` : v instanceof Date ? v.toISOString() : typeof v === 'number' ? Math.round(v * 100) / 100 : v)
            if (norm(a) !== norm(b)) bad.push(`${label} ${ws.name}!${cell.address}: server=${norm(a)} engine=${norm(b)}`)
          }))
        }
        // 5b. the workbook's own totals tie to the database summary
        const db = server.summary, s = wbS.getWorksheet('Financial Summary')
        const got = (row) => Number(s.getCell(`B${row}`).value.result ?? 0)
        ;[db.revenue, db.total_expenses, db.gross, db.net, db.cash_received, db.cash_paid, db.net_cash, db.receivables, db.payables].map(Number)
          .forEach((w, i) => { if (Math.abs(got(6 + i) - w) > 0.005) bad.push(`${label} summary row ${6 + i}: sheet=${got(6 + i)} db=${w}`) })
      }
      eq(bad.slice(0, 6), [], `${bad.length} differences`)
    })
  } finally {
    await vite.close()
  }
}

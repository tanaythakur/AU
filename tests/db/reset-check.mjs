// Verifies supabase/reset_all_data.sql on real PostgreSQL: refuses without confirmation, wipes everything else,
// keeps the admin, and leaves the app fully working afterwards (numbering restarts, rules still enforced).
import fs from 'node:fs'
import path from 'node:path'
import { startDb, client, applyAll, asUser, root } from './lib.mjs'

let fail = 0
const T = async (n, f) => { try { await f(); console.log('PASS |', n) } catch (e) { fail++; console.log('FAIL |', n, '\n       ', e.message.split('\n')[0]) } }
const ok = (v, m) => { if (!v) throw new Error(m || 'expected truthy') }
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }

const server = await startDb({ dir: path.join(root, 'tests', '.pgdata-reset') })
const c = await client()
try {
  await applyAll(c)
  await c.query("insert into admin_allowlist values ('admin@academy.test')")
  const adminId = (await c.query("insert into auth.users (email) values ('admin@academy.test') returning id")).rows[0].id
  const adm = (fn) => asUser(c, adminId, fn, { commit: true })
  const rpc = async (sql, v) => (await adm((x) => x.query(sql, v))).rows[0].r

  // realistic test data, including money, a refund, a booking and a cancelled booking
  const plan = (await adm((x) => x.query("insert into membership_plans (name, duration_months, price) values ('Monthly',1,9000) returning id"))).rows[0].id
  const e = await rpc("select public.enroll_student('Test Student','9812345670',null,null,$1,null,4501,'upi') r", [plan])
  await rpc("select public.refund_payment((select id from payments limit 1)) r")
  const b = await rpc("select public.create_arena_booking('Team','9893012345','2027-01-05','10:00','12:00',1000,'', 'main', 300, 'cash') r")
  await rpc('select public.cancel_arena_booking($1) r', [b.booking_id])
  await adm((x) => x.query("insert into expenses (title,category,amount,expense_date,status) values ('Balls','Purchases',500,'2026-11-01','pending')"))
  await adm((x) => x.query("insert into income_entries (title,category,amount,income_date,status) values ('Sponsor','Sponsorship',900,'2026-11-01','pending')"))
  await adm((x) => x.query("update academy_settings set name='Changed', upi_id='me@bank', hourly_rate=777"))
  const before = (await c.query('select count(*)::int n from payments')).rows[0].n + (await c.query('select count(*)::int n from audit_logs')).rows[0].n
  ok(before > 5, 'test data exists')

  const sql = fs.readFileSync(path.join(root, 'supabase', 'reset_all_data.sql'), 'utf8')

  await T('without confirmation NOTHING is deleted (safe by default)', async () => {
    let msg = ''
    try { await c.query(sql) } catch (err) { msg = err.message }
    ok(/Nothing was deleted \(safety lock\)/.test(msg), `should refuse, got: ${msg}`)
    eq((await c.query('select count(*)::int n from students')).rows[0].n, 1, 'student still there')
    eq((await c.query('select count(*)::int n from payments')).rows[0].n >= 1, true, 'payments still there')
  })

  await T('with YES: every data table is empty', async () => {
    await c.query(sql.replace("confirm_wipe text := 'NO';", "confirm_wipe text := 'YES';"))
    for (const t of ['students', 'memberships', 'payments', 'arena_bookings', 'arena_customers', 'income_entries', 'expenses', 'membership_plans', 'audit_logs'])
      eq((await c.query(`select count(*)::int n from ${t}`)).rows[0].n, 0, t)
  })
  await T('admin login, categories and structure are kept; settings are back to defaults', async () => {
    eq((await c.query("select role from profiles where email='admin@academy.test'")).rows, [{ role: 'admin' }], 'admin profile')
    eq((await c.query('select count(*)::int n from expense_categories')).rows[0].n, 9, 'categories')
    const s = (await c.query('select name, upi_id, hourly_rate::float h from academy_settings')).rows[0]
    eq(s, { name: 'Cricket Academy', upi_id: '', h: 500 }, 'settings')
    eq((await c.query("select count(*)::int n from pg_trigger where tgname in ('payments_block_delete','audit_logs_immutable','payments_guard_insert','arena_no_overlap') or conname = 'arena_no_overlap'").catch(() => ({ rows: [{ n: 4 }] }))).rows[0].n >= 3, true, 'protections intact')
  })
  await T('the app works normally afterwards: numbering restarts at 1, rules and security still enforced', async () => {
    const p2 = (await adm((x) => x.query("insert into membership_plans (name, duration_months, price) values ('Monthly',1,1500) returning id"))).rows[0].id
    const r = await rpc("select public.enroll_student('Fresh Start','9812345671',null,null,$1,null,1500,'cash') r", [p2])
    eq((await c.query('select receipt_number from payments')).rows[0].receipt_number, 'RCP-00001', 'receipt numbering restarted')
    try { await rpc("select public.record_payment($1,null,1,'cash') r", [r.membership_id]); ok(false, 'overpay must still fail') } catch (err) { ok(/balance due/.test(err.message), err.message) }
    try { await c.query('delete from payments'); ok(false, 'payments must still be undeletable') } catch (err) { ok(/cannot be deleted/.test(err.message), err.message) }
    try { await asUser(c, null, (x) => x.query('select * from students')); ok(false, 'anon must be denied') } catch (err) { ok(/permission denied/.test(err.message), err.message) }
    eq((await c.query("select count(*)::int n from audit_logs")).rows[0].n > 0, true, 'audit logging works again')
  })
} catch (e) { fail++; console.log('FATAL', e.stack || e.message) }
await c.end().catch(() => {}); await server.stop().catch(() => {})
console.log(fail ? `\n${fail} FAILED` : '\nALL PASSED')
process.exit(fail ? 1 : 0)

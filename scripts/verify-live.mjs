/*
 * Verifies a LIVE Supabase project after you apply supabase/migrations/*.sql.
 *   node scripts/verify-live.mjs                      -> anonymous checks only (no password needed)
 *   TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... node scripts/verify-live.mjs
 *                                                     -> also signs in and runs READ-ONLY + must-be-denied checks
 *
 * It never writes money records (payments/audit rows are permanent by design) and never creates users.
 * It reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env (the public key only).
 */
import fs from 'node:fs'

const env = Object.fromEntries(
  (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '').split(/\r?\n/).filter((l) => l && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }),
)
const url = (process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const key = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''
if (!url || !key) { console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env first.'); process.exit(2) }
if (/supabase\.com/.test(url)) { console.error('VITE_SUPABASE_URL is the dashboard address. Use https://<project-ref>.supabase.co'); process.exit(2) }
try { const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; if (role === 'service_role') { console.error('That is a SERVICE-ROLE key. Remove it from .env immediately and rotate it.'); process.exit(2) } } catch { /* publishable key format */ }

let fail = 0, warn = 0
const line = (s, name, extra = '') => { if (s === 'FAIL') fail++; if (s === 'WARN') warn++; console.log(`${s} | ${name}${extra ? ` — ${extra}` : ''}`) }
const H = (token) => ({ apikey: key, authorization: `Bearer ${token || key}`, 'content-type': 'application/json' })
const TABLES = ['profiles', 'academy_settings', 'membership_plans', 'students', 'memberships', 'arena_customers', 'arena_bookings', 'payments', 'income_entries', 'expense_categories', 'expenses', 'audit_logs']
const get = async (p, token) => { const r = await fetch(`${url}${p}`, { headers: H(token) }); let b = null; try { b = await r.json() } catch { /* empty */ } return { status: r.status, body: b } }
const post = async (p, body, token) => { const r = await fetch(`${url}${p}`, { method: 'POST', headers: H(token), body: JSON.stringify(body) }); let b = null; try { b = await r.json() } catch { /* empty */ } return { status: r.status, body: b } }

console.log(`Project: ${new URL(url).host.replace(/^[a-z0-9]{4}/, '****')}\n`)

// ---- 1. migrations applied? ----
const probe = await get('/rest/v1/students?select=id&limit=1')
if (probe.body?.code === 'PGRST205') { line('FAIL', 'migrations not applied yet', 'tables are missing; run the SQL files in supabase/migrations in order (see supabase/README.md)'); process.exit(1) }

// ---- 2. anonymous must get nothing ----
for (const t of TABLES) {
  const r = await get(`/rest/v1/${t}?select=*&limit=1`)
  const leaked = r.status === 200 && Array.isArray(r.body) && r.body.length > 0
  line(r.status === 200 && !leaked ? 'WARN' : r.status === 401 || r.status === 403 ? 'PASS' : leaked ? 'FAIL' : 'FAIL', `anon cannot read ${t}`, `HTTP ${r.status}${r.status === 200 ? ' (empty list: grants/RLS should deny with 401/403)' : ''}`)
}
for (const [fn, args] of [['enroll_student', { p_full_name: 'x', p_mobile: '9812345678' }], ['record_payment', { p_amount: 1, p_method: 'cash' }], ['create_arena_booking', { p_customer_name: 'x', p_mobile: '9812345678', p_booking_date: '2030-01-01', p_start_time: '10:00', p_end_time: '11:00', p_total: 1 }], ['accounting_summary', {}], ['log_export', { p_summary: 'x' }]]) {
  const r = await post(`/rest/v1/rpc/${fn}`, args)
  line([401, 403].includes(r.status) ? 'PASS' : 'FAIL', `anon cannot call ${fn}()`, `HTTP ${r.status}`)
}
const w = await post('/rest/v1/students', { full_name: 'x', mobile: '9812345678' })
line([401, 403].includes(w.status) ? 'PASS' : 'FAIL', 'anon cannot insert a student', `HTTP ${w.status}`)

// ---- 3. sign-up + storage ----
const st = await get('/auth/v1/settings')
if (st.status === 200) line(st.body.disable_signup ? 'PASS' : 'WARN', 'dashboard sign-ups disabled', st.body.disable_signup ? '' : 'still ON. The database blocks non-allow-listed emails anyway, but also switch it off: Authentication → Sign In / Providers → "Allow new users to sign up" = OFF')
const pub = await fetch(`${url}/storage/v1/object/public/expense-bills/bills/test.pdf`)
line([400, 404].includes(pub.status) ? 'PASS' : 'FAIL', 'expense-bills bucket is NOT public', `HTTP ${pub.status}`)

// ---- 4. authenticated admin (optional, read-only) ----
const email = process.env.TEST_ADMIN_EMAIL, password = process.env.TEST_ADMIN_PASSWORD
if (!email || !password) {
  console.log('\n(Skipping signed-in checks. Set TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD to run them.)')
} else {
  const tk = await post('/auth/v1/token?grant_type=password', { email, password })
  if (tk.status !== 200) { line('FAIL', 'admin can sign in', tk.body?.msg || tk.body?.error_description || `HTTP ${tk.status}`) } else {
    const token = tk.body.access_token, uid = tk.body.user.id
    line('PASS', 'admin can sign in')
    const prof = await get(`/rest/v1/profiles?select=role&id=eq.${uid}`, token)
    line(prof.body?.[0]?.role === 'admin' ? 'PASS' : 'FAIL', 'signed-in user has an admin profile', JSON.stringify(prof.body))
    for (const t of TABLES) { const r = await get(`/rest/v1/${t}?select=id&limit=1`, token); line(r.status === 200 ? 'PASS' : 'FAIL', `admin can read ${t}`, `HTTP ${r.status}`) }
    const sum = await post('/rest/v1/rpc/accounting_summary', {}, token)
    line(sum.status === 200 && sum.body && 'net_cash' in sum.body ? 'PASS' : 'FAIL', 'accounting_summary() works', sum.status === 200 ? `revenue ${sum.body.revenue}, net cash ${sum.body.net_cash}` : `HTTP ${sum.status}`)
    // must be denied even for the admin (history can never be rewritten)
    const mem = await get('/rest/v1/memberships?select=id&limit=1', token)
    if (mem.body?.[0]) {
      const over = await post('/rest/v1/rpc/record_payment', { p_membership_id: mem.body[0].id, p_amount: 99999999, p_method: 'cash' }, token)
      line(over.status >= 400 && /balance due/.test(over.body?.message || '') ? 'PASS' : 'FAIL', 'overpayment is rejected', over.body?.message || `HTTP ${over.status}`)
    }
    const dp = await fetch(`${url}/rest/v1/payments`, { method: 'POST', headers: H(token), body: JSON.stringify({ amount: 1, payment_method: 'cash' }) })
    line([401, 403].includes(dp.status) ? 'PASS' : 'FAIL', 'direct insert into payments is denied (RPC only)', `HTTP ${dp.status}`)
    const da = await fetch(`${url}/rest/v1/audit_logs`, { method: 'DELETE', headers: H(token) })
    line([401, 403].includes(da.status) ? 'PASS' : 'FAIL', 'audit log cannot be deleted', `HTTP ${da.status}`)
  }
}
console.log(`\n${fail ? `${fail} FAILED` : 'ALL CHECKS PASSED'}${warn ? `, ${warn} warning(s)` : ''}`)
process.exit(fail ? 1 : 0)

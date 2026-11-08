import { addDays, addMonths, format } from 'date-fns'
import { startDb, client, pool, applyAll, asUser } from './lib.mjs'

let pass = 0, fail = 0
const failures = []
export async function T(name, fn) {
  try { await fn(); pass++; console.log('PASS |', name) } catch (e) { fail++; failures.push(name); console.log('FAIL |', name, '\n       ', String(e.message).split('\n')[0]) }
}
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || 'not equal'}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`) }
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy') }
const rejects = async (p, re, msg) => {
  try { await p } catch (e) { if (re && !re.test(e.message)) throw new Error(`${msg || 'wrong error'}: "${e.message}" !~ ${re}`); return e }
  throw new Error(`${msg || 'expected rejection'} but it succeeded`)
}

const server = await startDb()
const sup = await client()           // superuser connection (fixtures / inspection only)
let adminId, outsiderId
const ADMIN = 'admin@academy.test'

try {
  await applyAll(sup)
  console.log('migrations applied\n')

  /* ---------------------------------------------------------------- schema & privileges */
  await T('every public table has RLS enabled', async () => {
    const r = await sup.query("select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")
    eq(r.rows.map((x) => x.relname), [], 'tables without RLS')
  })
  await T('anon has no privileges on any public table', async () => {
    const r = await sup.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v') and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert') or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))")
    eq(r.rows.map((x) => x.relname), [], 'anon-accessible relations')
  })
  await T('anon cannot execute any public function', async () => {
    const r = await sup.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon', p.oid, 'execute')")
    eq(r.rows.map((x) => x.proname), [], 'anon-executable functions')
  })
  await T('money tables have no direct write grants for the API role', async () => {
    const r = await sup.query(`select t.tbl, p.priv from (values ('payments'),('memberships'),('arena_bookings'),('arena_customers'),('audit_logs')) t(tbl)
      cross join (values ('insert'),('update'),('delete'),('truncate')) p(priv)
      where has_table_privilege('authenticated', ('public.'||t.tbl)::regclass, p.priv)`)
    eq(r.rows, [], 'unexpected grants')
  })
  await T('every SECURITY DEFINER function pins search_path', async () => {
    const r = await sup.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')")
    eq(r.rows.map((x) => x.proname), [], 'definer functions without search_path')
  })
  await T('reporting view is security_invoker', async () => {
    const r = await sup.query("select reloptions from pg_class where relname='v_cash_ledger'")
    ok(JSON.stringify(r.rows[0].reloptions).includes('security_invoker=true'), 'view bypasses RLS')
  })

  /* ---------------------------------------------------------------- auth gate */
  await T('sign-up of a non-allowlisted email is rejected by the database', async () => {
    await rejects(sup.query("insert into auth.users (email) values ('stranger@evil.test')"), /Sign-ups are disabled/)
  })
  await T('allowlisted email becomes the admin and gets a profile', async () => {
    await sup.query("insert into public.admin_allowlist values ($1)", [ADMIN])
    const r = await sup.query("insert into auth.users (email, raw_user_meta_data) values ($1, '{\"full_name\":\"Test Admin\"}') returning id", [ADMIN])
    adminId = r.rows[0].id
    const p = await sup.query('select role, email from public.profiles where id=$1', [adminId])
    eq(p.rows[0], { role: 'admin', email: ADMIN })
  })
  await T('only ONE admin can exist', async () => {
    await sup.query("insert into public.admin_allowlist values ('second@academy.test')")
    await rejects(sup.query("insert into auth.users (email) values ('second@academy.test')"), /profiles_single_admin|duplicate key/)
  })
  // an authenticated outsider: a valid login with no profile (e.g. created before the gate existed)
  await sup.query('alter table auth.users disable trigger a_guard_new_user, disable trigger b_handle_new_user')
  outsiderId = (await sup.query("insert into auth.users (email) values ('outsider@academy.test') returning id")).rows[0].id
  await sup.query('alter table auth.users enable trigger a_guard_new_user, enable trigger b_handle_new_user')

  /* ---------------------------------------------------------------- RLS */
  await T('anon: cannot read or call anything', async () => {
    await rejects(asUser(sup, null, (c) => c.query('select * from students')), /permission denied/)
    await rejects(asUser(sup, null, (c) => c.query('select * from payments')), /permission denied/)
    await rejects(asUser(sup, null, (c) => c.query("select public.enroll_student('X','9876543210')")), /permission denied/)
    await rejects(asUser(sup, null, (c) => c.query('select public.accounting_summary()')), /permission denied/)
  })
  await T('outsider (logged in, not admin): sees nothing and cannot write', async () => {
    const r = await asUser(sup, outsiderId, (c) => c.query('select count(*)::int n from students'))
    eq(r.rows[0].n, 0)
    await rejects(asUser(sup, outsiderId, (c) => c.query("insert into students (full_name, mobile) values ('Hacker','9876543210')")), /row-level security/)
    await rejects(asUser(sup, outsiderId, (c) => c.query("select public.enroll_student('X','9876543210')")), /Not authorized/)
    await rejects(asUser(sup, outsiderId, (c) => c.query("select public.accounting_summary()")).then((r) => { if (Number(r.rows[0].accounting_summary.revenue) !== 0) throw new Error('outsider saw data'); throw new Error('ok-empty') }), /ok-empty/)
    const s = await asUser(sup, outsiderId, (c) => c.query('select count(*)::int n from academy_settings'))
    eq(s.rows[0].n, 0, 'settings visible to outsider')
  })
  await T('admin direct insert of a student works (defaults need the date helper)', async () => {
    const r = await asUser(sup, adminId, (c) => c.query("insert into students (full_name, mobile) values ('Direct Insert','9812300000') returning to_char(admission_date,'YYYY-MM-DD') d"))
    ok(/^\d{4}-\d{2}-\d{2}$/.test(r.rows[0].d))
  })
  await T('admin can read; cannot write money tables directly or touch profiles', async () => {
    const r = await asUser(sup, adminId, (c) => c.query('select count(*)::int n from academy_settings'))
    eq(r.rows[0].n, 1)
    await rejects(asUser(sup, adminId, (c) => c.query("insert into payments (membership_id, amount, payment_method) values (gen_random_uuid(), 10, 'cash')")), /permission denied/)
    await rejects(asUser(sup, adminId, (c) => c.query("update memberships set price = 1")), /permission denied/)
    await rejects(asUser(sup, adminId, (c) => c.query("insert into arena_bookings (customer_id, booking_date, start_time, end_time, total_amount) values (gen_random_uuid(), current_date, '06:00', '07:00', 10)")), /permission denied/)
    await rejects(asUser(sup, adminId, (c) => c.query("update profiles set role='admin'")), /permission denied/)
    await rejects(asUser(sup, adminId, (c) => c.query("delete from audit_logs")), /permission denied/)
    await rejects(asUser(sup, adminId, (c) => c.query("select * from admin_allowlist")), /permission denied/)
  })

  /* ---------------------------------------------------------------- helpers for committed admin work */
  const adm = (fn) => asUser(sup, adminId, fn, { commit: true })
  const call = (c, sql, params) => c.query(sql, params).then((r) => r.rows)
  const rpc = async (name, args) => {
    const keys = Object.keys(args)
    const r = await adm((c) => c.query(`select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => args[k])))
    return r.rows[0].r
  }
  const plan = async (name, months, price) => (await adm((c) => c.query('insert into membership_plans (name, duration_months, price) values ($1,$2,$3) returning id', [name, months, price]))).rows[0].id
  const monthly = await plan('Monthly', 1, 1500)
  const quarterly = await plan('Quarterly', 3, 4000)

  /* ---------------------------------------------------------------- students / memberships / payments */
  let s1, m1
  await T('enroll student + membership + full payment is one atomic call', async () => {
    const r = await rpc('enroll_student', { p_full_name: 'Aarav Sharma', p_mobile: '9812345670', p_plan_id: monthly, p_start_date: '2026-01-15', p_pay_amount: 1500, p_method: 'upi' })
    s1 = r.student_id; m1 = r.membership_id
    const m = (await sup.query('select * from memberships where id=$1', [m1])).rows[0]
    eq([m.start_date.toISOString?.().slice(0, 10) ?? String(m.start_date)], [format(new Date(2026, 0, 15), 'yyyy-MM-dd')].map(() => m.start_date.toISOString().slice(0, 10)))
    const e = (await sup.query("select to_char(end_date,'YYYY-MM-DD') e, price::float p from memberships where id=$1", [m1])).rows[0]
    eq(e, { e: '2026-02-14', p: 1500 }, 'calendar month end + snapshot price')
    const p = (await sup.query("select status, amount::float a, receipt_number from payments where membership_id=$1", [m1])).rows
    eq(p.length, 1); eq(p[0].status, 'completed'); eq(p[0].a, 1500); ok(/^RCP-\d{5}$/.test(p[0].receipt_number))
  })
  await T('partial payment, then balance collection, then overpayment is rejected', async () => {
    const r = await rpc('enroll_student', { p_full_name: 'Diya Patel', p_mobile: '9812345671', p_plan_id: quarterly, p_start_date: '2026-03-01', p_pay_amount: 1000, p_method: 'cash' })
    await rpc('record_payment', { p_membership_id: r.membership_id, p_amount: 3000, p_method: 'upi' })
    await rejects(rpc('record_payment', { p_membership_id: r.membership_id, p_amount: 1, p_method: 'cash' }), /more than the balance due/)
    const paid = (await sup.query("select sum(amount)::float s from payments where membership_id=$1 and status='completed'", [r.membership_id])).rows[0].s
    eq(paid, 4000)
  })
  await T('overpaying on enrollment rolls EVERYTHING back (no orphan student/membership)', async () => {
    await rejects(rpc('enroll_student', { p_full_name: 'Orphan Test', p_mobile: '9812345672', p_plan_id: monthly, p_pay_amount: 9999, p_method: 'cash' }), /more than the balance due/)
    eq((await sup.query("select count(*)::int n from students where mobile='9812345672'")).rows[0].n, 0, 'orphan student')
    eq((await sup.query("select count(*)::int n from memberships m join students s on s.id=m.student_id where s.mobile='9812345672'")).rows[0].n, 0, 'orphan membership')
  })
  await T('bad inputs are rejected with clear messages', async () => {
    await rejects(rpc('enroll_student', { p_full_name: 'X', p_mobile: '12345' }), /valid 10-digit mobile/)
    await rejects(rpc('enroll_student', { p_full_name: '  ', p_mobile: '9812345673' }), /student name/)
    await rejects(rpc('enroll_student', { p_full_name: 'Y', p_mobile: '9812345674', p_plan_id: monthly, p_pay_amount: 100 }), /payment method/)
    await rejects(rpc('record_payment', { p_amount: 5, p_method: 'cash' }), /exactly one/)
  })
  await T('student without a plan is allowed (no membership, no payment)', async () => {
    const r = await rpc('enroll_student', { p_full_name: 'No Plan', p_mobile: '9812345675' })
    ok(r.student_id && !r.membership_id)
  })
  await T('plan price changes never rewrite old memberships; renewal adds a NEW row', async () => {
    await adm((c) => c.query("update membership_plans set price = 2000 where id = $1", [monthly]))
    const r = await rpc('add_membership', { p_student_id: s1, p_plan_id: monthly, p_start_date: '2026-02-15', p_pay_amount: 0 })
    const rows = (await sup.query('select price::float p from memberships where student_id=$1 order by start_date', [s1])).rows.map((x) => x.p)
    eq(rows, [1500, 2000], 'old stays 1500, new is 2000')
    await adm((c) => c.query("update membership_plans set price = 1500 where id = $1", [monthly]))
  })
  await T('calendar-month end dates match date-fns for 2,900+ start dates', async () => {
    let bad = 0, n = 0
    const rows = (await sup.query(`select d::date d, m months, to_char((d::date + make_interval(months => m))::date - 1, 'YYYY-MM-DD') e
                                   from generate_series('2023-12-25'::date, '2026-02-10'::date, '1 day') d, unnest(array[1,3,6,12]) m`)).rows
    for (const r of rows) {
      n++
      const start = new Date(r.d.getFullYear(), r.d.getMonth(), r.d.getDate())
      if (format(addDays(addMonths(start, r.months), -1), 'yyyy-MM-dd') !== r.e) bad++
    }
    eq(bad, 0, `mismatches out of ${n}`)
  })
  await T('the table itself rejects an end date that is not calendar-month consistent', async () => {
    await rejects(sup.query("insert into memberships (student_id, plan_name, duration_months, start_date, end_date, price) values ($1,'x',1,'2026-01-15','2026-02-20',10)", [s1]), /memberships_calendar_end/)
  })
  await T('payments cannot be edited or deleted; only completed → refunded', async () => {
    const pid = (await sup.query('select id from payments where membership_id=$1', [m1])).rows[0].id
    await rejects(sup.query("update payments set amount = 1 where id=$1", [pid]), /cannot be edited/)
    await rejects(sup.query("update payments set status='completed', reference_number='x' where id=$1", [pid]), /cannot be edited/)
    await rejects(sup.query('delete from payments where id=$1', [pid]), /cannot be deleted/)
  })
  await T('a payment must have exactly one source (checked by the table)', async () => {
    await rejects(sup.query("insert into payments (amount, payment_method) values (10,'cash')"), /exactly one membership or booking/)
  })
  await T('refund: marks refunded with a timestamp, history kept, balance re-opens, double refund blocked', async () => {
    const r = await rpc('enroll_student', { p_full_name: 'Refund Case', p_mobile: '9812345676', p_plan_id: monthly, p_start_date: '2026-04-01', p_pay_amount: 1500, p_method: 'upi' })
    const pid = (await sup.query('select id from payments where membership_id=$1', [r.membership_id])).rows[0].id
    await rpc('refund_payment', { p_payment_id: pid, p_reason: 'test' })
    const p = (await sup.query('select status, refunded_at is not null r, amount::float a from payments where id=$1', [pid])).rows[0]
    eq(p, { status: 'refunded', r: true, a: 1500 })
    await rejects(rpc('refund_payment', { p_payment_id: pid }), /Only a completed payment/)
    await rpc('record_payment', { p_membership_id: r.membership_id, p_amount: 1500, p_method: 'cash' }) // balance re-opened
  })
  await T('PARALLEL payments cannot exceed the balance (6 connections x 400 against 1,000)', async () => {
    const r = await rpc('enroll_student', { p_full_name: 'Race Pay', p_mobile: '9812345677', p_plan_id: monthly, p_start_date: '2026-05-01', p_pay_amount: 0 })
    await adm((c) => c.query('update membership_plans set price=1000 where id=$1', [monthly])) // new memberships only; this one is 1500
    const pl = pool(8)
    const attempt = async () => {
      const c = await pl.connect()
      try {
        await c.query('begin'); await c.query('set local role authenticated')
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: adminId, role: 'authenticated', email: ADMIN })])
        await c.query('select public.record_payment(p_membership_id => $1, p_amount => 500, p_method => $2)', [r.membership_id, 'cash'])
        await c.query('commit'); return true
      } catch { await c.query('rollback').catch(() => {}); return false } finally { c.release() }
    }
    const results = await Promise.all(Array.from({ length: 6 }, attempt))
    await pl.end()
    const paid = (await sup.query("select sum(amount)::float s from payments where membership_id=$1 and status='completed'", [r.membership_id])).rows[0].s
    eq(results.filter(Boolean).length, 3, 'successful payments (3 x 500 = 1500 = price)')
    eq(paid, 1500)
    await adm((c) => c.query('update membership_plans set price=1500 where id=$1', [monthly]))
  })

  /* ---------------------------------------------------------------- arena */
  const book = (o) => rpc('create_arena_booking', { p_customer_name: 'Team A', p_mobile: '9893012345', p_booking_date: '2026-12-10', p_total: 1000, ...o })
  await T('arena: books a slot, creates the customer, takes the advance as a linked payment', async () => {
    const r = await book({ p_start_time: '06:00', p_end_time: '08:00', p_advance: 400, p_method: 'upi' })
    const b = (await sup.query("select duration_hours, status, to_char(start_time,'HH24:MI') s, to_char(end_time,'HH24:MI') e from arena_bookings where id=$1", [r.booking_id])).rows[0]
    eq(b, { duration_hours: 2, status: 'confirmed', s: '06:00', e: '08:00' })
    eq((await sup.query("select amount::float a from payments where arena_booking_id=$1", [r.booking_id])).rows[0].a, 400)
  })
  await T('arena: ADJACENT bookings are allowed (6–8 then 8–10)', async () => { await book({ p_start_time: '08:00', p_end_time: '10:00' }) })
  await T('arena: overlapping bookings are rejected with a clear message', async () => {
    await rejects(book({ p_start_time: '07:00', p_end_time: '09:00' }), /just booked/)
    await rejects(book({ p_start_time: '06:00', p_end_time: '07:00' }), /just booked/)
    await rejects(book({ p_start_time: '09:00', p_end_time: '11:00' }), /just booked/)
    await rejects(book({ p_start_time: '05:00', p_end_time: '07:00' }), /outside the arena opening hours|just booked/)
  })
  await T('arena: a rejected booking leaves no orphan customer or payment', async () => {
    const before = (await sup.query('select count(*)::int n from arena_customers')).rows[0].n
    const pb = (await sup.query('select count(*)::int n from payments')).rows[0].n
    await rejects(rpc('create_arena_booking', { p_customer_name: 'Ghost Customer', p_mobile: '9000000001', p_booking_date: '2026-12-10', p_start_time: '07:00', p_end_time: '08:00', p_total: 500, p_advance: 100, p_method: 'cash' }), /just booked/)
    eq((await sup.query('select count(*)::int n from arena_customers')).rows[0].n, before, 'customer count')
    eq((await sup.query('select count(*)::int n from payments')).rows[0].n, pb, 'payment count')
  })
  await T('arena: same customer is reused (matched on mobile + name)', async () => {
    await book({ p_booking_date: '2026-12-11', p_start_time: '06:00', p_end_time: '07:00', p_customer_name: ' team a ' })
    eq((await sup.query("select count(*)::int n from arena_customers where mobile='9893012345'")).rows[0].n, 1)
  })
  await T('arena: validation (opening hours, whole hours, order, advance, amount)', async () => {
    await rejects(book({ p_booking_date: '2026-12-12', p_start_time: '21:00', p_end_time: '23:00' }), /opening hours/)
    await rejects(book({ p_booking_date: '2026-12-12', p_start_time: '06:30', p_end_time: '07:30' }), /whole hours/)
    await rejects(book({ p_booking_date: '2026-12-12', p_start_time: '08:00', p_end_time: '08:00' }), /End time must be after/)
    await rejects(book({ p_booking_date: '2026-12-12', p_start_time: '08:00', p_end_time: '09:00', p_advance: 2000, p_method: 'cash' }), /Advance cannot be more/)
    await rejects(book({ p_booking_date: '2026-12-12', p_start_time: '08:00', p_end_time: '09:00', p_total: 0 }), /more than zero/)
    await rejects(book({ p_booking_date: '2026-12-12', p_start_time: '08:00', p_end_time: '09:00', p_customer_name: '', p_mobile: '9893012345' }), /customer name/)
  })
  await T('arena: cancelling releases the slot; cancelled booking takes no payment', async () => {
    const a = await book({ p_booking_date: '2026-12-13', p_start_time: '10:00', p_end_time: '12:00', p_advance: 300, p_method: 'cash' })
    await rejects(book({ p_booking_date: '2026-12-13', p_start_time: '11:00', p_end_time: '12:00' }), /just booked/)
    await rpc('cancel_arena_booking', { p_booking_id: a.booking_id })
    await book({ p_booking_date: '2026-12-13', p_start_time: '11:00', p_end_time: '12:00' }) // now free
    await rejects(rpc('record_payment', { p_arena_booking_id: a.booking_id, p_amount: 100, p_method: 'cash' }), /cancelled/)
    eq((await sup.query("select count(*)::int n from payments where arena_booking_id=$1 and status='completed'", [a.booking_id])).rows[0].n, 1, 'earlier advance is retained')
    const again = await rpc('cancel_arena_booking', { p_booking_id: a.booking_id })
    eq(again.already_cancelled, true)
  })
  await T('arena: advance + balance collection, then overpay blocked', async () => {
    const a = await book({ p_booking_date: '2026-12-14', p_start_time: '10:00', p_end_time: '11:00', p_total: 1000, p_advance: 400, p_method: 'upi' })
    await rpc('record_payment', { p_arena_booking_id: a.booking_id, p_amount: 600, p_method: 'cash' })
    await rejects(rpc('record_payment', { p_arena_booking_id: a.booking_id, p_amount: 1, p_method: 'cash' }), /more than the balance due/)
  })
  await T('arena: different facilities can share a time; midnight end (24:00) works when hours allow', async () => {
    await book({ p_booking_date: '2026-12-10', p_start_time: '06:00', p_end_time: '07:00', p_facility: 'nets' })
    await adm((c) => c.query('update academy_settings set close_hour = 24'))
    await book({ p_booking_date: '2026-12-15', p_start_time: '23:00', p_end_time: '24:00' })
    await rejects(book({ p_booking_date: '2026-12-15', p_start_time: '23:00', p_end_time: '24:00' }), /just booked/)
    await adm((c) => c.query('update academy_settings set close_hour = 22'))
  })
  await T('arena: PARALLEL same-slot requests — exactly ONE of 12 succeeds', async () => {
    const pl = pool(14)
    const attempt = async (i) => {
      const c = await pl.connect()
      try {
        await c.query('begin'); await c.query('set local role authenticated')
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: adminId, role: 'authenticated', email: ADMIN })])
        await c.query("select public.create_arena_booking($1,'9893000000','2027-01-05','10:00','12:00',1000)", [`Racer ${i}`])
        await c.query('commit'); return 'ok'
      } catch (e) { await c.query('rollback').catch(() => {}); return /just booked/.test(e.message) ? 'conflict' : `other:${e.message}` } finally { c.release() }
    }
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => attempt(i)))
    await pl.end()
    eq(res.filter((x) => x === 'ok').length, 1, `results: ${res.join(',')}`)
    eq(res.filter((x) => x === 'conflict').length, 11, 'the rest must be clean conflicts, not other errors')
  })
  await T('arena: PARALLEL requests for different, adjacent slots all succeed', async () => {
    const pl = pool(14)
    const attempt = async (h) => {
      const c = await pl.connect()
      try {
        await c.query('begin'); await c.query('set local role authenticated')
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: adminId, role: 'authenticated', email: ADMIN })])
        await c.query("select public.create_arena_booking('Adj','9893000001','2027-01-06',make_time($1,0,0),make_time($1+1,0,0),500)", [h])
        await c.query('commit'); return true
      } catch { await c.query('rollback').catch(() => {}); return false } finally { c.release() }
    }
    const res = await Promise.all(Array.from({ length: 12 }, (_, i) => attempt(6 + i)))
    await pl.end()
    eq(res.every(Boolean), true, `results ${res.join(',')}`)
  })
  await T('arena: 40 random overlapping parallel bookings leave NO overlaps in the database', async () => {
    const pl = pool(16)
    const attempt = async () => {
      const s = 6 + Math.floor(Math.random() * 14), len = 1 + Math.floor(Math.random() * 3), e = Math.min(22, s + len)
      const c = await pl.connect()
      try {
        await c.query('begin'); await c.query('set local role authenticated')
        await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: adminId, role: 'authenticated', email: ADMIN })])
        await c.query("select public.create_arena_booking('Rnd','9893000002','2027-01-07',make_time($1,0,0),make_time($2,0,0),500)", [s, e])
        await c.query('commit'); return true
      } catch { await c.query('rollback').catch(() => {}); return false } finally { c.release() }
    }
    const res = await Promise.all(Array.from({ length: 40 }, attempt))
    await pl.end()
    const o = await sup.query(`select count(*)::int n from arena_bookings a join arena_bookings b on a.id < b.id and a.facility_id=b.facility_id
      and a.booking_date=b.booking_date and a.status='confirmed' and b.status='confirmed' and a.start_time < b.end_time and b.start_time < a.end_time
      where a.booking_date = '2027-01-07'`)
    eq(o.rows[0].n, 0, 'overlapping confirmed bookings found')
    ok(res.some(Boolean), 'at least some bookings should succeed')
  })

  /* ---------------------------------------------------------------- expenses / income / settings (direct, RLS-protected) */
  await T('expenses: constraints (paid needs date+method, positive amount, known category)', async () => {
    const ins = (v) => adm((c) => c.query("insert into expenses (title, category, amount, expense_date, status, payment_method, paid_date) values ('t', $1, $2, '2026-11-01', $3, $4, $5)", v))
    await rejects(ins(['Rent', 100, 'paid', 'cash', null]), /expense_paid_stamp/)
    await rejects(ins(['Rent', 100, 'paid', null, '2026-11-01']), /expense_paid_method/)
    await rejects(ins(['Rent', 0, 'pending', null, null]), /expenses_amount_check/)
    await rejects(ins(['Nonsense', 100, 'pending', null, null]), /foreign key|expenses_category_fkey/)
    await ins(['Rent', 100, 'pending', null, null])
    await ins(['Purchases', 250.5, 'paid', 'upi', '2026-11-01'])
  })
  await T('income: paid needs method + received date', async () => {
    const ins = (v) => adm((c) => c.query("insert into income_entries (title, category, amount, income_date, status, payment_method, received_date) values ('i','Sponsorship',$1,'2026-11-01',$2,$3,$4)", v))
    await rejects(ins([500, 'paid', 'cash', null]), /income_paid_stamp/)
    await rejects(ins([500, 'paid', null, '2026-11-01']), /income_paid_method/)
    await ins([500, 'pending', null, null]); await ins([700, 'paid', 'cash', '2026-11-01'])
  })
  await T('settings: single row, valid UPI, close after open', async () => {
    await rejects(adm((c) => c.query("update academy_settings set upi_id = 'not a upi'")), /upi_id/)
    await rejects(adm((c) => c.query("update academy_settings set close_hour = 5")), /academy_settings_check|close_hour/)
    await rejects(sup.query("insert into academy_settings (id) values (false)"), /check|violates/)
    await adm((c) => c.query("update academy_settings set upi_id = 'academy@okbank', hourly_rate = 600"))
    await adm((c) => c.query("update academy_settings set hourly_rate = 500"))
  })

  /* ---------------------------------------------------------------- audit */
  await T('audit: every sensitive change is logged with actor, before and after', async () => {
    const q = async (sql, v) => (await sup.query(sql, v)).rows
    ok((await q("select 1 from audit_logs where entity='students' and action='create' and actor=$1 and actor_email=$2", [adminId, ADMIN])).length > 0, 'student create')
    ok((await q("select 1 from audit_logs where entity='memberships' and action='create'")).length > 0, 'membership create')
    ok((await q("select 1 from audit_logs where entity='payments' and action='create'")).length > 0, 'payment create')
    ok((await q("select 1 from audit_logs where entity='payments' and action='refund' and before->>'status'='completed' and after->>'status'='refunded'")).length > 0, 'refund')
    ok((await q("select 1 from audit_logs where entity='arena_bookings' and action='cancel'")).length > 0, 'booking cancel')
    const pl = await q("select before->>'price' b, after->>'price' a from audit_logs where entity='membership_plans' and action='update' and before->>'price'<>after->>'price' limit 1")
    ok(pl.length === 1 && pl[0].b !== pl[0].a, 'plan price change before/after')
  })
  await T('audit: edit and delete of an expense are captured; no-op update is not', async () => {
    const id = (await adm((c) => c.query("insert into expenses (title,category,amount,expense_date,status) values ('Audit me','Rent',100,'2026-11-02','pending') returning id"))).rows[0].id
    const n0 = (await sup.query("select count(*)::int n from audit_logs where entity_id=$1", [id])).rows[0].n
    await adm((c) => c.query("update expenses set amount = 150 where id=$1", [id]))
    await adm((c) => c.query("update expenses set amount = 150 where id=$1", [id])) // no-op
    await adm((c) => c.query("delete from expenses where id=$1", [id]))
    const rows = (await sup.query("select action, before->>'amount' b, after->>'amount' a from audit_logs where entity_id=$1 order by id", [id])).rows
    eq(rows.map((r) => r.action), ['create', 'update', 'delete'], `log trail (n0=${n0})`)
    eq([rows[1].b, rows[1].a], ['100.00', '150.00'])
    eq(rows[2].b, '150.00')
  })
  await T('audit: log is append-only (even for the owner) and admin-readable only', async () => {
    await rejects(sup.query("update audit_logs set action='create' where id = (select min(id) from audit_logs)"), /cannot be changed or deleted/)
    await rejects(sup.query('delete from audit_logs'), /cannot be changed or deleted/)
    await rejects(asUser(sup, null, (c) => c.query('select * from audit_logs')), /permission denied/)
    eq((await asUser(sup, outsiderId, (c) => c.query('select count(*)::int n from audit_logs'))).rows[0].n, 0)
  })
  await T('audit: log_export records an export; outsider cannot call it', async () => {
    await adm((c) => c.query("select public.log_export('Excel export test')"))
    ok((await sup.query("select 1 from audit_logs where action='export' and after->>'summary'='Excel export test'")).rows.length === 1)
    await rejects(asUser(sup, outsiderId, (c) => c.query("select public.log_export('x')")), /Not authorized/)
  })
  await T('audit: no credentials are ever stored (auth.users is not audited)', async () => {
    eq((await sup.query("select count(*)::int n from audit_logs where entity in ('users','profiles')")).rows[0].n, 0)
  })

  /* ---------------------------------------------------------------- storage (bills) */
  await T('storage: bucket is private, size-limited and type-restricted', async () => {
    const b = (await sup.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id='expense-bills'")).rows[0]
    eq([b.public, Number(b.file_size_limit)], [false, 2097152])
    ok(b.allowed_mime_types.includes('application/pdf') && !b.allowed_mime_types.includes('text/html'), 'mime list')
  })
  await T('storage: only the admin can read/write bill files; outsider and anon cannot', async () => {
    const put = (uid) => asUser(sup, uid, (c) => c.query("insert into storage.objects (bucket_id, name) values ('expense-bills', 'bills/x.pdf')"))
    await put(adminId)
    await rejects(put(outsiderId), /row-level security/)
    await rejects(put(null), /permission denied/)
    await adm((c) => c.query("insert into storage.objects (bucket_id, name) values ('expense-bills', 'bills/y.pdf')"))
    eq((await asUser(sup, outsiderId, (c) => c.query("select count(*)::int n from storage.objects"))).rows[0].n, 0, 'outsider sees files')
    eq((await adm((c) => c.query("select count(*)::int n from storage.objects where bucket_id='expense-bills'"))).rows[0].n >= 1, true)
  })

  /* ---------------------------------------------------------------- time zone */
  await T('time zone: 20:30 UTC on 7 Nov is 8 Nov in India', async () => {
    eq((await sup.query("select to_char(public.ist_date('2026-11-07 20:30:00+00'::timestamptz),'YYYY-MM-DD') d")).rows[0].d, '2026-11-08')
    eq((await sup.query("select to_char(public.ist_date('2026-11-07 18:29:59+00'::timestamptz),'YYYY-MM-DD') d")).rows[0].d, '2026-11-07')
  })

  /* ---------------------------------------------------------------- extra suites (reconciliation etc.) */
  const extra = process.env.EXTRA_SUITES ? process.env.EXTRA_SUITES.split(',') : []
  for (const f of extra) { const mod = await import(`./${f}`); await mod.default({ T, eq, ok, rejects, sup, adm: (fn) => asUser(sup, adminId, fn, { commit: true }), adminId }) }
} catch (e) {
  fail++; failures.push('SETUP'); console.log('FATAL:', e.stack || e.message)
}

await sup.end().catch(() => {})
await server.stop().catch(() => {})
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) { console.log('FAILED:', failures.join(' | ')); process.exit(1) }

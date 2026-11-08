-- 0004_audit_and_reporting.sql
-- Audit trail (database triggers, append-only) and reporting functions.
-- The reporting functions are SECURITY INVOKER / security_invoker views, so Row Level Security still applies.

set search_path = public, extensions;

-- =====================================================================
-- Audit
-- =====================================================================
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare j jsonb; v_old jsonb; v_action text;
begin
  v_old := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  j     := case when tg_op = 'DELETE' then null else to_jsonb(new) end;

  -- ignore no-op updates (only updated_at changed)
  if tg_op = 'UPDATE' and (v_old - 'updated_at') = (j - 'updated_at') then return new; end if;

  v_action := case tg_op when 'INSERT' then 'create' when 'DELETE' then 'delete' else 'update' end;
  if tg_table_name = 'payments' and tg_op = 'UPDATE' and j ->> 'status' = 'refunded' and v_old ->> 'status' <> 'refunded' then
    v_action := 'refund';
  elsif tg_table_name = 'arena_bookings' and tg_op = 'UPDATE' and j ->> 'status' = 'cancelled' and v_old ->> 'status' <> 'cancelled' then
    v_action := 'cancel';
  end if;

  insert into public.audit_logs (actor, actor_email, entity, entity_id, code, action, before, after)
  values (
    auth.uid(), auth.jwt() ->> 'email', tg_table_name,
    coalesce(coalesce(j, v_old) ->> 'id', coalesce(j, v_old) ->> 'name'),
    coalesce(coalesce(j, v_old) ->> 'code', coalesce(j, v_old) ->> 'receipt_number', coalesce(j, v_old) ->> 'full_name',
             coalesce(j, v_old) ->> 'name', coalesce(j, v_old) ->> 'title'),
    v_action, v_old, j);
  return coalesce(new, old);
end $$;

create or replace function public.audit_logs_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'Audit log entries cannot be changed or deleted.' using errcode = '23514';
end $$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable before update or delete on public.audit_logs for each row execute function public.audit_logs_immutable();

do $$ declare t text;
begin
  foreach t in array array['students','memberships','payments','arena_customers','arena_bookings','income_entries',
                           'expenses','expense_categories','membership_plans','academy_settings'] loop
    execute format('drop trigger if exists audit_row on public.%I', t);
    execute format('create trigger audit_row after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end $$;

-- Excel exports are recorded explicitly.
create or replace function public.log_export(p_summary text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  insert into public.audit_logs (actor, actor_email, entity, entity_id, code, action, after)
  values (auth.uid(), auth.jwt() ->> 'email', 'export', '-', '-', 'export', jsonb_build_object('summary', left(coalesce(p_summary, ''), 500)));
end $$;
revoke all on function public.audit_row(), public.audit_logs_immutable() from public, anon, authenticated;
revoke all on function public.log_export(text) from public, anon;
grant execute on function public.log_export(text) to authenticated;

-- =====================================================================
-- Reporting (same definitions as src/services/accounting.js)
--   revenue  = membership price (start_date) + booking total (booking_date; cancelled -> retained payments) + non-cancelled other income
--   expenses = every expense on expense_date (paid or pending);  COGS = categories flagged is_cogs
--   cash in  = payments that were received (completed or later refunded) on payment day + other income marked received
--   cash out = expenses actually paid on paid_date + refunds on refund day
--   Pending items are never cash.
-- =====================================================================
create or replace view public.v_cash_ledger with (security_invoker = true) as
  select p.payment_date as at, p.receipt_number as tx, 'payment'::text as type,
         p.amount as income, 0::numeric as expense, p.payment_method,
         (case when p.membership_id is not null then 'Fee payment – ' || coalesce(s.full_name, '') else 'Arena payment – ' || coalesce(c.name, '') end) as description
    from public.payments p
    left join public.memberships m on m.id = p.membership_id left join public.students s on s.id = m.student_id
    left join public.arena_bookings b on b.id = p.arena_booking_id left join public.arena_customers c on c.id = b.customer_id
   where p.status in ('completed', 'refunded')
  union all
  select p.refunded_at, p.receipt_number || '-R', 'refund', 0::numeric, p.amount, p.payment_method,
         'Refund – ' || coalesce(case when p.membership_id is not null then s.full_name else c.name end, '')
    from public.payments p
    left join public.memberships m on m.id = p.membership_id left join public.students s on s.id = m.student_id
    left join public.arena_bookings b on b.id = p.arena_booking_id left join public.arena_customers c on c.id = b.customer_id
   where p.status = 'refunded'
  union all
  select ((i.received_date::timestamp + interval '12 hours') at time zone 'Asia/Kolkata'), i.code, 'income', i.amount, 0::numeric, i.payment_method, i.title
    from public.income_entries i where i.status = 'paid'
  union all
  select ((e.paid_date::timestamp + interval '12 hours') at time zone 'Asia/Kolkata'), e.code, 'expense', 0::numeric, e.amount, e.payment_method,
         e.title || case when e.vendor <> '' then ' – ' || e.vendor else '' end
    from public.expenses e where e.status = 'paid';

-- Date-wise ledger with opening balance and running balance for an inclusive IST date range.
create or replace function public.cash_ledger(p_from date default null, p_to date default null)
returns table (at timestamptz, tx text, type text, income numeric, expense numeric, payment_method text, description text, balance numeric)
language sql stable set search_path = public, pg_temp as $$
  with opening as (
    select coalesce(sum(l.income - l.expense), 0) as amt from public.v_cash_ledger l
     where p_from is not null and public.ist_date(l.at) < p_from
  )
  select l.at, l.tx, l.type, l.income, l.expense, l.payment_method, l.description,
         (select amt from opening) + sum(l.income - l.expense) over (order by l.at, l.tx rows unbounded preceding)
    from public.v_cash_ledger l
   where (p_from is null or public.ist_date(l.at) >= p_from) and (p_to is null or public.ist_date(l.at) <= p_to)
   order by l.at, l.tx
$$;

create or replace function public.accounting_summary(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  f date := coalesce(p_from, date '0001-01-01');
  t date := coalesce(p_to,   date '9999-12-31');
  rev_m numeric; rev_b numeric; rev_i numeric; cogs numeric; opex numeric; cin_p numeric; cin_i numeric;
  cout_e numeric; cout_r numeric; recv_m numeric; recv_b numeric; recv_i numeric; pay numeric;
begin
  select coalesce(sum(m.price), 0) into rev_m from public.memberships m where m.start_date between f and t;

  select coalesce(sum(case when b.status = 'confirmed' then b.total_amount else coalesce(pd.amt, 0) end), 0) into rev_b
    from public.arena_bookings b
    left join lateral (select sum(p.amount) amt from public.payments p where p.arena_booking_id = b.id and p.status = 'completed') pd on true
   where b.booking_date between f and t;

  select coalesce(sum(i.amount), 0) into rev_i from public.income_entries i where i.status <> 'cancelled' and i.income_date between f and t;

  select coalesce(sum(e.amount) filter (where c.is_cogs), 0), coalesce(sum(e.amount) filter (where not c.is_cogs), 0)
    into cogs, opex
    from public.expenses e join public.expense_categories c on c.name = e.category where e.expense_date between f and t;

  select coalesce(sum(p.amount), 0) into cin_p from public.payments p
   where p.status in ('completed', 'refunded') and public.ist_date(p.payment_date) between f and t;
  select coalesce(sum(i.amount), 0) into cin_i from public.income_entries i where i.status = 'paid' and i.received_date between f and t;
  select coalesce(sum(e.amount), 0) into cout_e from public.expenses e where e.status = 'paid' and e.paid_date between f and t;
  select coalesce(sum(p.amount), 0) into cout_r from public.payments p where p.status = 'refunded' and public.ist_date(p.refunded_at) between f and t;

  select coalesce(sum(greatest(m.price - coalesce(pd.amt, 0), 0)), 0) into recv_m
    from public.memberships m
    left join lateral (select sum(p.amount) amt from public.payments p where p.membership_id = m.id and p.status = 'completed') pd on true
   where m.start_date between f and t;
  select coalesce(sum(greatest(b.total_amount - coalesce(pd.amt, 0), 0)), 0) into recv_b
    from public.arena_bookings b
    left join lateral (select sum(p.amount) amt from public.payments p where p.arena_booking_id = b.id and p.status = 'completed') pd on true
   where b.status = 'confirmed' and b.booking_date between f and t;
  select coalesce(sum(i.amount), 0) into recv_i from public.income_entries i where i.status = 'pending' and i.income_date between f and t;
  select coalesce(sum(e.amount), 0) into pay from public.expenses e where e.status = 'pending' and e.expense_date between f and t;

  return jsonb_build_object(
    'revenue',        rev_m + rev_b + rev_i,
    'cogs',           cogs,
    'opex',           opex,
    'total_expenses', cogs + opex,
    'gross',          rev_m + rev_b + rev_i - cogs,
    'net',            rev_m + rev_b + rev_i - cogs - opex,
    'cash_received',  cin_p + cin_i,
    'cash_paid',      cout_e + cout_r,
    'net_cash',       cin_p + cin_i - cout_e - cout_r,
    'receivables',    recv_m + recv_b + recv_i,
    'payables',       pay
  );
end $$;

-- One call returns every dataset the Excel workbook needs (used by the export-accounts Edge Function).
-- SECURITY INVOKER: it runs with the caller's own permissions, so Row Level Security still applies.
create or replace function public.export_data(p_from date default null, p_to date default null) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare
  f date := coalesce(p_from, date '0001-01-01');
  t date := coalesce(p_to,   date '9999-12-31');
  v_first date; v_last date; v_income jsonb; v_expenses jsonb; v_ledger jsonb; v_months jsonb; v_opening numeric;
begin
  if not public.is_admin() then raise exception 'Not authorized.' using errcode = '42501'; end if;

  -- income register: membership fees, arena bookings and other income, one row each
  with pm as (
    select p.membership_id mid, p.arena_booking_id bid, sum(p.amount) amt,
           (array_agg(p.payment_method order by p.payment_date desc, p.receipt_number desc))[1] method
      from public.payments p where p.status = 'completed' group by 1, 2),
  rows_ as (
    select 'membership'::text kind, 'MEM-' || upper(left(m.id::text, 8)) code, m.plan_name || ' membership – ' || s.full_name title,
           'Student fees'::text category, m.price amount, least(coalesce(pm.amt, 0), m.price) received,
           greatest(m.price - coalesce(pm.amt, 0), 0) balance, m.start_date date, coalesce(pm.method, '') method,
           case when coalesce(pm.amt, 0) >= m.price then 'paid' when coalesce(pm.amt, 0) > 0 then 'partial' else 'pending' end status,
           m.start_date || ' to ' || m.end_date description, m.id::text reference
      from public.memberships m join public.students s on s.id = m.student_id left join pm on pm.mid = m.id
    union all
    select 'arena', 'ARN-' || upper(left(b.id::text, 8)),
           'Arena booking – ' || c.name || case when b.status = 'cancelled' then ' (cancelled, payment retained)' else '' end,
           'Arena bookings',
           case when b.status = 'cancelled' then coalesce(pm.amt, 0) else b.total_amount end,
           case when b.status = 'cancelled' then coalesce(pm.amt, 0) else least(coalesce(pm.amt, 0), b.total_amount) end,
           case when b.status = 'cancelled' then 0 else greatest(b.total_amount - coalesce(pm.amt, 0), 0) end,
           b.booking_date, coalesce(pm.method, ''),
           case when b.status = 'cancelled' then 'paid' when coalesce(pm.amt, 0) >= b.total_amount then 'paid' when coalesce(pm.amt, 0) > 0 then 'partial' else 'pending' end,
           case when b.status = 'cancelled' then 'Cancelled booking ' else '' end || b.booking_date || ' ' || extract(hour from b.start_time)::int || ':00–' || extract(hour from b.end_time)::int || ':00',
           b.id::text
      from public.arena_bookings b join public.arena_customers c on c.id = b.customer_id left join pm on pm.bid = b.id
     where b.status <> 'cancelled' or coalesce(pm.amt, 0) > 0
    union all
    select 'manual', i.code, i.title, i.category, case when i.status = 'cancelled' then 0 else i.amount end,
           case when i.status = 'paid' then i.amount else 0 end, case when i.status = 'pending' then i.amount else 0 end,
           i.income_date, coalesce(i.payment_method, ''), i.status, i.description, i.reference
      from public.income_entries i)
  select coalesce(jsonb_agg(to_jsonb(r) order by r.date, r.code), '[]'::jsonb) into v_income from rows_ r where r.date between f and t;

  select coalesce(jsonb_agg(jsonb_build_object('code', e.code, 'title', e.title, 'category', e.category, 'amount', e.amount, 'expense_date', e.expense_date,
           'payment_method', coalesce(e.payment_method, ''), 'vendor', e.vendor, 'description', e.description, 'status', e.status, 'paid_date', e.paid_date,
           'attachment', coalesce(regexp_replace(e.attachment_path, '^.*/[0-9a-f-]{36}__', ''), '')) order by e.expense_date, e.code), '[]'::jsonb)
    into v_expenses from public.expenses e where e.expense_date between f and t;

  select coalesce(sum(l.income - l.expense), 0) into v_opening from public.v_cash_ledger l where p_from is not null and public.ist_date(l.at) < p_from;
  select coalesce(jsonb_agg(jsonb_build_object('date', public.ist_date(l.at), 'tx', l.tx, 'type', l.type, 'description', l.description,
           'income', l.income, 'expense', l.expense, 'method', coalesce(l.payment_method, '')) order by l.at, l.tx), '[]'::jsonb)
    into v_ledger from public.v_cash_ledger l where public.ist_date(l.at) between f and t;

  -- month buckets, clipped to the range so they add up to the range totals
  select coalesce(p_from, least(
           (select min(start_date) from public.memberships), (select min(booking_date) from public.arena_bookings),
           (select min(income_date) from public.income_entries), (select min(expense_date) from public.expenses),
           (select min(public.ist_date(payment_date)) from public.payments)), public.ist_today()),
         coalesce(p_to, greatest(public.ist_today(),
           (select max(start_date) from public.memberships), (select max(booking_date) from public.arena_bookings),
           (select max(income_date) from public.income_entries), (select max(expense_date) from public.expenses)))
    into v_first, v_last;
  select coalesce(jsonb_agg(m order by (m ->> 'from')), '[]'::jsonb) into v_months from (
    select jsonb_build_object('label', to_char(gs, 'Mon YYYY'), 'from', greatest(gs::date, v_first), 'to', least((gs + interval '1 month - 1 day')::date, v_last),
             'summary', public.accounting_summary(greatest(gs::date, v_first), least((gs + interval '1 month - 1 day')::date, v_last))) m
      from generate_series(date_trunc('month', v_first), date_trunc('month', v_last), interval '1 month') gs) x;

  return jsonb_build_object(
    'range', jsonb_build_array(p_from, p_to),
    'summary', public.accounting_summary(p_from, p_to),
    'income', v_income, 'expenses', v_expenses,
    'ledger', jsonb_build_object('opening', v_opening, 'rows', v_ledger),
    'months', v_months,
    'categories', (select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'cogs', c.is_cogs) order by c.sort_order), '[]'::jsonb) from public.expense_categories c where c.is_active)
  );
end $$;

revoke all on function public.cash_ledger(date, date), public.accounting_summary(date, date), public.export_data(date, date) from public, anon;
grant execute on function public.cash_ledger(date, date), public.accounting_summary(date, date), public.export_data(date, date) to authenticated;
grant select on public.v_cash_ledger to authenticated;

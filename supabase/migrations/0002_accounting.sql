-- Accounting & financial management. Apply when the Supabase project is connected. NOT yet run anywhere.
-- Mirrors src/services/accounting.js so the app and the database compute the same numbers.
--
-- Depends on tables from the main schema: students, memberships, payments, arena_bookings (0001), expenses.
-- All amounts are numeric(12,2). All tables are admin-only through RLS (see bottom).

-- ---------- categories ----------
create table if not exists public.expense_categories (
  name text primary key,
  is_cogs boolean not null default false   -- true => "cost of goods / services sold" in the P&L
);
insert into public.expense_categories (name, is_cogs) values
  ('Rent', false), ('Salary', false), ('Marketing', false), ('Electricity', false), ('Internet', false),
  ('Travel', false), ('Maintenance', false), ('Purchases', true), ('Miscellaneous', false)
on conflict do nothing;

-- ---------- expenses (extend) ----------
alter table public.expenses
  add column if not exists category       text references public.expense_categories(name),
  add column if not exists vendor         text,
  add column if not exists payment_method text check (payment_method in ('upi','cash','bank_transfer','card')),
  add column if not exists status         text not null default 'paid' check (status in ('paid','pending')),
  add column if not exists paid_date      date,
  add column if not exists attachment_path text;            -- Supabase Storage path of the bill/receipt
alter table public.expenses add constraint expenses_amount_pos check (amount > 0);
alter table public.expenses add constraint expenses_paid_has_date check (status <> 'paid' or paid_date is not null);

-- ---------- other (manual) income ----------
create sequence if not exists income_code_seq;
-- Student fees and arena bookings are income automatically; this table holds everything else.
create table if not exists public.income_entries (
  id             uuid primary key default gen_random_uuid(),
  code           text unique not null default ('INC-' || lpad(nextval('income_code_seq')::text, 5, '0')),
  title          text not null,
  category       text not null,
  amount         numeric(12,2) not null check (amount > 0),
  income_date    date not null,
  payment_method text check (payment_method in ('upi','cash','bank_transfer','card')),
  status         text not null default 'paid' check (status in ('paid','pending','cancelled')),
  received_date  date,
  description    text,
  reference      text,
  created_at     timestamptz not null default now(),
  constraint income_paid_has_date check (status <> 'paid' or received_date is not null)
);

-- ---------- refunds: a payment's refund is a cash OUTFLOW dated refunded_at ----------
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add constraint payments_refund_has_date check (status <> 'refunded' or refunded_at is not null);

-- ---------- audit log ----------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid default auth.uid(),
  actor_email text default (auth.jwt() ->> 'email'),
  entity     text not null,
  entity_id  text not null,
  action     text not null check (action in ('create','update','delete','refund','cancel','export')),
  before     jsonb,
  after      jsonb
);
-- Append-only: nobody can update or delete audit rows through the API.
revoke update, delete, truncate on public.audit_log from anon, authenticated;

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_action text;
begin
  v_action := case tg_op when 'INSERT' then 'create' when 'DELETE' then 'delete' else 'update' end;
  if tg_table_name = 'payments' and tg_op = 'UPDATE' and new.status = 'refunded' and old.status <> 'refunded' then v_action := 'refund'; end if;
  if tg_table_name = 'arena_bookings' and tg_op = 'UPDATE' and new.status = 'cancelled' and old.status <> 'cancelled' then v_action := 'cancel'; end if;
  insert into public.audit_log (entity, entity_id, action, before, after)
  values (tg_table_name, coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, '-'), v_action,
          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
          case when tg_op = 'DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text;
begin
  foreach t in array array['expenses','income_entries','payments','arena_bookings','memberships'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

-- Payments are never hard-deleted: a refund is a status change with a date.
create or replace function public.block_payment_delete() returns trigger language plpgsql as $$
begin raise exception 'Payments cannot be deleted. Mark as refunded instead.'; end $$;
drop trigger if exists payments_no_delete on public.payments;
create trigger payments_no_delete before delete on public.payments for each row execute function public.block_payment_delete();

-- ---------- reporting views (same definitions as src/services/accounting.js) ----------
-- Cash ledger: every settled money movement. Pending items never appear here.
create or replace view public.v_cash_ledger as
  select p.payment_date::timestamptz as at, p.receipt_number as tx, 'payment'::text as type, p.amount as income, 0::numeric as expense, p.payment_method
    from public.payments p where p.status in ('completed','refunded')
  union all
  select p.refunded_at, p.receipt_number || '-R', 'refund', 0, p.amount, p.payment_method
    from public.payments p where p.status = 'refunded'
  union all
  select (i.received_date)::timestamptz, i.code, 'income', i.amount, 0, i.payment_method
    from public.income_entries i where i.status = 'paid'
  union all
  select (e.paid_date)::timestamptz, e.code, 'expense', 0, e.amount, e.payment_method
    from public.expenses e where e.status = 'paid';

-- Running balance for any date range (opening balance = everything before the range).
create or replace function public.cash_ledger(p_from date, p_to date)
returns table (at timestamptz, tx text, type text, income numeric, expense numeric, payment_method text, balance numeric)
language sql stable security invoker as $$
  with opening as (
    select coalesce(sum(income - expense), 0) as amt from public.v_cash_ledger where at::date < p_from
  )
  select l.at, l.tx, l.type, l.income, l.expense, l.payment_method,
         (select amt from opening) + sum(l.income - l.expense) over (order by l.at, l.tx rows unbounded preceding)
  from public.v_cash_ledger l
  where l.at::date between p_from and p_to
  order by l.at, l.tx;
$$;

-- ---------- RLS: admin only ----------
-- Replace the predicate with your admin check (same one used on the other tables).
alter table public.expense_categories enable row level security;
alter table public.income_entries     enable row level security;
alter table public.audit_log          enable row level security;
create policy admin_all_expense_categories on public.expense_categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_all_income_entries     on public.income_entries     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_read_audit_log         on public.audit_log          for select to authenticated using (public.is_admin());
-- Excel export reads the same tables through the admin's session, so it is covered by these policies.
-- (public.is_admin() is assumed to exist from the auth setup; create it before applying this file.)

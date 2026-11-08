-- 0001_core_schema.sql
-- Core tables for the Cricket Academy admin app. Replaces the earlier unapplied drafts
-- (0001_arena_slots / 0002_accounting), which referenced tables that did not exist yet.
--
-- Conventions
--  * UUID primary keys, numeric(12,2) for money (INR), timestamptz for moments, date for business days.
--  * Business dates are Asia/Kolkata days (see ist_today / ist_date). Arena slots use time columns.
--  * No inventory / stock tables (removed from scope on purpose).

set search_path = public, extensions;

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;   -- needed by the double-booking exclusion constraint

-- ---------- helpers ----------
create or replace function public.ist_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

create or replace function public.ist_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Asia/Kolkata')::date $$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

-- ---------- auth-related ----------
-- Only emails listed here can ever become users (enforced by a trigger in 0002), so public sign-up is impossible.
create table if not exists public.admin_allowlist (
  email text primary key check (email = lower(btrim(email)))
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Phase 1 = exactly one admin. (To allow more later, drop this index.)
create unique index if not exists profiles_single_admin on public.profiles (role) where role = 'admin';

-- ---------- settings & plans ----------
create table if not exists public.academy_settings (
  id          boolean primary key default true check (id),            -- single-row table
  name        text not null default 'Cricket Academy' check (btrim(name) <> ''),
  phone       text not null default '',
  address     text not null default '',
  upi_id      text not null default '' check (upi_id = '' or upi_id ~ '^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$'),
  hourly_rate numeric(12,2) not null default 500 check (hourly_rate >= 0),
  open_hour   smallint not null default 6  check (open_hour between 0 and 23),
  close_hour  smallint not null default 22 check (close_hour between 1 and 24),
  currency    text not null default 'INR',
  timezone    text not null default 'Asia/Kolkata',
  updated_at  timestamptz not null default now(),
  check (close_hour > open_hour)
);
insert into public.academy_settings default values on conflict do nothing;

create table if not exists public.membership_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> ''),
  duration_months smallint not null check (duration_months between 1 and 60),
  price           numeric(12,2) not null check (price >= 0),
  description     text not null default '',
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists membership_plans_name_key on public.membership_plans (lower(btrim(name)));

-- ---------- students & memberships ----------
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (btrim(full_name) <> ''),
  mobile         text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  gender         text check (gender in ('Male','Female','Other')),
  date_of_birth  date,
  admission_date date not null default public.ist_today(),
  status         text not null default 'active' check (status in ('active','archived')),
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- A renewal is a NEW row. Price/plan name/duration are snapshots, so editing a plan never rewrites history.
create table if not exists public.memberships (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students(id) on delete restrict,
  plan_id         uuid references public.membership_plans(id) on delete set null,
  plan_name       text not null,
  duration_months smallint not null check (duration_months > 0),
  start_date      date not null,
  end_date        date not null,
  price           numeric(12,2) not null check (price >= 0),
  notes           text not null default '',
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- calendar months, inclusive end: 15 Jan + 1 month => 14 Feb
  constraint memberships_calendar_end check (end_date = ((start_date + make_interval(months => duration_months))::date - 1))
);

-- ---------- arena ----------
create table if not exists public.arena_customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  mobile     text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists arena_customers_identity on public.arena_customers (mobile, (lower(btrim(name))));

create table if not exists public.arena_bookings (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references public.arena_customers(id) on delete restrict,
  facility_id    text not null default 'main' check (btrim(facility_id) <> ''),
  booking_date   date not null,
  start_time     time not null,
  end_time       time not null,                       -- '24:00:00' is valid and means midnight at the end of the day
  duration_hours smallint generated always as (((extract(epoch from (end_time - start_time)) / 3600)::int)::smallint) stored,
  total_amount   numeric(12,2) not null check (total_amount > 0),
  notes          text not null default '',
  status         text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  cancelled_at   timestamptz,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint arena_time_order   check (end_time > start_time),
  constraint arena_whole_hours  check (extract(minute from start_time) = 0 and extract(second from start_time) = 0
                                   and extract(minute from end_time)   = 0 and extract(second from end_time)   = 0),
  constraint arena_cancel_stamp check ((status = 'cancelled') = (cancelled_at is not null)),
  -- THE double-booking guard: two confirmed bookings on the same facility can never overlap.
  -- Half-open [start, end): 6-8 and 8-10 are allowed together. Cancelled rows are ignored, which frees their slots.
  constraint arena_no_overlap exclude using gist (
    facility_id with =,
    tsrange(booking_date + start_time, booking_date + end_time, '[)') with &&
  ) where (status = 'confirmed')
);

-- ---------- payments (single source of truth for money received) ----------
create sequence if not exists public.receipt_seq;

create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  receipt_number   text not null unique default ('RCP-' || lpad(nextval('public.receipt_seq')::text, 5, '0')),
  membership_id    uuid references public.memberships(id) on delete restrict,
  arena_booking_id uuid references public.arena_bookings(id) on delete restrict,
  amount           numeric(12,2) not null check (amount > 0),
  payment_method   text not null check (payment_method in ('upi','cash','bank_transfer','card')),
  reference_number text not null default '',
  -- Phase 1 only writes 'completed' (admin-verified) and 'refunded'. 'pending'/'failed' exist so a future
  -- gateway webhook can use this table unchanged; they never count as cash.
  status           text not null default 'completed' check (status in ('pending','completed','failed','refunded')),
  payment_date     timestamptz not null default now(),
  refunded_at      timestamptz,
  refund_reason    text not null default '',
  gateway_txn_id   text unique,                                       -- idempotency key for a future gateway
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- a payment belongs to exactly ONE source record
  constraint payment_single_source check (num_nonnulls(membership_id, arena_booking_id) = 1),
  constraint payment_refund_stamp  check ((status = 'refunded') = (refunded_at is not null))
);

-- ---------- income (other than fees & bookings) ----------
create sequence if not exists public.income_seq;
create table if not exists public.income_entries (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique default ('INC-' || lpad(nextval('public.income_seq')::text, 5, '0')),
  title          text not null check (btrim(title) <> ''),
  category       text not null check (btrim(category) <> ''),
  amount         numeric(12,2) not null check (amount > 0),
  income_date    date not null,
  payment_method text check (payment_method in ('upi','cash','bank_transfer','card')),
  status         text not null default 'paid' check (status in ('paid','pending','cancelled')),
  received_date  date,
  description    text not null default '',
  reference      text not null default '',
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint income_paid_stamp check ((status = 'paid') = (received_date is not null)),
  constraint income_paid_method check (status <> 'paid' or payment_method is not null)
);

-- ---------- expenses ----------
create table if not exists public.expense_categories (
  name       text primary key check (btrim(name) <> ''),
  is_cogs    boolean not null default false,       -- true => "cost of goods / services sold" in the P&L
  sort_order smallint not null default 0,
  is_active  boolean not null default true
);
insert into public.expense_categories (name, is_cogs, sort_order) values
  ('Rent', false, 1), ('Salary', false, 2), ('Marketing', false, 3), ('Electricity', false, 4), ('Internet', false, 5),
  ('Travel', false, 6), ('Maintenance', false, 7), ('Purchases', true, 8), ('Miscellaneous', false, 9)
on conflict (name) do nothing;

create sequence if not exists public.expense_seq;
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique default ('EXP-' || lpad(nextval('public.expense_seq')::text, 5, '0')),
  title           text not null check (btrim(title) <> ''),
  category        text not null references public.expense_categories(name) on update cascade,
  amount          numeric(12,2) not null check (amount > 0),
  expense_date    date not null,
  payment_method  text check (payment_method in ('upi','cash','bank_transfer','card')),
  vendor          text not null default '',
  description     text not null default '',
  quantity        integer check (quantity > 0),               -- informational only, no stock tracking
  status          text not null default 'paid' check (status in ('paid','pending')),
  paid_date       date,
  attachment_path text,                                       -- object path in the private 'expense-bills' bucket
  created_by      uuid default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint expense_paid_stamp  check ((status = 'paid') = (paid_date is not null)),
  constraint expense_paid_method check (status <> 'paid' or payment_method is not null)
);

-- ---------- audit ----------
create table if not exists public.audit_logs (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  entity      text not null,
  entity_id   text not null,
  code        text,
  action      text not null check (action in ('create','update','delete','refund','cancel','export')),
  before      jsonb,
  after       jsonb
);

-- ---------- indexes ----------
create index if not exists students_status_idx        on public.students (status);
create index if not exists students_name_idx          on public.students (lower(full_name));
create index if not exists students_mobile_idx        on public.students (mobile);
create index if not exists students_admission_idx     on public.students (admission_date);
create index if not exists memberships_student_idx    on public.memberships (student_id, start_date desc);
create index if not exists memberships_end_idx        on public.memberships (end_date);
create index if not exists memberships_start_idx      on public.memberships (start_date);
create index if not exists arena_bookings_date_idx    on public.arena_bookings (booking_date, facility_id);
create index if not exists arena_bookings_customer_idx on public.arena_bookings (customer_id);
create index if not exists payments_membership_idx    on public.payments (membership_id);
create index if not exists payments_booking_idx       on public.payments (arena_booking_id);
create index if not exists payments_date_idx          on public.payments (payment_date);
create index if not exists income_date_idx            on public.income_entries (income_date);
create index if not exists expenses_date_idx          on public.expenses (expense_date);
create index if not exists expenses_paid_idx          on public.expenses (paid_date) where status = 'paid';
create index if not exists expenses_category_idx      on public.expenses (category);
create index if not exists audit_logs_at_idx          on public.audit_logs (at desc);
create index if not exists audit_logs_entity_idx      on public.audit_logs (entity, entity_id);

-- ---------- updated_at triggers ----------
do $$ declare t text;
begin
  foreach t in array array['profiles','academy_settings','membership_plans','students','memberships','arena_customers',
                           'arena_bookings','payments','income_entries','expenses'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

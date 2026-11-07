-- Arena hourly slot bookings: database-level double-booking protection.
-- Apply when the Supabase project is connected. Not yet run anywhere.

create extension if not exists btree_gist;

create table if not exists public.arena_bookings (
  id            uuid primary key default gen_random_uuid(),
  facility_id   text not null default 'main',            -- single facility in Phase 1
  customer_name text not null,
  mobile        text not null,
  booking_date  date not null,
  start_hour    smallint not null check (start_hour between 0 and 23),
  end_hour      smallint not null check (end_hour between 1 and 24),
  total_amount  numeric(10,2) not null check (total_amount > 0),
  notes         text,
  status        text not null default 'confirmed' check (status in ('confirmed','cancelled')),
  created_at    timestamptz not null default now(),
  check (end_hour > start_hour),
  -- Two active bookings can never overlap for the same facility and date.
  -- int4range is half-open [start, end), so 6-8 and 8-10 do NOT conflict.
  -- Cancelled rows are excluded, which releases their slots.
  constraint arena_no_overlap exclude using gist (
    facility_id with =,
    booking_date with =,
    int4range(start_hour, end_hour, '[)') with &&
  ) where (status <> 'cancelled')
);

alter table public.arena_bookings enable row level security;
-- RLS policies: admin-only, same pattern as the other tables (add with the main schema).

-- Booking + advance payment in ONE transaction. Overlap violations raise 23P01 (exclusion_violation),
-- which the frontend maps to "That slot was just booked. Pick another time."
-- Requires public.payments (arena_booking_id, amount, payment_method, reference_number, status).
create or replace function public.create_arena_booking(
  p_customer_name text, p_mobile text, p_booking_date date,
  p_start_hour int, p_end_hour int, p_total numeric, p_notes text,
  p_advance numeric default 0, p_method text default 'cash', p_reference text default null
) returns uuid
language plpgsql security invoker as $$
declare v_id uuid;
begin
  insert into public.arena_bookings (customer_name, mobile, booking_date, start_hour, end_hour, total_amount, notes)
  values (p_customer_name, p_mobile, p_booking_date, p_start_hour, p_end_hour, p_total, p_notes)
  returning id into v_id;                       -- the exclusion constraint serialises concurrent inserts

  if coalesce(p_advance, 0) > 0 then
    if p_advance > p_total then raise exception 'Advance is more than the total amount'; end if;
    insert into public.payments (arena_booking_id, amount, payment_method, reference_number, status)
    values (v_id, p_advance, p_method, p_reference, 'completed');
  end if;
  return v_id;
end $$;

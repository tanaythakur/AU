-- 0003_business_functions.sql
-- Money-changing operations. Each public RPC:
--   * is SECURITY DEFINER with a pinned search_path (no schema-hijacking),
--   * calls require_admin() FIRST (the caller must be the admin, checked in the database),
--   * runs as ONE transaction, so a failure leaves no orphaned records,
--   * is executable by `authenticated` only (never anon / public).

set search_path = public, extensions;

-- =====================================================================
-- Payment guards (apply to ANY insert, not just the RPCs)
-- =====================================================================
create or replace function public.payments_guard_insert() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_total numeric; v_paid numeric; v_status text;
begin
  if num_nonnulls(new.membership_id, new.arena_booking_id) <> 1 then
    raise exception 'A payment must belong to exactly one membership or booking.' using errcode = '23514';
  end if;
  if new.status = 'refunded' then
    raise exception 'A payment cannot be created as refunded.' using errcode = '23514';
  end if;
  if new.status = 'completed' then
    -- lock the parent row so two simultaneous payments are checked one after the other
    if new.membership_id is not null then
      select m.price into v_total from public.memberships m where m.id = new.membership_id for update;
      if not found then raise exception 'Membership not found.' using errcode = '23503'; end if;
      select coalesce(sum(p.amount), 0) into v_paid from public.payments p
        where p.membership_id = new.membership_id and p.status = 'completed';
    else
      select b.total_amount, b.status into v_total, v_status from public.arena_bookings b where b.id = new.arena_booking_id for update;
      if not found then raise exception 'Booking not found.' using errcode = '23503'; end if;
      if v_status = 'cancelled' then
        raise exception 'This booking is cancelled, so no payment can be added.' using errcode = '23514';
      end if;
      select coalesce(sum(p.amount), 0) into v_paid from public.payments p
        where p.arena_booking_id = new.arena_booking_id and p.status = 'completed';
    end if;
    if v_paid + new.amount > v_total then
      raise exception 'Amount is more than the balance due (INR %).', to_char(v_total - v_paid, 'FM999999990.00') using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create or replace function public.payments_guard_update() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- The ONLY permitted change: completed -> refunded (refund fields only). History is never rewritten.
  if old.status = 'completed' and new.status = 'refunded'
     and (new.id, new.receipt_number, new.membership_id, new.arena_booking_id, new.amount, new.payment_method,
          new.reference_number, new.payment_date, new.created_by, new.gateway_txn_id)
         is not distinct from
         (old.id, old.receipt_number, old.membership_id, old.arena_booking_id, old.amount, old.payment_method,
          old.reference_number, old.payment_date, old.created_by, old.gateway_txn_id) then
    new.refunded_at := coalesce(new.refunded_at, now());
    return new;
  end if;
  raise exception 'Payments cannot be edited. Only a completed payment can be marked refunded.' using errcode = '23514';
end $$;

create or replace function public.payments_block_delete() returns trigger
language plpgsql as $$
begin
  raise exception 'Payments cannot be deleted. Mark the payment as refunded instead.' using errcode = '23514';
end $$;

drop trigger if exists payments_guard_insert on public.payments;
create trigger payments_guard_insert before insert on public.payments for each row execute function public.payments_guard_insert();
drop trigger if exists payments_guard_update on public.payments;
create trigger payments_guard_update before update on public.payments for each row execute function public.payments_guard_update();
drop trigger if exists payments_block_delete on public.payments;
create trigger payments_block_delete before delete on public.payments for each row execute function public.payments_block_delete();

-- =====================================================================
-- Internal helpers (NOT granted to API roles)
-- =====================================================================
create or replace function public._insert_payment(p_membership uuid, p_booking uuid, p_amount numeric, p_method text, p_reference text)
returns public.payments
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.payments;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount greater than zero.' using errcode = '22023'; end if;
  if p_method is null or p_method not in ('upi','cash','bank_transfer','card') then
    raise exception 'Choose a payment method.' using errcode = '22023';
  end if;
  insert into public.payments (membership_id, arena_booking_id, amount, payment_method, reference_number, status)
  values (p_membership, p_booking, p_amount, p_method, coalesce(p_reference, ''), 'completed')
  returning * into v;
  return v;
end $$;

create or replace function public._create_membership(p_student uuid, p_plan uuid, p_start date, p_pay numeric, p_method text, p_reference text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_plan public.membership_plans; v_m public.memberships; v_p public.payments;
begin
  select * into v_plan from public.membership_plans where id = p_plan and is_active;
  if not found then raise exception 'That plan is not available.' using errcode = '23503'; end if;
  if not exists (select 1 from public.students where id = p_student) then
    raise exception 'Student not found.' using errcode = '23503';
  end if;
  if p_pay is not null and p_pay < 0 then raise exception 'Payment cannot be negative.' using errcode = '22023'; end if;

  insert into public.memberships (student_id, plan_id, plan_name, duration_months, start_date, end_date, price)
  values (p_student, v_plan.id, v_plan.name, v_plan.duration_months, p_start,
          (p_start + make_interval(months => v_plan.duration_months))::date - 1, v_plan.price)   -- price/plan snapshot
  returning * into v_m;

  if coalesce(p_pay, 0) > 0 then
    v_p := public._insert_payment(v_m.id, null, p_pay, p_method, p_reference);
  end if;
  return jsonb_build_object('membership_id', v_m.id, 'payment_id', v_p.id, 'receipt_number', v_p.receipt_number);
end $$;

-- =====================================================================
-- Public RPCs
-- =====================================================================

-- Student + first membership + first payment, atomically. Plan is optional (student can be added without one).
create or replace function public.enroll_student(
  p_full_name text, p_mobile text, p_gender text default null, p_date_of_birth date default null,
  p_plan_id uuid default null, p_start_date date default null,
  p_pay_amount numeric default 0, p_method text default null, p_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_s public.students; v_m jsonb := '{}'::jsonb;
begin
  perform public.require_admin();
  if p_mobile is null or p_mobile !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.' using errcode = '22023'; end if;
  if p_full_name is null or btrim(p_full_name) = '' then raise exception 'Enter the student name.' using errcode = '22023'; end if;
  insert into public.students (full_name, mobile, gender, date_of_birth)
  values (btrim(p_full_name), p_mobile, nullif(p_gender, ''), p_date_of_birth) returning * into v_s;
  if p_plan_id is not null then
    v_m := public._create_membership(v_s.id, p_plan_id, coalesce(p_start_date, public.ist_today()), p_pay_amount, p_method, p_reference);
  end if;
  return jsonb_build_object('student_id', v_s.id) || v_m;
end $$;

-- New membership / renewal for an existing student. Always inserts a NEW row; history is never overwritten.
create or replace function public.add_membership(
  p_student_id uuid, p_plan_id uuid, p_start_date date default null,
  p_pay_amount numeric default 0, p_method text default null, p_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.require_admin();
  return public._create_membership(p_student_id, p_plan_id, coalesce(p_start_date, public.ist_today()), p_pay_amount, p_method, p_reference);
end $$;

-- Collect money against a membership OR a booking (exactly one). Overpayment is rejected by the guard trigger.
create or replace function public.record_payment(
  p_membership_id uuid default null, p_arena_booking_id uuid default null,
  p_amount numeric default null, p_method text default null, p_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.payments;
begin
  perform public.require_admin();
  if num_nonnulls(p_membership_id, p_arena_booking_id) <> 1 then
    raise exception 'A payment must be for exactly one membership or booking.' using errcode = '22023';
  end if;
  v := public._insert_payment(p_membership_id, p_arena_booking_id, p_amount, p_method, p_reference);
  return jsonb_build_object('payment_id', v.id, 'receipt_number', v.receipt_number);
end $$;

create or replace function public.refund_payment(p_payment_id uuid, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.payments;
begin
  perform public.require_admin();
  update public.payments set status = 'refunded', refund_reason = coalesce(p_reason, '')
   where id = p_payment_id and status = 'completed' returning * into v;
  if not found then raise exception 'Only a completed payment can be refunded.' using errcode = '23514'; end if;
  return jsonb_build_object('payment_id', v.id, 'refunded_at', v.refunded_at);
end $$;

-- Hourly slot booking. Overlap protection is the arena_no_overlap exclusion constraint (see 0001):
-- two simultaneous requests for the same slot cannot both commit.
create or replace function public.create_arena_booking(
  p_customer_name text, p_mobile text, p_booking_date date, p_start_time time, p_end_time time,
  p_total numeric, p_notes text default '', p_facility text default 'main',
  p_advance numeric default 0, p_method text default null, p_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_set public.academy_settings; v_c uuid; v_b public.arena_bookings; v_p public.payments;
        v_from numeric; v_to numeric;
begin
  perform public.require_admin();
  if p_customer_name is null or btrim(p_customer_name) = '' then raise exception 'Enter the customer name.' using errcode = '22023'; end if;
  if p_mobile is null or p_mobile !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.' using errcode = '22023'; end if;
  if p_booking_date is null then raise exception 'Pick a booking date.' using errcode = '22023'; end if;
  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'End time must be after start time.' using errcode = '22023';
  end if;
  if extract(minute from p_start_time) <> 0 or extract(second from p_start_time) <> 0
     or extract(minute from p_end_time) <> 0 or extract(second from p_end_time) <> 0 then
    raise exception 'Bookings are in whole hours.' using errcode = '22023';
  end if;
  if p_total is null or p_total <= 0 then raise exception 'Total amount must be more than zero.' using errcode = '22023'; end if;
  if coalesce(p_advance, 0) < 0 or coalesce(p_advance, 0) > p_total then
    raise exception 'Advance cannot be more than the total amount.' using errcode = '22023';
  end if;

  select * into v_set from public.academy_settings where id;
  v_from := extract(epoch from p_start_time) / 3600;
  v_to   := extract(epoch from p_end_time) / 3600;
  if v_from < v_set.open_hour or v_to > v_set.close_hour then
    raise exception 'That time is outside the arena opening hours (% to %).', v_set.open_hour, v_set.close_hour using errcode = '22023';
  end if;

  insert into public.arena_customers (name, mobile) values (btrim(p_customer_name), p_mobile)
  on conflict (mobile, (lower(btrim(name)))) do update set updated_at = now()
  returning id into v_c;

  begin
    insert into public.arena_bookings (customer_id, facility_id, booking_date, start_time, end_time, total_amount, notes)
    values (v_c, coalesce(nullif(btrim(p_facility), ''), 'main'), p_booking_date, p_start_time, p_end_time, p_total, coalesce(p_notes, ''))
    returning * into v_b;
  exception when exclusion_violation then
    raise exception 'That time slot was just booked. Pick another time.' using errcode = '23P01';
  end;

  if coalesce(p_advance, 0) > 0 then
    v_p := public._insert_payment(null, v_b.id, p_advance, p_method, p_reference);
  end if;
  return jsonb_build_object('booking_id', v_b.id, 'customer_id', v_c, 'payment_id', v_p.id, 'receipt_number', v_p.receipt_number);
end $$;

-- Cancelling releases the slots immediately (the exclusion constraint only covers status = 'confirmed').
-- Payments already received stay in the ledger; refund them separately if money is returned.
create or replace function public.cancel_arena_booking(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.arena_bookings;
begin
  perform public.require_admin();
  select * into v from public.arena_bookings where id = p_booking_id for update;
  if not found then raise exception 'Booking not found.' using errcode = '23503'; end if;
  if v.status = 'cancelled' then return jsonb_build_object('booking_id', v.id, 'already_cancelled', true); end if;
  update public.arena_bookings set status = 'cancelled', cancelled_at = now() where id = p_booking_id;
  return jsonb_build_object('booking_id', v.id);
end $$;

-- ---------- execute privileges: authenticated only (RLS/is_admin still enforced inside) ----------
revoke all on function
  public.payments_guard_insert(), public.payments_guard_update(), public.payments_block_delete(),
  public._insert_payment(uuid, uuid, numeric, text, text),
  public._create_membership(uuid, uuid, date, numeric, text, text),
  public.require_admin()
from public, anon, authenticated;

revoke all on function
  public.enroll_student(text, text, text, date, uuid, date, numeric, text, text),
  public.add_membership(uuid, uuid, date, numeric, text, text),
  public.record_payment(uuid, uuid, numeric, text, text),
  public.refund_payment(uuid, text),
  public.create_arena_booking(text, text, date, time, time, numeric, text, text, numeric, text, text),
  public.cancel_arena_booking(uuid)
from public, anon;

grant execute on function
  public.enroll_student(text, text, text, date, uuid, date, numeric, text, text),
  public.add_membership(uuid, uuid, date, numeric, text, text),
  public.record_payment(uuid, uuid, numeric, text, text),
  public.refund_payment(uuid, text),
  public.create_arena_booking(text, text, date, time, time, numeric, text, text, numeric, text, text),
  public.cancel_arena_booking(uuid)
to authenticated;

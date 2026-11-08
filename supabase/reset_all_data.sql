-- reset_all_data.sql  ==========================================================================
-- ONE-TIME CLEAN SLATE. Run it ONLY in the Supabase SQL Editor, ONLY before you start using the app for real.
--
-- WHAT IT DELETES FOREVER (cannot be undone):
--   students, memberships, ALL payments, arena customers and bookings, income entries, expenses,
--   membership plans, the whole audit log. Academy settings go back to defaults (name, phone, UPI id, rates).
--   Receipt / expense / income numbers start again from 00001.
--
-- WHAT IT KEEPS:
--   your admin login (auth user + profile + allow-list), the 9 expense categories, and every table/function/policy.
--
-- HOW TO RUN:
--   1. In the block just below, change   'NO'   to   'YES'   (keep the quotes, capital letters).
--   2. Run the whole script once.
--   3. The last query shows every table with 0 rows.
-- NOTE: files already uploaded as expense bills are NOT removed by SQL. Delete them in
--       Dashboard -> Storage -> expense-bills if you uploaded any.
-- ================================================================================================

do $$
declare
  confirm_wipe text := 'NO';      -- <<< CHANGE 'NO' TO 'YES' TO ALLOW THE WIPE
begin
  if confirm_wipe <> 'YES' then
    raise exception 'Nothing was deleted (safety lock). Change ''NO'' to ''YES'' in the line marked "<<<", then run again.';
  end if;
end $$;

begin;

-- settings first (so this change is not left behind in the audit log we are about to empty)
update public.academy_settings
   set name = 'Cricket Academy', phone = '', address = '', upi_id = '', hourly_rate = 500, open_hour = 6, close_hour = 22;

-- TRUNCATE removes rows without firing the "payments cannot be deleted" / "audit cannot be changed" row triggers.
truncate table
  public.audit_logs,
  public.payments,
  public.memberships,
  public.arena_bookings,
  public.arena_customers,
  public.students,
  public.income_entries,
  public.expenses,
  public.membership_plans
restart identity;

alter sequence public.receipt_seq restart with 1;
alter sequence public.income_seq  restart with 1;
alter sequence public.expense_seq restart with 1;

commit;

-- proof: everything should say 0 (admin / categories / settings are kept on purpose)
select 'students' as tbl, count(*) from public.students
union all select 'memberships', count(*) from public.memberships
union all select 'payments', count(*) from public.payments
union all select 'arena_bookings', count(*) from public.arena_bookings
union all select 'arena_customers', count(*) from public.arena_customers
union all select 'income_entries', count(*) from public.income_entries
union all select 'expenses', count(*) from public.expenses
union all select 'membership_plans', count(*) from public.membership_plans
union all select 'audit_logs', count(*) from public.audit_logs
union all select 'KEPT: admin profile', count(*) from public.profiles
union all select 'KEPT: expense categories', count(*) from public.expense_categories;

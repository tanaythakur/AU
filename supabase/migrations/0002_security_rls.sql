-- 0002_security_rls.sql
-- Single-admin security model.
--  1. Only emails in admin_allowlist can ever be created as users (public sign-up is impossible even if the
--     dashboard "Allow new users to sign up" toggle is left on).
--  2. is_admin() is the one authorization check used by every policy and every RPC.
--  3. Row Level Security is enabled on every table. Money-changing tables have NO direct write access:
--     they are written only through the SECURITY DEFINER functions in 0003 (atomic + validated).
--  4. anon gets nothing. authenticated gets only what the policies below allow.

set search_path = public, extensions;

-- ---------- sign-up gate + profile creation ----------
create or replace function public.guard_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.admin_allowlist a where a.email = lower(btrim(new.email))) then
    raise exception 'Sign-ups are disabled for this application.' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, lower(btrim(new.email)), coalesce(new.raw_user_meta_data ->> 'full_name', 'Academy Admin'), 'admin')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists a_guard_new_user on auth.users;
create trigger a_guard_new_user before insert on auth.users for each row execute function public.guard_new_user();
drop trigger if exists b_handle_new_user on auth.users;
create trigger b_handle_new_user after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- the authorization check ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

create or replace function public.require_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;
end $$;

-- ---------- lock everything down first ----------
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

grant usage on schema public to authenticated;
grant execute on function public.is_admin() to authenticated;
-- pure date helpers are used in column defaults, which run with the caller's privileges
grant execute on function public.ist_today(), public.ist_date(timestamptz) to authenticated;

-- ---------- grants (what the API role may attempt; policies then filter by is_admin()) ----------
grant select                         on public.profiles           to authenticated;
grant select, update                 on public.academy_settings   to authenticated;
grant select, insert, update         on public.membership_plans   to authenticated;
grant select, insert, update         on public.students           to authenticated;
grant select                         on public.memberships        to authenticated;  -- writes: RPC only
grant select                         on public.arena_customers    to authenticated;  -- writes: RPC only
grant select                         on public.arena_bookings     to authenticated;  -- writes: RPC only
grant select                         on public.payments           to authenticated;  -- writes: RPC only
grant select, insert, update, delete on public.income_entries     to authenticated;
grant select, insert, update         on public.expense_categories to authenticated;
grant select, insert, update, delete on public.expenses           to authenticated;
grant select                         on public.audit_logs         to authenticated;  -- append-only via triggers/RPC
-- admin_allowlist: no grants at all (managed from the SQL editor only)

-- inserts into income/expenses use these sequences in column defaults
grant usage on sequence public.income_seq, public.expense_seq to authenticated;

-- ---------- RLS ----------
do $$ declare t text;
begin
  foreach t in array array['admin_allowlist','profiles','academy_settings','membership_plans','students','memberships',
                           'arena_customers','arena_bookings','payments','income_entries','expense_categories','expenses','audit_logs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles: a user may read only their own row; nobody writes through the API
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());

-- helper to keep policy definitions short and consistent
do $$
declare r record;
begin
  for r in select * from (values
    ('academy_settings',   'select'), ('academy_settings',   'update'),
    ('membership_plans',   'select'), ('membership_plans',   'insert'), ('membership_plans', 'update'),
    ('students',           'select'), ('students',           'insert'), ('students',          'update'),
    ('memberships',        'select'),
    ('arena_customers',    'select'),
    ('arena_bookings',     'select'),
    ('payments',           'select'),
    ('income_entries',     'select'), ('income_entries',     'insert'), ('income_entries',    'update'), ('income_entries', 'delete'),
    ('expense_categories', 'select'), ('expense_categories', 'insert'), ('expense_categories','update'),
    ('expenses',           'select'), ('expenses',           'insert'), ('expenses',          'update'), ('expenses',       'delete'),
    ('audit_logs',         'select')
  ) as v(tbl, cmd)
  loop
    execute format('drop policy if exists admin_%s on public.%I', r.cmd, r.tbl);
    if r.cmd in ('select', 'delete') then
      execute format('create policy admin_%s on public.%I for %s to authenticated using (public.is_admin())', r.cmd, r.tbl, r.cmd);
    elsif r.cmd = 'insert' then
      execute format('create policy admin_%s on public.%I for insert to authenticated with check (public.is_admin())', r.cmd, r.tbl);
    else
      execute format('create policy admin_%s on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', r.cmd, r.tbl);
    end if;
  end loop;
end $$;

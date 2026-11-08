-- 0005_storage.sql
-- Private bucket for expense bills/receipts. Only the admin can read or write objects; files are shown to the
-- admin through short-lived signed URLs (the bucket is NOT public).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-bills', 'expense-bills', false, 2097152,
        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists expense_bills_select on storage.objects;
drop policy if exists expense_bills_insert on storage.objects;
drop policy if exists expense_bills_update on storage.objects;
drop policy if exists expense_bills_delete on storage.objects;

create policy expense_bills_select on storage.objects for select to authenticated
  using (bucket_id = 'expense-bills' and public.is_admin());
create policy expense_bills_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-bills' and public.is_admin());
create policy expense_bills_update on storage.objects for update to authenticated
  using (bucket_id = 'expense-bills' and public.is_admin()) with check (bucket_id = 'expense-bills' and public.is_admin());
create policy expense_bills_delete on storage.objects for delete to authenticated
  using (bucket_id = 'expense-bills' and public.is_admin());

-- 0006_student_delete.sql
-- Deleting a student. A student with ANY membership (and therefore possible payments) can never be deleted:
-- payments are permanent financial records. Those students are archived instead (status = 'archived', already
-- allowed by the students UPDATE policy). Only a student that has no history (e.g. added by mistake) can be deleted.
-- Safe to run whether or not 0001-0005 were applied earlier (create or replace).

set search_path = public, extensions;

create or replace function public.delete_student(p_student_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.students;
begin
  perform public.require_admin();
  select * into v from public.students where id = p_student_id for update;
  if not found then raise exception 'Student not found.' using errcode = '23503'; end if;
  if exists (select 1 from public.memberships m where m.student_id = p_student_id) then
    raise exception 'This student has membership and payment history, so it cannot be deleted. Archive the student instead.' using errcode = '23514';
  end if;
  delete from public.students where id = p_student_id;   -- the audit trigger keeps a full snapshot of the deleted row
  return jsonb_build_object('student_id', p_student_id);
end $$;

revoke all on function public.delete_student(uuid) from public, anon;
grant execute on function public.delete_student(uuid) to authenticated;

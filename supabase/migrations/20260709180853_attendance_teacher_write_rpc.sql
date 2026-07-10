-- ADR-0021 (supersedes ADR-0020): attendance_teacher_insert/update (Task 2) never
-- actually worked for a real client — Postgres RLS needs SELECT-equivalent
-- visibility for UPDATE/RETURNING, and Teacher intentionally has none on
-- attendance (ADR-0019). Replaced with a SECURITY DEFINER RPC, same pattern as
-- the ADR-0019 read RPCs.
drop policy if exists attendance_teacher_insert on attendance;
drop policy if exists attendance_teacher_update on attendance;
revoke insert, update on attendance from authenticated;

create or replace function mark_attendance_for_staff(
  p_enrollment_id uuid,
  p_class_meeting_date date,
  p_status text
)
returns attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  v_row attendance%rowtype;
begin
  if v_role = 'teacher' then
    v_authorized := exists (
      select 1 from enrollments e
      where e.id = p_enrollment_id and e.class_id = v_scope_id
    );
  end if;

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'attendance', p_enrollment_id, null);
    return null;
  end if;

  insert into attendance (enrollment_id, class_meeting_date, status, marked_by)
  values (p_enrollment_id, p_class_meeting_date, p_status, auth.uid())
  on conflict (enrollment_id, class_meeting_date)
  do update set status = excluded.status, marked_by = excluded.marked_by, submitted_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function mark_attendance_for_staff(uuid, date, text) from public;
grant execute on function mark_attendance_for_staff(uuid, date, text) to authenticated;

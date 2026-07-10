create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text not null,
  action text not null check (action in ('read','denied')),
  target_table text not null,
  target_id uuid,
  target_student_id uuid references students(id) on delete set null,
  accessed_at timestamptz not null default now()
);

alter table audit_log enable row level security;

-- Only SELECT is ever granted to authenticated; writes happen exclusively via the
-- SECURITY DEFINER RPCs below, which run as the table owner and bypass both this
-- grant and RLS. This is the "direct insert cannot forge an entry" guarantee (ADR-0019).
grant select on audit_log to authenticated;
revoke insert, update, delete on audit_log from authenticated, anon;

create policy audit_log_org_read on audit_log for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

create policy audit_log_coordinator_read on audit_log for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and (
    (
      audit_log.target_student_id is not null
      and exists (
        select 1 from enrollments e
        where e.student_id = audit_log.target_student_id
          and e.session_id = (auth.jwt()->>'scope_id')::uuid
      )
    )
    or (
      audit_log.target_table = 'classes'
      and exists (
        select 1 from classes c
        where c.id = audit_log.target_id
          and c.session_id = (auth.jwt()->>'scope_id')::uuid
      )
    )
  )
);

create or replace function get_student_for_staff(p_student_id uuid)
returns setof students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from enrollments e where e.student_id = p_student_id and e.session_id = v_scope_id);
  elsif v_role = 'teacher' then
    v_authorized := exists (select 1 from enrollments e where e.student_id = p_student_id and e.class_id = v_scope_id);
  end if;

  if v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'read', 'students', p_student_id, p_student_id);
    return query select * from students s where s.id = p_student_id;
  else
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'students', p_student_id, p_student_id);
    return;
  end if;
end;
$$;

create or replace function get_class_roster_for_staff(p_class_id uuid)
returns setof students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  r students%rowtype;
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from classes c where c.id = p_class_id and c.session_id = v_scope_id);
  elsif v_role = 'teacher' then
    v_authorized := (p_class_id = v_scope_id);
  end if;

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'classes', p_class_id, null);
    return;
  end if;

  for r in
    select s.* from students s
    join enrollments e on e.student_id = s.id
    where e.class_id = p_class_id and e.status = 'active'
  loop
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'read', 'students', r.id, r.id);
    return next r;
  end loop;
  return;
end;
$$;

create or replace function get_class_attendance_for_staff(p_class_id uuid, p_date_from date, p_date_to date)
returns setof attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  r attendance%rowtype;
  v_student_id uuid;
  v_seen_students uuid[] := array[]::uuid[];
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from classes c where c.id = p_class_id and c.session_id = v_scope_id);
  elsif v_role = 'teacher' then
    v_authorized := (p_class_id = v_scope_id);
  end if;

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'classes', p_class_id, null);
    return;
  end if;

  for r in
    select a.* from attendance a
    join enrollments e on e.id = a.enrollment_id
    where e.class_id = p_class_id and a.class_meeting_date between p_date_from and p_date_to
  loop
    select e2.student_id into v_student_id from enrollments e2 where e2.id = r.enrollment_id;
    if not (v_student_id = any(v_seen_students)) then
      insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
      values (auth.uid(), v_role, 'read', 'attendance', r.id, v_student_id);
      v_seen_students := array_append(v_seen_students, v_student_id);
    end if;
    return next r;
  end loop;
  return;
end;
$$;

create or replace function get_consents_for_staff(p_student_id uuid)
returns setof consents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  r consents%rowtype;
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := exists (select 1 from enrollments e where e.student_id = p_student_id and e.session_id = v_scope_id);
  end if;
  -- Teacher is never authorized here (consent status isn't a teaching-day need, per spec).

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'consents', p_student_id, p_student_id);
    return;
  end if;

  for r in select c.* from consents c where c.student_id = p_student_id
  loop
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'read', 'consents', r.id, p_student_id);
    return next r;
  end loop;
  return;
end;
$$;

revoke all on function get_student_for_staff(uuid) from public;
revoke all on function get_class_roster_for_staff(uuid) from public;
revoke all on function get_class_attendance_for_staff(uuid, date, date) from public;
revoke all on function get_consents_for_staff(uuid) from public;
grant execute on function get_student_for_staff(uuid) to authenticated;
grant execute on function get_class_roster_for_staff(uuid) to authenticated;
grant execute on function get_class_attendance_for_staff(uuid, date, date) to authenticated;
grant execute on function get_consents_for_staff(uuid) to authenticated;

-- Fail closed when a teacher's scope_id claim is absent (#73).
--
-- get_class_roster_for_staff and get_class_attendance_for_staff both authorize a teacher with a
-- bare equality against a JWT claim:
--
--   v_authorized := (p_class_id = v_scope_id);
--   if not v_authorized then <audit 'denied'>; return; end if;
--
-- When the scope_id claim is absent the auth hook drops it entirely, v_scope_id is NULL, and the
-- comparison yields NULL -- not false. `not NULL` is NULL, and a plpgsql IF executes its branch
-- only when the condition is true, so the deny-and-return block is SKIPPED and control continues
-- into the authorized path. The guard fails OPEN: the caller receives the full class roster or
-- attendance set.
--
-- The `exists (...)` forms in the same functions are unaffected -- EXISTS never returns NULL.
--
-- Same shape, same fix, already landed for the coordinator branch of
-- generate_class_meetings_for_session and get_session_compliance_for_staff in 686e6ba (PR #50
-- review, @ssrinivas90). These two functions live in 20260709040853_audit_log_and_staff_rpcs.sql,
-- which is already applied, so this is a forward-only migration rather than an edit to applied
-- history (§12.1 non-negotiable #3). Both function bodies are restated in full because
-- `create or replace` has no partial form; only the two marked lines differ from the original.
--
-- Not reachable through the app today: user_roles_org_scope_null_id keeps a class-scoped teacher's
-- scope_id non-null, so the hook always stamps one. But an access-control guard must fail closed
-- on its own terms rather than inherit safety from an upstream constraint a later migration could
-- relax (§12.1 non-negotiable #1, §11.3). Removing the precondition itself -- constraining which
-- scope_type each role may hold -- is tracked separately in #75, and needs an ADR.
--
-- Covered by 040_audit_rpc_and_denied_logging.sql tests 15-18, each mutation-proved red against
-- this migration's absence.
--
-- `create or replace` preserves existing privileges; no re-GRANT is needed.

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
    -- coalesce (#73): a NULL v_scope_id (claim absent/empty) makes this comparison NULL, and
    -- `if not v_authorized` does NOT take its branch on NULL -- the guard would fall THROUGH to
    -- the authorized path. Fail closed instead.
    v_authorized := coalesce(p_class_id = v_scope_id, false);
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
    -- coalesce (#73): see the note on get_class_roster_for_staff above -- identical shape,
    -- identical failure mode. Fail closed on a NULL scope_id claim.
    v_authorized := coalesce(p_class_id = v_scope_id, false);
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

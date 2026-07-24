-- Adversarial red-team pass for ADR-0031 (sessions.day_of_week/start_time/end_time) and the
-- teacher attendance write/read RPC path (issue #20 security review): role x scope attacks
-- against sessions/classes/enrollments/attendance, plus a forged-JWT default-deny check.
begin;
select plan(13);

-- Two independent centers/sessions/classes so "own scope" vs "other scope" is unambiguous.
insert into families (id, label) values ('a6000000-0000-0000-0000-000000000001', 'Adv Family A');
insert into centers (id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'Adv Center A'),
  ('b2000000-0000-0000-0000-000000000001', 'Adv Center B');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'Adv Session A', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('b1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'Adv Session B', '2026-01-01', '2026-06-01', 5, '18:45', '20:15');
insert into classes (id, session_id, name, grade_band) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Adv Class A', 'Grade5'),
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Adv Class B', 'Grade5');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('a4000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Adv', 'StudentA', 'Grade5');
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'active');

select tests.create_supabase_user('adv-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('adv-coordinator-a@test.local') as v_coord_a \gset
select tests.create_supabase_user('adv-student-a@test.local') as v_student_a \gset
update students set user_id = :'v_student_a'::uuid where id = 'a4000000-0000-0000-0000-000000000001';
insert into family_members (family_id, user_id, relationship) values ('a6000000-0000-0000-0000-000000000001', :'v_student_a'::uuid, 'self');

-- 1) Teacher scoped to Class A must see zero rows of Session B (row-level: base check).
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'a3000000-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from sessions where id = 'b1000000-0000-0000-0000-000000000001')::int, 0,
  'ATTACK: teacher for Class A reads Session B row -> must be 0 rows (cross-center)'
);

-- 2) Even the new schedule columns specifically must not leak for Session B.
select is(
  (select count(*) from sessions where id = 'b1000000-0000-0000-0000-000000000001' and day_of_week is not null)::int, 0,
  'ATTACK: teacher cannot read Session B day_of_week/start_time/end_time via base table either'
);

-- 3) Teacher for Class A CAN see their own session's schedule columns (sanity: not over-blocked).
select is(
  (select day_of_week from sessions where id = 'a1000000-0000-0000-0000-000000000001')::int, 0,
  'SANITY: teacher for Class A can read their own Session A day_of_week'
);

-- 4) get_class_roster_for_staff for Class B (out of scope) -> zero rows + denied audit log.
select is(
  (select count(*) from get_class_roster_for_staff('b3000000-0000-0000-0000-000000000001'::uuid))::int, 0,
  'ATTACK: teacher calls get_class_roster_for_staff for Class B -> 0 rows'
);
-- Teacher has no audit_log SELECT policy (by design -- only coordinator/bv_coordinator/admin
-- read it); verify the denied row as the harness superuser, then restore teacher auth for the
-- rest of the sequence.
select tests.clear_authentication();
select ok(
  exists (
    select 1 from audit_log
    where target_table = 'classes' and target_id = 'b3000000-0000-0000-0000-000000000001' and action = 'denied'
  ),
  'get_class_roster_for_staff(Class B) by teacher-A left a denied audit_log row'
);
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'a3000000-0000-0000-0000-000000000001'::uuid);

-- 5) get_class_attendance_for_staff for Class B -> zero rows.
select is(
  (select count(*) from get_class_attendance_for_staff('b3000000-0000-0000-0000-000000000001'::uuid, '2026-01-01'::date, '2026-12-31'::date))::int, 0,
  'ATTACK: teacher calls get_class_attendance_for_staff for Class B -> 0 rows'
);

-- 6) mark_attendance_for_staff for an enrollment that belongs to Class B -> must return null
--    (denied), not error or succeed.
select tests.clear_authentication();
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('b4000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Adv', 'StudentB', 'Grade5');
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'active');
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'a3000000-0000-0000-0000-000000000001'::uuid);
select ok(
  (select mark_attendance_for_staff('b5000000-0000-0000-0000-000000000001'::uuid, '2026-02-01'::date, 'present')) is null,
  'ATTACK: teacher-A calls mark_attendance_for_staff for a Class-B enrollment -> denied (null)'
);
select tests.clear_authentication();
select is(
  (select count(*) from attendance where enrollment_id = 'b5000000-0000-0000-0000-000000000001')::int, 0,
  'no attendance row was created cross-scope by the denied call'
);

-- 7) Coordinator scoped to Session A reads Session B -> zero rows.
select tests.authenticate_as(:'v_coord_a'::uuid, 'coordinator', 'session', 'a1000000-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from sessions where id = 'b1000000-0000-0000-0000-000000000001')::int, 0,
  'ATTACK: coordinator for Session A reads Session B -> 0 rows'
);
select is(
  (select count(*) from get_class_roster_for_staff('b3000000-0000-0000-0000-000000000001'::uuid))::int, 0,
  'ATTACK: coordinator for Session A calls get_class_roster_for_staff(Class B) -> 0 rows'
);

-- 8) Student (own child in Class A) cannot read Session B.
select tests.clear_authentication();
select tests.authenticate_as(:'v_student_a'::uuid, 'student');
select is(
  (select count(*) from sessions where id = 'b1000000-0000-0000-0000-000000000001')::int, 0,
  'ATTACK: student in Class A reads Session B -> 0 rows'
);

-- 9) Forged/omitted claims: no active_role at all -> zero rows on sessions entirely
--    (default-deny), not an error and not implicit access.
select tests.clear_authentication();
-- Reproduce what authenticate_as() does, minus active_role/scope_type/scope_id, so the session
-- is genuinely running as Postgres role `authenticated` (not superuser) with a forged/incomplete
-- claims set -- a stale or tampered JWT missing active_role entirely.
select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role','authenticated')::text, true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*) from sessions)::int, 0,
  'ATTACK: authenticated JWT with no active_role claim at all -> 0 sessions rows (default-deny)'
);

-- 10) Date-integrity probe (not cross-scope, but flagged per architect brief): teacher-A marks
--     attendance for their OWN class using a class_meeting_date wildly outside the session's
--     [start_date,end_date] and not matching day_of_week at all. This documents that
--     mark_attendance_for_staff performs NO date-bound/day_of_week validation server-side --
--     informational, not a scope leak (still gated to teacher's own class/enrollment).
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'a3000000-0000-0000-0000-000000000001'::uuid);
select ok(
  (select status from mark_attendance_for_staff('a5000000-0000-0000-0000-000000000001'::uuid, '2099-12-25'::date, 'present')) = 'present',
  'INFO (not a leak): mark_attendance_for_staff accepts a date far outside session.start_date/end_date and off day_of_week -- no server-side date-bound check exists'
);

select tests.clear_authentication();
select * from finish();
rollback;

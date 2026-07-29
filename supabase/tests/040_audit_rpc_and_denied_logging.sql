begin;
select plan(14);

insert into families (id, label) values ('fd111111-0000-0000-0000-000000000001', 'Audit Family');
select tests.create_supabase_user('audit-teacher-in@test.local') as v_teacher_in \gset
select tests.create_supabase_user('audit-teacher-out@test.local') as v_teacher_out \gset

insert into students (id, family_id, first_name, last_name, grade_level) values
  ('5e111111-0000-0000-0000-000000000001', 'fd111111-0000-0000-0000-000000000001', 'Aud', 'Ent', 'Grade6');

insert into centers (id, name) values ('c9999999-0000-0000-0000-000000000001', 'Audit Fixture Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
  values ('a3111111-0000-0000-0000-000000000001', 'c9999999-0000-0000-0000-000000000001', 'Audit-Session', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band)
  values ('c3111111-0000-0000-0000-000000000001', 'a3111111-0000-0000-0000-000000000001', 'Audit Class In', 'Grade6');

insert into enrollments (id, student_id, class_id, session_id, status)
values ('e3111111-0000-0000-0000-000000000001', '5e111111-0000-0000-0000-000000000001', 'c3111111-0000-0000-0000-000000000001', 'a3111111-0000-0000-0000-000000000001', 'active');

-- Inserted now (while still unauthenticated/superuser) so it exists before any role switch below —
-- the attendance write policy only allows the in-scope teacher, which isn't simulated yet.
insert into attendance (enrollment_id, class_meeting_date, status)
values ('e3111111-0000-0000-0000-000000000001', '2026-02-01', 'present');

-- RPC-bypass check: Teacher's plain select returns zero rows; the RPC returns the row + logs 'read'.
select tests.authenticate_as(:'v_teacher_in'::uuid, 'teacher', 'class', 'c3111111-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from students where id = '5e111111-0000-0000-0000-000000000001')::int, 0,
  'teacher direct select on students (in-class student) returns zero rows');

select is((select count(*) from get_student_for_staff('5e111111-0000-0000-0000-000000000001'::uuid))::int, 1,
  'get_student_for_staff returns the row for an in-class student');

-- audit_log has no read policy for 'teacher' (by design — only coordinator/bv_coordinator/admin
-- may read it, per ADR-0019), so verifying the RPC's write requires dropping back to the
-- unauthenticated/superuser session context (which bypasses RLS) rather than reading as Teacher.
select tests.clear_authentication();
select is(
  (select count(*) from audit_log where target_student_id = '5e111111-0000-0000-0000-000000000001' and action = 'read')::int, 1,
  'exactly one audit_log read row was created by the successful RPC call'
);

-- Denied-attempt logging: Teacher outside the class gets no row + a 'denied' audit_log row.
select tests.authenticate_as(:'v_teacher_out'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from get_student_for_staff('5e111111-0000-0000-0000-000000000001'::uuid))::int, 0,
  'get_student_for_staff returns nothing for an out-of-class teacher');

select tests.clear_authentication();
select is(
  (select count(*) from audit_log where target_student_id = '5e111111-0000-0000-0000-000000000001' and action = 'denied')::int, 1,
  'exactly one audit_log denied row was created by the out-of-scope RPC call'
);

-- Roster + attendance RPCs also audit (spot check) — the attendance fixture row was inserted above.
select tests.authenticate_as(:'v_teacher_in'::uuid, 'teacher', 'class', 'c3111111-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from get_class_roster_for_staff('c3111111-0000-0000-0000-000000000001'::uuid))::int, 1,
  'get_class_roster_for_staff returns the one enrolled student');
select is((select count(*) from get_class_attendance_for_staff('c3111111-0000-0000-0000-000000000001'::uuid, '2026-01-01'::date, '2026-03-01'::date))::int, 1,
  'get_class_attendance_for_staff returns the attendance row');

-- Consents RPC: Teacher is never authorized (not just out-of-scope).
select is((select count(*) from get_consents_for_staff('5e111111-0000-0000-0000-000000000001'::uuid))::int, 0,
  'teacher (any scope) is never authorized to call get_consents_for_staff');

-- Audit-log integrity: direct insert from authenticated fails.
select throws_ok(
  $$insert into audit_log (actor_role, action, target_table, target_id) values ('admin', 'read', 'students', gen_random_uuid())$$,
  '42501',
  null,
  'authenticated cannot insert into audit_log directly — only the RPCs (owned by the migration role) can'
);

-- Coverage gap close (review finding, ADR-0019): audit_log_org_read and
-- audit_log_coordinator_read were verified correct via manual psql probes but had
-- no pgTAP assertions. By this point audit_log holds exactly 5 rows, all keyed to
-- target_student_id = 5e111111...0001 (whose sole enrollment is in class
-- c3111111...0001 / session a3111111...0001).

-- (d): an out-of-scope teacher's roster call creates a 'denied' audit_log row with
-- target_table = 'classes' (target_student_id null) — exercises the classes-target
-- branch of audit_log_coordinator_read (condition b), the less-tested branch.
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_out'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from get_class_roster_for_staff('c3111111-0000-0000-0000-000000000001'::uuid))::int, 0,
  'get_class_roster_for_staff returns nothing for an out-of-class teacher');

select tests.clear_authentication();
select is(
  (select count(*) from audit_log where target_table = 'classes' and target_id = 'c3111111-0000-0000-0000-000000000001' and action = 'denied')::int, 1,
  'exactly one audit_log denied row was created with target_table = classes'
);

-- audit_log now holds exactly 6 rows total, all reachable from session
-- a3111111...0001 — 5 via target_student_id/enrollment (condition a) and 1 via
-- target_table='classes' (condition b).

-- (a): bv_coordinator/admin (audit_log_org_read) sees every row, org-wide, unconditionally.
select tests.create_supabase_user('audit-admin@test.local') as v_admin \gset
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is((select count(*) from audit_log)::int, 6,
  'admin (org scope) sees every audit_log row created so far (audit_log_org_read)');

-- (b): a coordinator scoped to the matching session sees all rows — both the
-- student/enrollment branch (condition a) and the classes-target branch (condition b).
select tests.clear_authentication();
select tests.create_supabase_user('audit-coordinator-in@test.local') as v_coord_in \gset
select tests.authenticate_as(:'v_coord_in'::uuid, 'coordinator', 'session', 'a3111111-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from audit_log)::int, 6,
  'coordinator scoped to the matching session sees all audit_log rows (audit_log_coordinator_read, both branches)');

-- (c): a coordinator scoped to a different, freshly-created session/class not
-- connected to any existing audit_log row sees zero rows — proves the scoping
-- actually excludes, not just includes.
select tests.clear_authentication();
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
  values ('a3111111-0000-0000-0000-000000000099', 'c9999999-0000-0000-0000-000000000001', 'Audit-Session-Unrelated', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band)
  values ('c3111111-0000-0000-0000-000000000099', 'a3111111-0000-0000-0000-000000000099', 'Audit Class Unrelated', 'Grade6');
select tests.create_supabase_user('audit-coordinator-out@test.local') as v_coord_out \gset
select tests.authenticate_as(:'v_coord_out'::uuid, 'coordinator', 'session', 'a3111111-0000-0000-0000-000000000099'::uuid);
select is((select count(*) from audit_log)::int, 0,
  'coordinator scoped to an unrelated session sees zero audit_log rows');

select tests.clear_authentication();
select * from finish();
rollback;

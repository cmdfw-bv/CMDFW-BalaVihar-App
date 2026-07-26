begin;
select plan(21);

insert into centers (id, name) values ('c6500000-0000-0000-0000-000000000001', 'Compliance-RPC Center');
-- Sundays: Jan4, Jan11, Jan18 — window_size=2 keeps the last two (Jan11, Jan18).
insert into sessions (id, center_id, name, start_date, end_date, meeting_weekday) values
  ('a6500000-0000-0000-0000-000000000001', 'c6500000-0000-0000-0000-000000000001', 'Compliance-RPC Session', '2026-01-01', '2026-01-18', 0),
  ('a6500000-0000-0000-0000-000000000002', 'c6500000-0000-0000-0000-000000000001', 'Compliance-RPC Sibling Session', '2026-01-01', '2026-01-18', 0);

insert into classes (id, session_id, name, grade_band) values
  ('cc650000-0000-0000-0000-00000000000a', 'a6500000-0000-0000-0000-000000000001', 'Class A (full compliance)', 'Gr3'),
  ('cc650000-0000-0000-0000-00000000000b', 'a6500000-0000-0000-0000-000000000001', 'Class B (partial + withdrawn)', 'Gr4'),
  ('cc650000-0000-0000-0000-00000000000d', 'a6500000-0000-0000-0000-000000000001', 'Class D (zero-expected-date)', 'Gr5');

select tests.create_supabase_user('compliance-coordinator@test.local') as v_coordinator \gset
select tests.create_supabase_user('compliance-coordinator-sibling@test.local') as v_coordinator_sibling \gset
select tests.create_supabase_user('compliance-teacher@test.local') as v_teacher \gset

-- Generate the calendar for A/B/D before Class E exists (E deliberately gets no rows).
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6500000-0000-0000-0000-000000000001'::uuid);
select generate_class_meetings_for_session('a6500000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();

insert into classes (id, session_id, name, grade_band) values
  ('cc650000-0000-0000-0000-00000000000e', 'a6500000-0000-0000-0000-000000000001', 'Class E (no calendar yet)', 'Gr6');

-- Class A: 2 active students enrolled before the window, full attendance + full updates both dates.
insert into families (id, label) values ('f6500000-0000-0000-0000-00000000000a', 'Family A');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('56500000-0000-0000-0000-00000000000a', 'f6500000-0000-0000-0000-00000000000a', 'A1', 'Student', 'Gr3'),
  ('56500000-0000-0000-0000-00000000000b', 'f6500000-0000-0000-0000-00000000000a', 'A2', 'Student', 'Gr3');
insert into enrollments (id, student_id, class_id, session_id, status, enrolled_at) values
  ('e6500000-0000-0000-0000-00000000000a', '56500000-0000-0000-0000-00000000000a', 'cc650000-0000-0000-0000-00000000000a', 'a6500000-0000-0000-0000-000000000001', 'active', '2026-01-04'),
  ('e6500000-0000-0000-0000-00000000000b', '56500000-0000-0000-0000-00000000000b', 'cc650000-0000-0000-0000-00000000000a', 'a6500000-0000-0000-0000-000000000001', 'active', '2026-01-04');
insert into attendance (enrollment_id, class_meeting_date, status, marked_by) values
  ('e6500000-0000-0000-0000-00000000000a', '2026-01-11', 'present', :'v_teacher'::uuid),
  ('e6500000-0000-0000-0000-00000000000b', '2026-01-11', 'present', :'v_teacher'::uuid),
  ('e6500000-0000-0000-0000-00000000000a', '2026-01-18', 'present', :'v_teacher'::uuid),
  ('e6500000-0000-0000-0000-00000000000b', '2026-01-18', 'absent', :'v_teacher'::uuid);
insert into class_updates (class_id, meeting_date, posted_by) values
  ('cc650000-0000-0000-0000-00000000000a', '2026-01-11', :'v_teacher'::uuid),
  ('cc650000-0000-0000-0000-00000000000a', '2026-01-18', :'v_teacher'::uuid);

-- Class B: one active + one withdrawn student (roster approximation — withdrawn excluded from
-- the ENTIRE window, not just post-withdrawal dates). Attendance submitted for Jan11 only.
insert into families (id, label) values ('f6500000-0000-0000-0000-00000000000b', 'Family B');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('56500000-0000-0000-0000-00000000000c', 'f6500000-0000-0000-0000-00000000000b', 'B1', 'Student', 'Gr4'),
  ('56500000-0000-0000-0000-00000000000d', 'f6500000-0000-0000-0000-00000000000b', 'B2Withdrawn', 'Student', 'Gr4');
insert into enrollments (id, student_id, class_id, session_id, status, enrolled_at) values
  ('e6500000-0000-0000-0000-00000000000c', '56500000-0000-0000-0000-00000000000c', 'cc650000-0000-0000-0000-00000000000b', 'a6500000-0000-0000-0000-000000000001', 'active', '2026-01-04'),
  ('e6500000-0000-0000-0000-00000000000d', '56500000-0000-0000-0000-00000000000d', 'cc650000-0000-0000-0000-00000000000b', 'a6500000-0000-0000-0000-000000000001', 'withdrawn', '2026-01-04');
insert into attendance (enrollment_id, class_meeting_date, status, marked_by) values
  ('e6500000-0000-0000-0000-00000000000c', '2026-01-11', 'present', :'v_teacher'::uuid);
insert into class_updates (class_id, meeting_date, posted_by) values
  ('cc650000-0000-0000-0000-00000000000b', '2026-01-18', :'v_teacher'::uuid);

-- Class D: student enrolls mid-window (Jan15, between Jan11 and Jan18) — Jan11 has zero
-- expected students (excluded from attendance's denominator entirely) but a class_updates
-- row posted on Jan11 anyway still counts toward update_rate (that metric ignores roster).
insert into families (id, label) values ('f6500000-0000-0000-0000-00000000000d', 'Family D');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('56500000-0000-0000-0000-00000000000f', 'f6500000-0000-0000-0000-00000000000d', 'D1', 'Student', 'Gr5');
insert into enrollments (id, student_id, class_id, session_id, status, enrolled_at) values
  ('e6500000-0000-0000-0000-00000000000f', '56500000-0000-0000-0000-00000000000f', 'cc650000-0000-0000-0000-00000000000d', 'a6500000-0000-0000-0000-000000000001', 'active', '2026-01-15');
insert into class_updates (class_id, meeting_date, posted_by) values
  ('cc650000-0000-0000-0000-00000000000d', '2026-01-11', :'v_teacher'::uuid);
-- (no attendance row for D at all — Jan18 has expected_count=1 but zero submitted → attendance_rate 0.0)

-- Class E: one active student, but generate_class_meetings_for_session never ran for it
-- (created after the generation pass) — proves the "new class, no meetings yet" null placeholder.
insert into families (id, label) values ('f6500000-0000-0000-0000-00000000000e', 'Family E');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('56500000-0000-0000-0000-0000000000e1', 'f6500000-0000-0000-0000-00000000000e', 'E1', 'Student', 'Gr6');
insert into enrollments (student_id, class_id, session_id, status, enrolled_at) values
  ('56500000-0000-0000-0000-0000000000e1', 'cc650000-0000-0000-0000-00000000000e', 'a6500000-0000-0000-0000-000000000001', 'active', '2026-01-04');
-- (deliberately: no generate_class_meetings_for_session call after this insert — Class E must
-- end up with zero class_meetings rows, proving the "new class, no meetings yet" null placeholder)

-- Class F: a meeting scheduled for *today* (current_date) — the only meeting this class has.
-- current_date's own meeting must not enter the trailing window before it happens (the day
-- rolls over server-side before any teacher could plausibly have submitted for it yet).
insert into classes (id, session_id, name, grade_band) values
  ('cc650000-0000-0000-0000-00000000000f', 'a6500000-0000-0000-0000-000000000001', 'Class F (todays meeting)', 'Gr3');
insert into class_meetings (class_id, meeting_date, status) values
  ('cc650000-0000-0000-0000-00000000000f', current_date, 'scheduled');
insert into families (id, label) values ('f6500000-0000-0000-0000-0000000000f1', 'Family F');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('56500000-0000-0000-0000-0000000000f1', 'f6500000-0000-0000-0000-0000000000f1', 'F1', 'Student', 'Gr3');
insert into enrollments (student_id, class_id, session_id, status, enrolled_at) values
  ('56500000-0000-0000-0000-0000000000f1', 'cc650000-0000-0000-0000-00000000000f', 'a6500000-0000-0000-0000-000000000001', 'active', current_date - interval '30 days');

-- Class G: single student enrolled mid-day UTC on the same calendar day as the meeting date —
-- exercises the timestamptz-vs-date comparison independent of any wall-clock "today" behavior.
-- Attendance is submitted for that same date, so a *correct*, deterministic day-level comparison
-- must count the student as expected and the attendance as submitted (100.0), not exclude them.
insert into classes (id, session_id, name, grade_band) values
  ('cc650000-0000-0000-0000-000000000010', 'a6500000-0000-0000-0000-000000000001', 'Class G (same-day enrollment)', 'Gr3');
insert into class_meetings (class_id, meeting_date, status) values
  ('cc650000-0000-0000-0000-000000000010', '2026-01-11', 'scheduled');
insert into families (id, label) values ('f6500000-0000-0000-0000-000000000010', 'Family G');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('56500000-0000-0000-0000-000000000010', 'f6500000-0000-0000-0000-000000000010', 'G1', 'Student', 'Gr3');
insert into enrollments (id, student_id, class_id, session_id, status, enrolled_at) values
  ('e6500000-0000-0000-0000-000000000010', '56500000-0000-0000-0000-000000000010', 'cc650000-0000-0000-0000-000000000010', 'a6500000-0000-0000-0000-000000000001', 'active', '2026-01-11 23:00:00+00');
insert into attendance (enrollment_id, class_meeting_date, status, marked_by) values
  ('e6500000-0000-0000-0000-000000000010', '2026-01-11', 'present', :'v_teacher'::uuid);

-- Positive case: Coordinator's own-session call.
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6500000-0000-0000-0000-000000000001'::uuid);

-- Materialize a single RPC call (matching the real client's one-call-per-focus usage, AC8) —
-- asserting against these cached rows instead of re-invoking the RPC per assertion so the
-- "exactly one audit_log row per successful call" check below reflects one real call.
create temporary table t_compliance as
select * from get_session_compliance_for_staff('a6500000-0000-0000-0000-000000000001'::uuid, 2);

select is(
  (select attendance_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000a'),
  100.0, 'Class A attendance_rate = 100.0 (both students, both dates, fully submitted)');
select is(
  (select update_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000a'),
  100.0, 'Class A update_rate = 100.0');

select is(
  (select attendance_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000b'),
  50.0, 'Class B attendance_rate = 50.0 (withdrawn student excluded from the whole window, only Jan11 submitted)');
select is(
  (select enrolled_count from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000b'),
  1, 'Class B enrolled_count = 1 (withdrawn student not counted as currently enrolled)');

select is(
  (select attendance_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000d'),
  0.0, 'Class D attendance_rate = 0.0 (Jan11 excluded from denominator — zero expected — Jan18 expected but not submitted)');
select is(
  (select update_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000d'),
  50.0, 'Class D update_rate = 50.0 (Jan11''s update still counts toward update_rate despite zero expected roster that date)');

select is(
  (select attendance_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000e'),
  null, 'Class E attendance_rate = null (no class_meetings rows yet — honest placeholder, never 0)');
select is(
  (select update_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000e'),
  null, 'Class E update_rate = null');

select is(
  (select attendance_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-00000000000f'),
  null, 'Class F: todays scheduled meeting must not enter the window before it can be marked (current_date boundary bug)');

select is(
  (select attendance_rate from t_compliance where class_id = 'cc650000-0000-0000-0000-000000000010'),
  100.0, 'Class G: same-day enrollment at a different UTC time-of-day must still count as expected (timestamptz-vs-date boundary bug)');

select is(
  (select count(*) from audit_log where actor_role = 'coordinator' and action = 'read' and target_table = 'attendance' and target_id = 'a6500000-0000-0000-0000-000000000001')::int,
  1, 'exactly one audit_log read row per successful call (never per-student — AC8, no student-identifying data returned)');

select tests.clear_authentication();

-- Cross-scope: sibling-session coordinator gets nothing + one denied audit_log row.
select tests.authenticate_as(:'v_coordinator_sibling'::uuid, 'coordinator', 'session', 'a6500000-0000-0000-0000-000000000002'::uuid);
select is(
  (select count(*) from get_session_compliance_for_staff('a6500000-0000-0000-0000-000000000001'::uuid, 2))::int,
  0, 'sibling-session coordinator gets zero rows');
select tests.clear_authentication();
select is(
  (select count(*) from audit_log where actor_role = 'coordinator' and action = 'denied' and target_table = 'sessions' and target_id = 'a6500000-0000-0000-0000-000000000001')::int,
  1, 'the cross-scope call writes exactly one denied audit_log row');

-- Cross-role: a wrong-*role* caller must be denied even when authenticated within the target
-- session's own scope — the RPC's `elsif v_role = 'coordinator'` branch must not silently let
-- teacher/parent/student calls fall through as authorized (constitution §11.3, non-negotiable #4).
select tests.create_supabase_user('compliance-parent@test.local') as v_parent \gset
select tests.create_supabase_user('compliance-student@test.local') as v_student \gset

select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'cc650000-0000-0000-0000-00000000000a'::uuid);
select is(
  (select count(*) from get_session_compliance_for_staff('a6500000-0000-0000-0000-000000000001'::uuid, 2))::int,
  0, 'teacher (wrong role, in-scope class) gets zero rows from get_session_compliance_for_staff');
select tests.clear_authentication();
select is(
  (select count(*) from audit_log where actor_role = 'teacher' and action = 'denied' and target_table = 'sessions' and target_id = 'a6500000-0000-0000-0000-000000000001')::int,
  1, 'teacher''s denied call writes one denied audit_log row');

select tests.authenticate_as(:'v_parent'::uuid, 'parent');
select is(
  (select count(*) from get_session_compliance_for_staff('a6500000-0000-0000-0000-000000000001'::uuid, 2))::int,
  0, 'parent gets zero rows from get_session_compliance_for_staff');
select tests.clear_authentication();
select is(
  (select count(*) from audit_log where actor_role = 'parent' and action = 'denied' and target_table = 'sessions' and target_id = 'a6500000-0000-0000-0000-000000000001')::int,
  1, 'parent''s denied call writes one denied audit_log row');

select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(
  (select count(*) from get_session_compliance_for_staff('a6500000-0000-0000-0000-000000000001'::uuid, 2))::int,
  0, 'student gets zero rows from get_session_compliance_for_staff');
select tests.clear_authentication();
select is(
  (select count(*) from audit_log where actor_role = 'student' and action = 'denied' and target_table = 'sessions' and target_id = 'a6500000-0000-0000-0000-000000000001')::int,
  1, 'student''s denied call writes one denied audit_log row');

-- anon: no execute grant at all (RPC revokes from public, grants only to authenticated).
select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select throws_ok(
  $t$ select * from get_session_compliance_for_staff('a6500000-0000-0000-0000-000000000001'::uuid, 2) $t$,
  '42501',
  null,
  'anon role is denied execute on get_session_compliance_for_staff (no grant to anon)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- audit_log_coordinator_read branch (c): sibling-session coordinator must not see Session A's
-- own-session audit rows (the 'read' row from the positive-case RPC call above) via direct
-- SELECT on audit_log, even though both rows share target_table='attendance'/'sessions'.
select tests.authenticate_as(:'v_coordinator_sibling'::uuid, 'coordinator', 'session', 'a6500000-0000-0000-0000-000000000002'::uuid);
select is(
  (select count(*) from audit_log where target_table = 'attendance' and target_id = 'a6500000-0000-0000-0000-000000000001')::int,
  0, 'sibling-session coordinator cannot read Session A''s compliance audit_log rows directly (branch c isolation)');
select tests.clear_authentication();

select * from finish();
rollback;

begin;
select plan(7);

insert into families (id, label) values ('ff111111-0000-0000-0000-000000000001', 'Write RPC Family');
select tests.create_supabase_user('write-rpc-teacher-in@test.local') as v_teacher_in \gset
select tests.create_supabase_user('write-rpc-teacher-out@test.local') as v_teacher_out \gset

insert into students (id, family_id, first_name, last_name, grade_level) values
  ('5f111111-0000-0000-0000-000000000001', 'ff111111-0000-0000-0000-000000000001', 'Wrt', 'Rpc', 'Grade5');

insert into centers (id, name) values ('cf111111-0000-0000-0000-000000000001', 'Write RPC Center');
insert into sessions (id, center_id, name, start_date, end_date, meeting_weekday)
  values ('af111111-0000-0000-0000-000000000001', 'cf111111-0000-0000-0000-000000000001', 'Write-RPC-Session', '2026-01-01', '2026-06-01', 0);
insert into classes (id, session_id, name, grade_band)
  values ('cf222222-0000-0000-0000-000000000001', 'af111111-0000-0000-0000-000000000001', 'Write RPC Class', 'Grade5');
insert into enrollments (id, student_id, class_id, session_id, status)
  values ('ef111111-0000-0000-0000-000000000001', '5f111111-0000-0000-0000-000000000001', 'cf222222-0000-0000-0000-000000000001', 'af111111-0000-0000-0000-000000000001', 'active');

-- Lock-down check: Teacher direct insert/update on attendance must no longer work at all.
select tests.authenticate_as(:'v_teacher_in'::uuid, 'teacher', 'class', 'cf222222-0000-0000-0000-000000000001'::uuid);
select throws_ok(
  $$insert into attendance (enrollment_id, class_meeting_date, status) values ('ef111111-0000-0000-0000-000000000001', '2026-02-03', 'present')$$,
  '42501',
  null,
  'direct insert on attendance is now locked down for teacher (grant revoked)'
);

-- RPC insert branch: new date, no existing row.
select ok(
  (select status from mark_attendance_for_staff('ef111111-0000-0000-0000-000000000001'::uuid, '2026-02-03'::date, 'present')) = 'present',
  'mark_attendance_for_staff creates a new attendance row (insert branch)'
);

-- Verify table state as the superuser — Teacher has no SELECT policy on attendance by design,
-- so checking row-count while still authenticated as teacher would trivially read 0 regardless.
select tests.clear_authentication();
select is((select count(*) from attendance where enrollment_id = 'ef111111-0000-0000-0000-000000000001')::int, 1,
  'exactly one attendance row exists after the insert-branch call');

-- RPC update branch: same date, correction.
select tests.authenticate_as(:'v_teacher_in'::uuid, 'teacher', 'class', 'cf222222-0000-0000-0000-000000000001'::uuid);
select ok(
  (select status from mark_attendance_for_staff('ef111111-0000-0000-0000-000000000001'::uuid, '2026-02-03'::date, 'absent')) = 'absent',
  'mark_attendance_for_staff corrects the same date (update/upsert branch)'
);

select tests.clear_authentication();
select is((select count(*) from attendance where enrollment_id = 'ef111111-0000-0000-0000-000000000001')::int, 1,
  'still exactly one row after the correction (upsert, not a duplicate)');

-- No audit_log row for a successful in-scope call (per ADR-0021: marked_by attribution is enough).
select is(
  (select count(*) from audit_log where target_table = 'attendance' and target_id = 'ef111111-0000-0000-0000-000000000001' and action = 'read')::int, 0,
  'no audit_log row is created by a successful mark_attendance_for_staff call'
);

-- Denied case: out-of-class teacher gets no row + a denied audit_log entry.
select tests.authenticate_as(:'v_teacher_out'::uuid, 'teacher', 'class', gen_random_uuid());
select ok(
  (select mark_attendance_for_staff('ef111111-0000-0000-0000-000000000001'::uuid, '2026-02-10'::date, 'present')) is null,
  'out-of-class teacher gets no row from mark_attendance_for_staff'
);

select tests.clear_authentication();
select * from finish();
rollback;

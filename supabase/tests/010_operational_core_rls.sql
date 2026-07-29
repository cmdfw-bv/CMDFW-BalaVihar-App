begin;
select plan(16);

-- Fixture: 2 centers so cross-scope leakage has somewhere real to leak from.
insert into centers (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Center A'),
  ('22222222-2222-2222-2222-222222222222', 'Center B');

insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A-Session-1', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('a1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A-Session-2', '2026-01-01', '2026-06-01', 0, '12:00', '13:30'),
  ('b2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B-Session-1', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');

insert into classes (id, session_id, name, grade_band) values
  ('c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'A1 Grade3', 'Grade3'),
  ('c1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000002', 'A2 Grade5', 'Grade5'),
  ('c2222222-0000-0000-0000-000000000001', 'b2222222-0000-0000-0000-000000000001', 'B1 Grade3', 'Grade3');

insert into families (id, label) values
  ('fa111111-0000-0000-0000-000000000001', 'Family Alpha'),
  ('fa222222-0000-0000-0000-000000000002', 'Family Beta');

select tests.create_supabase_user('parent-alpha@test.local') as v_parent_alpha \gset
select tests.create_supabase_user('parent-beta@test.local') as v_parent_beta \gset
select tests.create_supabase_user('student-alpha@test.local') as v_student_alpha \gset
select tests.create_supabase_user('teacher-a1@test.local') as v_teacher_a1 \gset
select tests.create_supabase_user('coordinator-a@test.local') as v_coordinator_a \gset
select tests.create_supabase_user('admin-1@test.local') as v_admin \gset

insert into family_members (family_id, user_id, relationship) values
  ('fa111111-0000-0000-0000-000000000001', :'v_parent_alpha'::uuid, 'guardian'),
  ('fa222222-0000-0000-0000-000000000002', :'v_parent_beta'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('5d111111-0000-0000-0000-000000000001', 'fa111111-0000-0000-0000-000000000001', 'Alpha', 'One', 'Grade3', :'v_student_alpha'::uuid),
  ('5d222222-0000-0000-0000-000000000002', 'fa222222-0000-0000-0000-000000000002', 'Beta', 'Two', 'Grade3', null);

insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e0111111-0000-0000-0000-000000000001', '5d111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', 'active'),
  ('e0222222-0000-0000-0000-000000000002', '5d222222-0000-0000-0000-000000000002', 'c2222222-0000-0000-0000-000000000001', 'b2222222-0000-0000-0000-000000000001', 'active');

-- Positive: Parent sees own child's class/session/center; not the sibling center's.
select tests.authenticate_as(:'v_parent_alpha'::uuid, 'parent');
select results_eq(
  $$select id from classes order by id$$,
  $$values ('c1111111-0000-0000-0000-000000000001'::uuid)$$,
  'parent sees only their own child''s class'
);
select is(
  (select count(*) from centers)::int, 1,
  'parent sees exactly one center (their own child''s), not the sibling center'
);
select is(
  (select count(*) from families)::int, 1,
  'parent sees exactly their own family (resolved deferred mechanic #1)'
);
select is(
  (select count(*) from family_members)::int, 1,
  'parent sees exactly their own family_members row'
);

-- Positive: Student sees own class only.
select tests.clear_authentication();
select tests.authenticate_as(:'v_student_alpha'::uuid, 'student');
select is(
  (select count(*) from classes)::int, 1,
  'student sees exactly their own class'
);

-- Positive: Teacher (class scope) sees own class, not the sibling class in the same session.
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_a1'::uuid, 'teacher', 'class', 'c1111111-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from classes)::int, 1,
  'teacher sees exactly their own class'
);
select is(
  (select count(*) from enrollments)::int, 1,
  'teacher sees only enrollments in their own class (join-path check)'
);
select is(
  (select count(*) from sessions)::int, 1,
  'teacher sees exactly their own class''s session, via classes.session_id (date-nav clamp bound)'
);
select ok(
  not exists (select 1 from sessions where id = 'a1111111-0000-0000-0000-000000000002'::uuid),
  'teacher does not see the sibling session, even though it shares the same center'
);

-- Positive: Coordinator (session scope) sees both classes in their session, not the sibling session's.
select tests.clear_authentication();
select tests.authenticate_as(:'v_coordinator_a'::uuid, 'coordinator', 'session', 'a1111111-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from classes)::int, 1,
  'coordinator sees only classes in their own session (A-Session-1 has 1 class)'
);
select ok(
  not exists (select 1 from sessions where id = 'a1111111-0000-0000-0000-000000000002'::uuid),
  'coordinator does not see a sibling session in the same center'
);

-- Positive: BV Coordinator/Admin see org-wide.
select tests.clear_authentication();
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is(
  (select count(*) from centers where id in (
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'
  ))::int, 2,
  'admin sees both fixture centers, org scope unrestricted (scoped by id: seed.sql also persists centers across db reset)'
);
select is(
  (select count(*) from classes where id in (
    'c1111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000002', 'c2222222-0000-0000-0000-000000000001'
  ))::int, 3,
  'admin sees all 3 fixture classes, org scope unrestricted (scoped by id: seed.sql also persists classes across db reset)'
);

-- Negative: cross-family parent leakage, including via the enrollment/student join path.
select tests.clear_authentication();
select tests.authenticate_as(:'v_parent_alpha'::uuid, 'parent');
select is(
  (select count(*) from students)::int, 1,
  'parent cannot see the other family''s student, even via the students table directly'
);

-- Negative: Teacher cannot see the sibling center's class via any join.
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_a1'::uuid, 'teacher', 'class', 'c1111111-0000-0000-0000-000000000001'::uuid);
select ok(
  not exists (select 1 from classes where id = 'c2222222-0000-0000-0000-000000000001'::uuid),
  'teacher cannot see Center B''s class'
);

-- Enrollment uniqueness: a second ACTIVE enrollment for the same student+session fails.
select tests.clear_authentication();
select throws_ok(
  $$insert into enrollments (student_id, class_id, session_id, status)
    values ('5d111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000001', 'active')$$,
  '23505',
  null,
  'a second active enrollment for the same student in the same session is rejected'
);

select tests.clear_authentication();
select * from finish();
rollback;

-- Adversarial RLS audit for csv-import migrations (ADR-0022)
-- Tests: cross-family email_hash leak, anon access, teacher/coordinator over-reach,
--        service_role grant bleed-through to authenticated, bv_coordinator write guard.
begin;
select plan(16);

-- ── Fixture ──────────────────────────────────────────────────────────────────
insert into centers (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Adv Center A'),
  ('b0000000-0000-0000-0000-000000000002', 'Adv Center B');

insert into sessions (id, center_id, name, start_date, end_date, meeting_weekday) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Adv Sess A', '2026-01-01', '2026-06-01', 0),
  ('b1000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 'Adv Sess B', '2026-01-01', '2026-06-01', 0);

insert into classes (id, session_id, name, grade_band) values
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'Adv Class A', 'Grade3'),
  ('c2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'Adv Class B', 'Grade5');

-- Two families — each with a distinct, non-null guardian email hash
insert into families (id, label, primary_guardian_email_hash) values
  ('f1000000-0000-0000-0000-000000000001', 'Adv Family Alpha', 'hash_alpha_sha256'),
  ('f2000000-0000-0000-0000-000000000002', 'Adv Family Beta',  'hash_beta_sha256');

select tests.create_supabase_user('adv-parent-alpha@test.local') as v_parent_alpha \gset
select tests.create_supabase_user('adv-parent-beta@test.local')  as v_parent_beta  \gset
select tests.create_supabase_user('adv-student-alpha@test.local') as v_student_alpha \gset
select tests.create_supabase_user('adv-teacher-a@test.local')    as v_teacher_a    \gset
select tests.create_supabase_user('adv-coord-a@test.local')      as v_coord_a      \gset
select tests.create_supabase_user('adv-bvc@test.local')          as v_bvc          \gset

insert into family_members (family_id, user_id, relationship) values
  ('f1000000-0000-0000-0000-000000000001', :'v_parent_alpha'::uuid, 'guardian'),
  ('f2000000-0000-0000-0000-000000000002', :'v_parent_beta'::uuid,  'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id, external_member_id) values
  ('e1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'AdvAlpha', 'Kid', 'Grade3', :'v_student_alpha'::uuid, 'ADV-EXT-001'),
  ('e2000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002', 'AdvBeta',  'Kid', 'Grade5', null, 'ADV-EXT-002');

insert into enrollments (id, student_id, class_id, session_id, status) values
  ('d1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'active'),
  ('d2000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'active');

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 1: anon cannot SELECT students/families/enrollments (no SELECT grant)
-- Expected: 42501 permission denied at table-privilege level (harder than RLS)
-- ══════════════════════════════════════════════════════════════════════════════
set local role anon;
set local "request.jwt.claims" to '{}';

select throws_ok(
  $$ select count(*) from students $$,
  '42501', null,
  'ATTACK 1 DENY: anon gets permission denied on students (no SELECT grant)'
);

select throws_ok(
  $$ select count(*) from families $$,
  '42501', null,
  'ATTACK 1b DENY: anon gets permission denied on families (no SELECT grant)'
);

select throws_ok(
  $$ select count(*) from enrollments $$,
  '42501', null,
  'ATTACK 1c DENY: anon gets permission denied on enrollments (no SELECT grant)'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 2: Parent Alpha cannot read Family Beta's primary_guardian_email_hash
-- ══════════════════════════════════════════════════════════════════════════════
reset role;
select tests.clear_authentication();
select tests.authenticate_as(:'v_parent_alpha'::uuid, 'parent');

select is(
  (select primary_guardian_email_hash from families where id = 'f2000000-0000-0000-0000-000000000002'),
  null,
  'ATTACK 2 DENY: parent cannot read another family''s email_hash (row invisible via RLS)'
);

select is(
  (select count(*) from families where id = 'f2000000-0000-0000-0000-000000000002')::int, 0,
  'ATTACK 2b DENY: parent cannot see Family Beta row at all'
);

-- Regression: parent CAN read own family's email hash
select is(
  (select primary_guardian_email_hash from families where id = 'f1000000-0000-0000-0000-000000000001'),
  'hash_alpha_sha256',
  'ATTACK 2 regression: parent reads own family email_hash correctly (own-family policy intact)'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 3: Parent Alpha cannot read another family's student
-- ══════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*) from students where id = 'e2000000-0000-0000-0000-000000000002')::int, 0,
  'ATTACK 3 DENY: parent cannot read another family''s student'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 4: Teacher (class A scope) cannot read families or students (ADR-0019)
-- ══════════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'c1000000-0000-0000-0000-000000000001'::uuid);

select is(
  (select count(*) from families where id in (
    'f1000000-0000-0000-0000-000000000001',
    'f2000000-0000-0000-0000-000000000002'
  ))::int, 0,
  'ATTACK 4 DENY: teacher cannot read any family row (no teacher policy on families)'
);

select is(
  (select count(*) from students where id in (
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000002'
  ))::int, 0,
  'ATTACK 4b DENY: teacher cannot read students table directly (ADR-0019)'
);

-- teacher email_hash column specifically
select is(
  (select primary_guardian_email_hash from families where id = 'f1000000-0000-0000-0000-000000000001'),
  null,
  'ATTACK 4c DENY: teacher cannot read primary_guardian_email_hash (row blocked by RLS)'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 5: Teacher (class A) cannot see class B enrollments
-- ══════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*) from enrollments where id = 'd2000000-0000-0000-0000-000000000002')::int, 0,
  'ATTACK 5 DENY: teacher cannot read enrollments outside their assigned class'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 6: Coordinator (session A) cannot read session B enrollments or families
-- ══════════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as(:'v_coord_a'::uuid, 'coordinator', 'session', 'a1000000-0000-0000-0000-000000000001'::uuid);

select is(
  (select count(*) from enrollments where session_id = 'b1000000-0000-0000-0000-000000000002')::int, 0,
  'ATTACK 6 DENY: coordinator cannot read another session''s enrollments'
);

select is(
  (select count(*) from families)::int, 0,
  'ATTACK 6b DENY: coordinator has no families policy (zero rows)'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 7: authenticated cannot INSERT into user_roles (service_role SELECT grant
--           must not unlock INSERT for authenticated)
-- ══════════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as(:'v_parent_alpha'::uuid, 'parent');

select throws_ok(
  $$ insert into user_roles (user_id, role, scope_type, scope_id)
     values (gen_random_uuid(), 'admin', 'org', null) $$,
  '42501', null,
  'ATTACK 7 DENY: authenticated parent cannot INSERT into user_roles despite service_role SELECT grant'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 8: authenticated cannot SELECT user_roles (RLS default-deny, no client policy)
-- ══════════════════════════════════════════════════════════════════════════════
select is(
  (select count(*) from user_roles)::int, 0,
  'ATTACK 8 DENY: authenticated parent gets zero rows from user_roles (RLS default-deny)'
);

-- ══════════════════════════════════════════════════════════════════════════════
-- ATTACK 9: bv_coordinator cannot INSERT into families (no write policy for any client role)
-- ══════════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as(:'v_bvc'::uuid, 'bv_coordinator', 'org', null);

select throws_ok(
  $$ insert into families (label, primary_guardian_email_hash)
     values ('BVC Injected Family', 'injected_hash') $$,
  '42501', null,
  'ATTACK 9 DENY: bv_coordinator cannot INSERT into families (no write RLS policy)'
);

select tests.clear_authentication();
select * from finish();
rollback;

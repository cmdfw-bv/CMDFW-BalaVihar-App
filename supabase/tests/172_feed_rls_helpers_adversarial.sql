-- Adversarial suite for #105's SECURITY DEFINER membership helpers and the Decision 5 boundary
-- (PR #117 red-team pass, run against 170/171's already-passing suites).
--
-- WHY THIS FILE EXISTS. #117 moved the access predicate for 29 policies out of inline
-- `exists (...)` and into 13 new SECURITY DEFINER helpers. Two things were then true and
-- untested:
--
--   1. ADR-2026-09-19 Decision 5 draws a line: *conversational* surfaces revoke on withdrawal,
--      *reference/historical* ones do not ("a parent keeps their child's attendance history and
--      class record"). #117 encodes that line as a choice of helper per policy —
--      is_active_guardian_of_class for conversational, is_guardian_of_class for reference.
--      A single wrong variant silently cuts a withdrawn family off from their own child's
--      records. Proven invisible: swapping classes_parent_select/classes_student_select to the
--      is_active_* variants left the whole suite green at 406/406. GROUP 1 closes that.
--
--   2. The helpers are SECURITY DEFINER and `grant execute to authenticated`, which makes them
--      directly-callable RPCs through PostgREST, not merely internal policy helpers. That is
--      exactly the hazard issue #52 found in is_parent_of_class and issue #73 found for a NULL
--      scope_id claim. 13 of the 15 helpers had no test of any kind. GROUPS 2-4 close that.
--
-- Fixtures are self-contained (ce888888-prefixed) and build the withdrawn state by UPDATE, not
-- by inserting status='withdrawn' — a transition, so nothing passes vacuously.
begin;
select plan(39);

-- ---------------------------------------------------------------------------------------------
-- Fixtures: one center, one session, two classes. Family P has exactly ONE enrollment (Class A)
-- so withdrawing it empties their conversational access outright; Family Q sits in Class B and
-- exists only to be the "other family" for the oracle probes.
-- ---------------------------------------------------------------------------------------------
insert into centers (id, name) values ('ce888888-0000-0000-0000-000000000001', 'Helper Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('ce888888-0000-0000-0000-000000000011', 'ce888888-0000-0000-0000-000000000001', 'Helper Session', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('ce888888-0000-0000-0000-000000000021', 'ce888888-0000-0000-0000-000000000011', 'Helper Class A', 'HS9-12'),
  ('ce888888-0000-0000-0000-000000000022', 'ce888888-0000-0000-0000-000000000011', 'Helper Class B', 'HS9-12');

insert into families (id, label) values
  ('ce888888-0000-0000-0000-000000000031', 'Helper Family P'),
  ('ce888888-0000-0000-0000-000000000032', 'Helper Family Q');

select tests.create_supabase_user('helper-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('helper-parent-p@test.local')  as v_parent_p  \gset
select tests.create_supabase_user('helper-student-p@test.local') as v_student_p \gset
select tests.create_supabase_user('helper-parent-q@test.local')  as v_parent_q  \gset
select tests.create_supabase_user('helper-student-q@test.local') as v_student_q \gset

insert into family_members (family_id, user_id, relationship) values
  ('ce888888-0000-0000-0000-000000000031', :'v_parent_p'::uuid, 'guardian'),
  ('ce888888-0000-0000-0000-000000000032', :'v_parent_q'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('ce888888-0000-0000-0000-000000000041', 'ce888888-0000-0000-0000-000000000031', 'Pat', 'P', 'HS9', :'v_student_p'::uuid),
  ('ce888888-0000-0000-0000-000000000042', 'ce888888-0000-0000-0000-000000000032', 'Quin', 'Q', 'HS9', :'v_student_q'::uuid);

-- Both start ACTIVE. Family P's withdrawal happens later, by UPDATE (GROUP 1b).
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('ce888888-0000-0000-0000-000000000051', 'ce888888-0000-0000-0000-000000000041', 'ce888888-0000-0000-0000-000000000021', 'ce888888-0000-0000-0000-000000000011', 'active'),
  ('ce888888-0000-0000-0000-000000000052', 'ce888888-0000-0000-0000-000000000042', 'ce888888-0000-0000-0000-000000000022', 'ce888888-0000-0000-0000-000000000011', 'active');

insert into attendance (enrollment_id, class_meeting_date, status, marked_by) values
  ('ce888888-0000-0000-0000-000000000051', '2026-01-11', 'present', :'v_teacher_a'::uuid),
  ('ce888888-0000-0000-0000-000000000051', '2026-01-18', 'absent',  :'v_teacher_a'::uuid);

insert into class_updates (id, class_id, posted_by, body, homework, meeting_date) values
  ('ce888888-0000-0000-0000-000000000061', 'ce888888-0000-0000-0000-000000000021', :'v_teacher_a'::uuid, 'Helper Class A update', null, '2026-01-11');

insert into comments (id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id) values
  ('ce888888-0000-0000-0000-000000000071', 'ce888888-0000-0000-0000-000000000061', :'v_teacher_a'::uuid, 'teacher', 'Public note', false, null),
  ('ce888888-0000-0000-0000-000000000072', 'ce888888-0000-0000-0000-000000000061', :'v_teacher_a'::uuid, 'teacher', 'Private to P', true, :'v_parent_p'::uuid);

-- =============================================================================================
-- ATTACK GROUP 1 (ADR-2026-09-19 Decision 5): the reference/conversational boundary.
-- This is the group that fails if a policy is wired to the wrong helper variant. 1a establishes
-- the pre-state so 1b cannot pass vacuously; 1c is the half nothing currently covers.
-- =============================================================================================

-- --- 1a: pre-withdrawal CONTROL. Everything visible. -----------------------------------------
select tests.authenticate_as(:'v_parent_p'::uuid, 'parent', 'family', 'ce888888-0000-0000-0000-000000000031'::uuid);
select is((select count(*) from class_updates where class_id = 'ce888888-0000-0000-0000-000000000021'), 1::bigint,
  'CONTROL 1a: active Parent P sees Class A''s update (pre-withdrawal state is real)');
select is((select count(*) from comments where id = 'ce888888-0000-0000-0000-000000000071'), 1::bigint,
  'CONTROL 1a: active Parent P sees the public comment');
select is((select count(*) from comments where id = 'ce888888-0000-0000-0000-000000000072'), 1::bigint,
  'CONTROL 1a: active Parent P sees their own private thread');
select is((select count(*) from classes where id = 'ce888888-0000-0000-0000-000000000021'), 1::bigint,
  'CONTROL 1a: active Parent P sees the class record');
select is((select count(*) from attendance where enrollment_id = 'ce888888-0000-0000-0000-000000000051'), 2::bigint,
  'CONTROL 1a: active Parent P sees both attendance rows');
select tests.clear_authentication();

-- --- 1b: withdraw BY UPDATE, then conversational access must be gone. ------------------------
update enrollments set status = 'withdrawn' where id = 'ce888888-0000-0000-0000-000000000051';

select tests.authenticate_as(:'v_parent_p'::uuid, 'parent', 'family', 'ce888888-0000-0000-0000-000000000031'::uuid);
select is((select count(*) from class_updates where class_id = 'ce888888-0000-0000-0000-000000000021'), 0::bigint,
  'ATTACK 1b DENY: withdrawn Parent P cannot read the class update (Decision 1a)');
select is((select count(*) from comments where id = 'ce888888-0000-0000-0000-000000000071'), 0::bigint,
  'ATTACK 1b DENY: withdrawn Parent P cannot read the public comment (Decision 1a)');
select is((select count(*) from comments where id = 'ce888888-0000-0000-0000-000000000072'), 0::bigint,
  'ATTACK 1b DENY: withdrawn Parent P cannot read their OWN private thread (Decision 1b -- the identity-derived policy must still carry a status filter)');
select tests.clear_authentication();

select tests.authenticate_as(:'v_student_p'::uuid, 'student', 'self', :'v_student_p'::uuid);
select is((select count(*) from class_updates where class_id = 'ce888888-0000-0000-0000-000000000021'), 0::bigint,
  'ATTACK 1b DENY: withdrawn Student P cannot read the class update');
select is((select count(*) from comments where id = 'ce888888-0000-0000-0000-000000000071'), 0::bigint,
  'ATTACK 1b DENY: withdrawn Student P cannot read the public comment');
select tests.clear_authentication();

-- --- 1c: the half with NO existing coverage. Reference data must SURVIVE withdrawal. ---------
-- These five assertions are what go red if any reference policy is wired to an is_active_*
-- helper. Decision 5 verbatim: "A parent keeps their child's attendance history and class
-- record." A green suite that omits these cannot tell that promise was broken.
select tests.authenticate_as(:'v_parent_p'::uuid, 'parent', 'family', 'ce888888-0000-0000-0000-000000000031'::uuid);
select is((select count(*) from classes where id = 'ce888888-0000-0000-0000-000000000021'), 1::bigint,
  'ATTACK 1c ALLOW: withdrawn Parent P STILL reads the class record (Decision 5 -- classes_parent_select must use the status-agnostic helper)');
select is((select count(*) from sessions where id = 'ce888888-0000-0000-0000-000000000011'), 1::bigint,
  'ATTACK 1c ALLOW: withdrawn Parent P STILL reads the session (Decision 5)');
select is((select count(*) from centers where id = 'ce888888-0000-0000-0000-000000000001'), 1::bigint,
  'ATTACK 1c ALLOW: withdrawn Parent P STILL reads the center (Decision 5)');
-- attendance_* and students_* are NOT redefined by #117, so these two cannot be broken by its
-- helper wiring. They are here because Decision 5's promise is end-to-end: the feed and
-- attendance screens embed classes -> sessions -> centers, so a reference-table regression
-- cascades into attendance even though the attendance policy itself is untouched. Cheap, and
-- they pin the promise rather than the implementation.
select is((select count(*) from attendance where enrollment_id = 'ce888888-0000-0000-0000-000000000051'), 2::bigint,
  'ATTACK 1c ALLOW: withdrawn Parent P STILL reads their child''s attendance history (Decision 5 -- the promise the ADR makes explicitly)');
select is((select count(*) from students where id = 'ce888888-0000-0000-0000-000000000041'), 1::bigint,
  'ATTACK 1c ALLOW: withdrawn Parent P STILL reads their own child''s record (Decision 5)');
select tests.clear_authentication();

select tests.authenticate_as(:'v_student_p'::uuid, 'student', 'self', :'v_student_p'::uuid);
select is((select count(*) from classes where id = 'ce888888-0000-0000-0000-000000000021'), 1::bigint,
  'ATTACK 1c ALLOW: withdrawn Student P STILL reads the class record (Decision 5 -- classes_student_select must use the status-agnostic helper)');
select is((select count(*) from sessions where id = 'ce888888-0000-0000-0000-000000000011'), 1::bigint,
  'ATTACK 1c ALLOW: withdrawn Student P STILL reads the session (Decision 5)');
select is((select count(*) from centers where id = 'ce888888-0000-0000-0000-000000000001'), 1::bigint,
  'ATTACK 1c ALLOW: withdrawn Student P STILL reads the center (Decision 5)');
select tests.clear_authentication();

-- --- 1d: re-enrolment restores conversational access, with no timestamp involved. ------------
update enrollments set status = 'active' where id = 'ce888888-0000-0000-0000-000000000051';
select tests.authenticate_as(:'v_parent_p'::uuid, 'parent', 'family', 'ce888888-0000-0000-0000-000000000031'::uuid);
select is((select count(*) from class_updates where class_id = 'ce888888-0000-0000-0000-000000000021'), 1::bigint,
  'ATTACK 1d ALLOW: re-enrolment restores the feed immediately (no withdrawn_at to un-stamp)');
select tests.clear_authentication();
update enrollments set status = 'withdrawn' where id = 'ce888888-0000-0000-0000-000000000051';

-- =============================================================================================
-- ATTACK GROUP 2 (issue #52): the helpers are directly-callable RPCs. A caller must not use
-- them as a cross-family membership oracle. Mirrors GROUP 8's treatment of is_parent_of_class.
-- =============================================================================================
select tests.authenticate_as(:'v_parent_p'::uuid, 'parent', 'family', 'ce888888-0000-0000-0000-000000000031'::uuid);

select is(is_guardian_of_class('ce888888-0000-0000-0000-000000000022'::uuid), false,
  'ATTACK 2a DENY: Parent P cannot use is_guardian_of_class as an oracle against Family Q''s class');
select is(is_active_guardian_of_class('ce888888-0000-0000-0000-000000000022'::uuid), false,
  'ATTACK 2b DENY: same for the status-filtered variant');
select is(is_student_of_class('ce888888-0000-0000-0000-000000000022'::uuid), false,
  'ATTACK 2c DENY: Parent P is not a student of Class B');
select is(is_active_student_of_class('ce888888-0000-0000-0000-000000000022'::uuid), false,
  'ATTACK 2d DENY: same for the status-filtered student variant');
select is(is_guardian_of_comment('ce888888-0000-0000-0000-000000000061'::uuid), false,
  'ATTACK 2e DENY: withdrawn Parent P cannot claim guardianship of the comment thread');
select is(is_parent_of_class(:'v_parent_q'::uuid, 'ce888888-0000-0000-0000-000000000022'::uuid), false,
  'ATTACK 2f DENY: Parent P cannot use is_parent_of_class to confirm Parent Q''s membership (issue #52 gate holds)');
select is(resolve_parent_family_label(:'v_parent_q'::uuid, 'ce888888-0000-0000-0000-000000000022'::uuid), null,
  'ATTACK 2g DENY: Parent P cannot resolve Family Q''s label');
select tests.clear_authentication();

-- The guardian helpers are self-scoped via auth.uid(), so a student asking a guardian question
-- about their own class must still get false -- the helper keys off the caller, not the class.
select tests.authenticate_as(:'v_student_q'::uuid, 'student', 'self', :'v_student_q'::uuid);
select is(is_guardian_of_class('ce888888-0000-0000-0000-000000000022'::uuid), false,
  'ATTACK 2h DENY: Student Q is enrolled in Class B but is not a guardian of it -- the helper keys off the caller');
select tests.clear_authentication();

-- =============================================================================================
-- ATTACK GROUP 3 (issue #73): unauthenticated and claim-less callers must fail closed.
-- Uses 171 GROUP 5's idiom: clear the claims AND drop to the anon role, because
-- tests.clear_authentication() alone leaves the session as a superuser that bypasses RLS
-- entirely -- a "0 rows" assertion there would be meaningless. 171 covers class_updates and
-- comments for anon; the reference tables #117 redefines are covered here.
-- =============================================================================================
select set_config('request.jwt.claims', '', true);
set role anon;
select throws_ok(
  $$select count(*) from classes$$,
  '42501', null, 'ATTACK 3a DENY: anon cannot select from classes at all (no grant)');
select throws_ok(
  $$select count(*) from centers$$,
  '42501', null, 'ATTACK 3b DENY: anon cannot select from centers at all (no grant)');
reset role;
select set_config('request.jwt.claims', '', true);

-- A real authenticated user holding no matching active_role: default-deny, zero rows, no error.
select tests.authenticate_as(:'v_parent_p'::uuid, 'nonexistent_role');
select is((select count(*) from class_updates)::int, 0,
  'ATTACK 3c DENY: authenticated user with an unmatched active_role sees zero class_updates');
select is((select count(*) from classes)::int, 0,
  'ATTACK 3d DENY: ...and zero classes -- no policy matches, so nothing is visible');
select tests.clear_authentication();

-- A genuine parent whose scope_id claim is NULL (issue #73's hazard). These membership helpers
-- scope on auth.uid() rather than scope_id, so the caller's own class stays visible and the
-- cross-family oracle stays shut. Pinned so a future refactor toward scope_id cannot change
-- this silently without a test going red.
select tests.authenticate_as(:'v_parent_p'::uuid, 'parent', 'family', null);
select is((select count(*) from classes where id = 'ce888888-0000-0000-0000-000000000021'), 1::bigint,
  'ATTACK 3e: a NULL scope_id does not break a guardian read -- these helpers key on auth.uid(), not scope_id');
select is(is_guardian_of_class('ce888888-0000-0000-0000-000000000022'::uuid), false,
  'ATTACK 3f DENY: a NULL scope_id does not turn the cross-family oracle on');
select tests.clear_authentication();

-- =============================================================================================
-- ATTACK GROUP 4: anon must reach none of them. Every helper is revoked from public/anon, so
-- the attempt is a privilege error, not a false answer.
-- =============================================================================================
set local role anon;
select throws_ok(
  $$select is_guardian_of_class('ce888888-0000-0000-0000-000000000021'::uuid)$$,
  '42501', null, 'ATTACK 4a DENY: anon cannot execute is_guardian_of_class');
select throws_ok(
  $$select is_active_guardian_of_class('ce888888-0000-0000-0000-000000000021'::uuid)$$,
  '42501', null, 'ATTACK 4b DENY: anon cannot execute is_active_guardian_of_class');
select throws_ok(
  $$select class_in_session('ce888888-0000-0000-0000-000000000021'::uuid, 'ce888888-0000-0000-0000-000000000011'::uuid)$$,
  '42501', null, 'ATTACK 4c DENY: anon cannot execute class_in_session');
reset role;

-- =============================================================================================
-- ATTACK GROUP 5: the sibling rule (Decision 3) survives the helper rewrite. A family with a
-- second ACTIVE enrollment in the same class keeps full conversational access.
-- =============================================================================================
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('ce888888-0000-0000-0000-000000000043', 'ce888888-0000-0000-0000-000000000031', 'Sib', 'P', 'HS10');
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('ce888888-0000-0000-0000-000000000053', 'ce888888-0000-0000-0000-000000000043', 'ce888888-0000-0000-0000-000000000021', 'ce888888-0000-0000-0000-000000000011', 'active');

select tests.authenticate_as(:'v_parent_p'::uuid, 'parent', 'family', 'ce888888-0000-0000-0000-000000000031'::uuid);
select is(is_active_guardian_of_class('ce888888-0000-0000-0000-000000000021'::uuid), true,
  'ATTACK 5a ALLOW: one withdrawn child + one active sibling in the same class -- the active row satisfies the exists(), so access is retained (Decision 3)');
select is((select count(*) from class_updates where class_id = 'ce888888-0000-0000-0000-000000000021'), 1::bigint,
  'ATTACK 5b ALLOW: the sibling''s active enrollment restores the feed');
select is((select count(*) from comments where id = 'ce888888-0000-0000-0000-000000000072'), 1::bigint,
  'ATTACK 5c ALLOW: and the private thread, since the family is active in the class again');
select tests.clear_authentication();

select * from finish();
rollback;

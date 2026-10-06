-- Adversarial RLS suite for class_updates/comments + resolve_parent_family_label RPC
-- (issue #21 red-team pass, run against 170's already-passing suite). Goes beyond 170's
-- positive/negative shape checks: direct ID-targeting (IDOR) across sessions/classes,
-- insert-path impersonation/scope-spoofing, write-grant absence for every role, anon/zero-role
-- access, enrollment-status-aware RPC scoping, and a genuine (not synthetic) multi-role
-- active-role-switch scenario where the same account has real, disjoint data in both scopes.
begin;
select plan(81);

insert into centers (id, name) values ('ce777777-0000-0000-0000-000000000001', 'Adversarial Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('ce777777-0000-0000-0000-000000000011', 'ce777777-0000-0000-0000-000000000001', 'Adv Session One', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('ce777777-0000-0000-0000-000000000012', 'ce777777-0000-0000-0000-000000000001', 'Adv Session Two', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('ce777777-0000-0000-0000-000000000021', 'ce777777-0000-0000-0000-000000000011', 'Adv Class A', 'HS9-12'),
  ('ce777777-0000-0000-0000-000000000022', 'ce777777-0000-0000-0000-000000000012', 'Adv Class B', 'HS9-12'),
  ('ce777777-0000-0000-0000-000000000023', 'ce777777-0000-0000-0000-000000000011', 'Adv Class D (withdrawn-only)', 'HS9-12');

insert into families (id, label) values
  ('ce777777-0000-0000-0000-000000000031', 'Adv Family A'),
  ('ce777777-0000-0000-0000-000000000032', 'Adv Family B');

select tests.create_supabase_user('adv-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('adv-teacher-b@test.local') as v_teacher_b \gset
select tests.create_supabase_user('adv-teacher-d@test.local') as v_teacher_d \gset
select tests.create_supabase_user('adv-student-1@test.local') as v_student_1 \gset
select tests.create_supabase_user('adv-student-2@test.local') as v_student_2 \gset
select tests.create_supabase_user('adv-parent-1@test.local') as v_parent_1 \gset
select tests.create_supabase_user('adv-parent-2@test.local') as v_parent_2 \gset
select tests.create_supabase_user('adv-coordinator-1@test.local') as v_coordinator_1 \gset
select tests.create_supabase_user('adv-coordinator-2@test.local') as v_coordinator_2 \gset
select tests.create_supabase_user('adv-admin@test.local') as v_admin \gset
select tests.create_supabase_user('adv-outsider@test.local') as v_outsider \gset
select tests.create_supabase_user('adv-multirole@test.local') as v_multirole \gset
select tests.create_supabase_user('adv-zerorole@test.local') as v_zerorole \gset

-- v_multirole holds a real Teacher grant on Class A AND is a genuine second guardian on Family
-- B (whose child is enrolled in Class B) -- lets us prove a role switch reveals real Class B
-- data and simultaneously stops showing Class A data the same account authored moments earlier
-- as Teacher, not just a synthetic "unrelated parent sees 0 rows" check.
insert into family_members (family_id, user_id, relationship) values
  ('ce777777-0000-0000-0000-000000000031', :'v_parent_1'::uuid, 'guardian'),
  ('ce777777-0000-0000-0000-000000000032', :'v_parent_2'::uuid, 'guardian'),
  ('ce777777-0000-0000-0000-000000000032', :'v_multirole'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('ce777777-0000-0000-0000-000000000041', 'ce777777-0000-0000-0000-000000000031', 'Ivy', 'One', 'HS9', :'v_student_1'::uuid),
  ('ce777777-0000-0000-0000-000000000042', 'ce777777-0000-0000-0000-000000000032', 'Jax', 'Two', 'HS9', :'v_student_2'::uuid);

insert into enrollments (student_id, class_id, session_id, status) values
  ('ce777777-0000-0000-0000-000000000041', 'ce777777-0000-0000-0000-000000000021', 'ce777777-0000-0000-0000-000000000011', 'active'),
  ('ce777777-0000-0000-0000-000000000042', 'ce777777-0000-0000-0000-000000000022', 'ce777777-0000-0000-0000-000000000012', 'active'),
  -- Ivy's withdrawn enrollment in Class D. Until ADR-2026-09-19 this proved the recipient-label
  -- RPC's e.status = 'active' filter; that filter is gone (Decision 4), so it now proves the
  -- opposite: Class D's own Teacher DOES resolve a withdrawn family's label (CONTROL 4f below).
  -- Built by direct insert, which is fine for a label lookup and useless for any transition
  -- assertion -- those live in Group 9, which withdraws by UPDATE.
  ('ce777777-0000-0000-0000-000000000041', 'ce777777-0000-0000-0000-000000000023', 'ce777777-0000-0000-0000-000000000011', 'withdrawn');

insert into class_updates (id, class_id, posted_by, body, homework, meeting_date) values
  ('ce777777-0000-0000-0000-000000000051', 'ce777777-0000-0000-0000-000000000021', :'v_teacher_a'::uuid, 'Adv Class A update', null, '2026-01-11'),
  ('ce777777-0000-0000-0000-000000000052', 'ce777777-0000-0000-0000-000000000022', :'v_teacher_b'::uuid, 'Adv Class B update', null, '2026-01-11'),
  ('ce777777-0000-0000-0000-000000000053', 'ce777777-0000-0000-0000-000000000021', :'v_multirole'::uuid, 'Adv Class A update by multirole-as-teacher', null, '2026-01-11');

insert into comments (id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id) values
  ('ce777777-0000-0000-0000-000000000061', 'ce777777-0000-0000-0000-000000000051', :'v_student_1'::uuid, 'student', 'public comment on Adv A', false, null),
  ('ce777777-0000-0000-0000-000000000062', 'ce777777-0000-0000-0000-000000000051', :'v_parent_1'::uuid, 'parent', 'private note from parent 1', true, :'v_parent_1'::uuid),
  ('ce777777-0000-0000-0000-000000000063', 'ce777777-0000-0000-0000-000000000052', :'v_student_2'::uuid, 'student', 'public comment on Adv B', false, null),
  ('ce777777-0000-0000-0000-000000000064', 'ce777777-0000-0000-0000-000000000052', :'v_parent_2'::uuid, 'parent', 'private note from parent 2', true, :'v_parent_2'::uuid),
  ('ce777777-0000-0000-0000-000000000065', 'ce777777-0000-0000-0000-000000000051', :'v_teacher_a'::uuid, 'teacher', 'teacher private reply to parent 1', true, :'v_parent_1'::uuid);

-- =====================================================================================
-- ATTACK GROUP 1: IDOR by known primary key -- direct row targeting across scope, not
-- just aggregate counts. If any of these return a row, that role/scope boundary is broken.
-- =====================================================================================

select tests.authenticate_as(:'v_teacher_b'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000022'::uuid);
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000051'::uuid)::int, 0,
  'ATTACK 1a DENY: Teacher B cannot fetch Class A''s class_update by known id'
);
select is(
  (select count(*) from comments where class_update_id = 'ce777777-0000-0000-0000-000000000051'::uuid)::int, 0,
  'ATTACK 1b DENY: Teacher B cannot fetch any of Class A''s comments (public or private) by known class_update_id'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_parent_2'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000051'::uuid)::int, 0,
  'ATTACK 1c DENY: Parent 2 (Class B family) cannot fetch Class A''s class_update by known id'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000061'::uuid)::int, 0,
  'ATTACK 1d DENY: Parent 2 cannot fetch Class A''s public comment by known id (not their child''s class)'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_student_2'::uuid, 'student');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000051'::uuid)::int, 0,
  'ATTACK 1e DENY: Student 2 (Class B) cannot fetch Class A''s class_update by known id'
);
select tests.clear_authentication();

-- Critical: comments_coordinator_select's USING clause relies on an EXISTS subquery into
-- class_updates recursing through THAT table's own RLS to stay session-scoped, rather than an
-- unscoped existence check. Prove it actually does, with real cross-session data, not just by
-- reading the SQL.
select tests.authenticate_as(:'v_coordinator_2'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000012'::uuid);
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000051'::uuid)::int, 0,
  'ATTACK 1f DENY: Coordinator of Session Two cannot fetch Session One''s class_update by known id'
);
select is(
  (select count(*) from comments where class_update_id = 'ce777777-0000-0000-0000-000000000051'::uuid)::int, 0,
  'ATTACK 1g DENY: Coordinator of Session Two cannot fetch ANY of Session One''s comments (public or private) via the coordinator oversight policy -- confirms comments_coordinator_select''s EXISTS subquery genuinely recurses through class_updates'' own session-scoped RLS, not an unscoped existence check'
);
select tests.clear_authentication();

-- =====================================================================================
-- ATTACK GROUP 2: INSERT-path impersonation and scope-spoofing.
-- =====================================================================================

-- Parent cannot post a class_update at all (no insert policy for parent on class_updates).
select tests.authenticate_as(:'v_parent_1'::uuid, 'parent');
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body, meeting_date) values (%L, %L, 'parent trying to post an announcement', '2026-01-11')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_parent_1'::uuid),
  '42501', null, 'ATTACK 2a DENY: Parent cannot insert a class_update'
);
select tests.clear_authentication();

-- Student cannot post a class_update.
select tests.authenticate_as(:'v_student_1'::uuid, 'student');
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body, meeting_date) values (%L, %L, 'student trying to post an announcement', '2026-01-11')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_student_1'::uuid),
  '42501', null, 'ATTACK 2b DENY: Student cannot insert a class_update'
);
select tests.clear_authentication();

-- Coordinator (oversight is read-only) cannot post a class_update, even into their own session.
select tests.authenticate_as(:'v_coordinator_1'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000011'::uuid);
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body, meeting_date) values (%L, %L, 'coordinator trying to post an announcement', '2026-01-11')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_coordinator_1'::uuid),
  '42501', null, 'ATTACK 2c DENY: Coordinator cannot insert a class_update, oversight is read-only'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values (%L, %L, 'teacher', 'coordinator trying to post a comment', false, null)$$,
    'ce777777-0000-0000-0000-000000000051'::uuid, :'v_coordinator_1'::uuid),
  '42501', null, 'ATTACK 2d DENY: Coordinator cannot insert a comment, oversight is read-only'
);
select tests.clear_authentication();

-- Admin (org oversight, read-only) cannot post a class_update or comment either.
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body, meeting_date) values (%L, %L, 'admin trying to post an announcement', '2026-01-11')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_admin'::uuid),
  '42501', null, 'ATTACK 2e DENY: Admin cannot insert a class_update, org oversight is read-only'
);
select tests.clear_authentication();

-- Teacher B cannot post an update INTO Class A while scoped to Class B, even naming themselves
-- honestly as posted_by (scope-spoofing the class_id, not identity-spoofing).
select tests.authenticate_as(:'v_teacher_b'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000022'::uuid);
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body, meeting_date) values (%L, %L, 'teacher b cross-posting into class a', '2026-01-11')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_teacher_b'::uuid),
  '42501', null, 'ATTACK 2f DENY: Teacher B cannot insert a class_update into Class A while scoped to Class B'
);
-- Teacher B cannot post a comment onto Class A's update either (comments_teacher_insert scope
-- check joins class_updates.class_id to scope_id, same guard).
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values (%L, %L, 'teacher', 'teacher b cross-commenting on class a', false, null)$$,
    'ce777777-0000-0000-0000-000000000051'::uuid, :'v_teacher_b'::uuid),
  '42501', null, 'ATTACK 2g DENY: Teacher B cannot insert a public comment onto Class A''s update while scoped to Class B'
);
select tests.clear_authentication();

-- Teacher A cannot impersonate posted_by as a different user while inserting into their own
-- class (identity-spoofing, not just scope-spoofing).
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body, meeting_date) values (%L, %L, 'teacher a spoofing posted_by as teacher b', '2026-01-11')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_teacher_b'::uuid),
  '42501', null, 'ATTACK 2h DENY: Teacher A cannot spoof posted_by to another user''s id on their own class''s update'
);
-- Teacher A cannot post a comment claiming author_user_id = Teacher B (identity-spoofing on
-- comments, distinct check from the class_updates one above).
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values (%L, %L, 'teacher', 'teacher a spoofing author as teacher b', false, null)$$,
    'ce777777-0000-0000-0000-000000000051'::uuid, :'v_teacher_b'::uuid),
  '42501', null, 'ATTACK 2i DENY: Teacher A cannot spoof comments.author_user_id to another user''s id'
);
-- Teacher A cannot post a comment while lying about author_role (claims 'parent' while
-- authenticated as teacher -- the pinned-role guard from the plan-level addition).
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values (%L, %L, 'parent', 'teacher a mislabeling author_role as parent', false, null)$$,
    'ce777777-0000-0000-0000-000000000051'::uuid, :'v_teacher_a'::uuid),
  '42501', null, 'ATTACK 2j DENY: Teacher A cannot mislabel author_role as parent while posting as active_role teacher'
);
select tests.clear_authentication();

-- Student cannot mislabel author_user_id or author_role either.
select tests.authenticate_as(:'v_student_1'::uuid, 'student');
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values (%L, %L, 'student', 'student 1 spoofing author as student 2', false, null)$$,
    'ce777777-0000-0000-0000-000000000051'::uuid, :'v_student_2'::uuid),
  '42501', null, 'ATTACK 2k DENY: Student 1 cannot spoof comments.author_user_id to another student''s id'
);
-- Student cannot IDOR-comment onto a class_update belonging to a class they aren't enrolled in.
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values (%L, %L, 'student', 'student 1 commenting on class b update', false, null)$$,
    'ce777777-0000-0000-0000-000000000052'::uuid, :'v_student_1'::uuid),
  '42501', null, 'ATTACK 2l DENY: Student 1 (Class A) cannot comment on Class B''s update by supplying its known id'
);
select tests.clear_authentication();

-- Parent cannot IDOR-comment onto a class_update belonging to a class their child isn't
-- enrolled in (guessing/knowing the id is not enough).
select tests.authenticate_as(:'v_parent_1'::uuid, 'parent');
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values (%L, %L, 'parent', 'parent 1 commenting on class b update', false, null)$$,
    'ce777777-0000-0000-0000-000000000052'::uuid, :'v_parent_1'::uuid),
  '42501', null, 'ATTACK 2m DENY: Parent 1 (Family A, Class A) cannot comment on Class B''s update by supplying its known id'
);
select tests.clear_authentication();

-- =====================================================================================
-- ATTACK GROUP 3: write privileges absent entirely (UPDATE/DELETE) -- confirm the grant-level
-- block applies to every role, including a row's own author, not only oversight roles.
-- =====================================================================================

select tests.authenticate_as(:'v_parent_1'::uuid, 'parent');
select throws_ok(
  $$update comments set body = 'edited by author' where id = 'ce777777-0000-0000-0000-000000000062'::uuid$$,
  '42501', null, 'ATTACK 3a DENY: Parent cannot update their own comment (no update grant on comments for anyone)'
);
select throws_ok(
  $$delete from comments where id = 'ce777777-0000-0000-0000-000000000062'::uuid$$,
  '42501', null, 'ATTACK 3b DENY: Parent cannot delete their own comment (no delete grant on comments for anyone)'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select throws_ok(
  $$delete from class_updates where id = 'ce777777-0000-0000-0000-000000000051'::uuid$$,
  '42501', null, 'ATTACK 3c DENY: Teacher cannot delete their own class_update (no delete grant on class_updates for anyone)'
);
select tests.clear_authentication();

-- =====================================================================================
-- ATTACK GROUP 4: resolve_parent_family_label RPC -- authorization boundary + no
-- existence-leak via error. (Enrollment status no longer gates it: ADR-2026-09-19 Decision 4.)
-- =====================================================================================

-- A Parent cannot call it at all, not even to resolve their OWN family's label for their OWN
-- class -- the RPC is Teacher/Coordinator/Admin-only by design, and its own-authorization gate
-- must not accidentally include Parent.
select tests.authenticate_as(:'v_parent_1'::uuid, 'parent');
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)),
  null, 'ATTACK 4a DENY: Parent role gets null resolving their own label -- RPC is Teacher/Coordinator/Admin-only, no Parent self-service path'
);
select tests.clear_authentication();

-- A Student cannot call it either.
select tests.authenticate_as(:'v_student_1'::uuid, 'student');
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)),
  null, 'ATTACK 4b DENY: Student role gets null from resolve_parent_family_label (not an authorized caller role)'
);
select tests.clear_authentication();

-- Teacher A (Class A) cannot resolve Parent 2's label by supplying Class A as p_class_id --
-- Parent 2's child is enrolled in Class B, not A, so the join must fail even though Teacher A
-- passes the caller-role/scope gate.
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select is(
  (select public.resolve_parent_family_label(:'v_parent_2'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)),
  null, 'ATTACK 4c DENY: Teacher A cannot resolve Parent 2''s label via Class A -- Parent 2''s child is enrolled in Class B, not A'
);
-- ...nor by fabricating an outsider id who has no family link at all -- no error, just null.
select is(
  (select public.resolve_parent_family_label(:'v_outsider'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)),
  null, 'ATTACK 4d DENY: Teacher A resolving a random outsider id gets null, not an error -- no existence leak'
);
select tests.clear_authentication();

-- Coordinator of Session Two cannot resolve Parent 1's label via Class A (Session One) even
-- though Parent 1 IS genuinely, actively enrolled there -- proves the RPC's own session-scope
-- check is independent of (and not satisfied merely by) the enrollment/family join succeeding.
select tests.authenticate_as(:'v_coordinator_2'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000012'::uuid);
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)),
  null, 'ATTACK 4e DENY: Coordinator of Session Two cannot resolve Parent 1''s (Session One) label -- cross-session RPC call blocked'
);
select tests.clear_authentication();

-- Positive control alongside the negatives above: Admin (org-wide) still resolves correctly --
-- proves the negatives above are genuine authorization denials, not the function being broken.
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)),
  'Adv Family A', 'CONTROL: Admin (org-wide oversight) still resolves Parent 1''s real family label (families.label, never the student''s name) via Class A'
);
select tests.clear_authentication();

-- CONTROL 4f (was "ATTACK 4f DENY" until ADR-2026-09-19). Inverted, not deleted (Decision 7).
-- Teacher D is the real Teacher of Class D, and Ivy's family genuinely was enrolled there, so
-- this caller always sat inside the authorization perimeter -- the old assertion tested the
-- e.status = 'active' filter, an implementation detail, not a boundary. Decision 4 removes that
-- filter so a withdrawn family's thread keeps its real label instead of the anonymous
-- "Private thread" fallback. Nothing widens: the RPC returns families.label (never a student
-- value) and enrollments_*_select already shows this Teacher the withdrawn row. The perimeter
-- is still proven by ATTACK 4c (unrelated family) and 4e (cross-session) above.
select tests.authenticate_as(:'v_teacher_d'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000023'::uuid);
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000023'::uuid)),
  'Adv Family A', 'CONTROL 4f ALLOW (ADR-2026-09-19): Teacher D resolves Parent 1''s family label via Class D even though the only enrollment link is withdrawn'
);
select tests.clear_authentication();

-- =====================================================================================
-- ATTACK GROUP 5: anon / unauthenticated / zero-role access.
-- =====================================================================================

select set_config('request.jwt.claims', '', true);
set role anon;
select throws_ok(
  $$select count(*) from class_updates$$,
  '42501', null, 'ATTACK 5a DENY: anon cannot select from class_updates at all (no grant)'
);
select throws_ok(
  $$select count(*) from comments$$,
  '42501', null, 'ATTACK 5b DENY: anon cannot select from comments at all (no grant)'
);
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body, meeting_date) values (%L, %L, 'anon forging a class update', '2026-01-11')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_teacher_a'::uuid),
  '42501', null, 'ATTACK 5c DENY: anon cannot insert into class_updates (no grant, meeting_date)'
);
select throws_ok(
  $$select public.resolve_parent_family_label('00000000-0000-0000-0000-000000000000'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)$$,
  '42501', null, 'ATTACK 5d DENY: anon cannot execute resolve_parent_family_label at all (no grant)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- A real authenticated user who holds NO active user_roles grant at all (auth hook's
-- "zero-role user" case) gets zero rows, not an error -- default-deny with no matching policy,
-- exercised with a genuinely zero-role user rather than just an unmapped active_role string.
select tests.authenticate_as(:'v_zerorole'::uuid, 'nonexistent_role');
select is((select count(*) from class_updates)::int, 0, 'ATTACK 5e DENY: authenticated user with no matching active_role sees zero class_updates rows');
select is((select count(*) from comments)::int, 0, 'ATTACK 5f DENY: authenticated user with no matching active_role sees zero comments rows');
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid)),
  null, 'ATTACK 5g DENY: authenticated user with no matching active_role gets null from resolve_parent_family_label'
);
select tests.clear_authentication();

-- =====================================================================================
-- ATTACK GROUP 6: genuine multi-role active-role-switch -- v_multirole is a REAL Teacher of
-- Class A and a REAL second guardian of Family B (Class B). Prove the switch reveals the new
-- scope's real data and immediately stops revealing the old scope's real data, including data
-- the SAME account itself authored moments earlier under the other role.
-- =====================================================================================

select tests.authenticate_as(:'v_multirole'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select is(
  (select count(*) from class_updates)::int, 2,
  'pre-switch: multirole-as-Teacher-A sees exactly Class A''s 2 updates (both Teacher A''s and their own)'
);
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000052'::uuid)::int, 0,
  'pre-switch: multirole-as-Teacher-A does not see Class B''s update'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_multirole'::uuid, 'parent');
select is(
  (select count(*) from class_updates)::int, 1,
  'post-switch: multirole-as-Parent (Family B) sees exactly Class B''s 1 update -- their real child''s class'
);
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000053'::uuid)::int, 0,
  'post-switch: multirole-as-Parent no longer sees the Class A update it itself authored as Teacher moments earlier -- no stale author-identity leak'
);
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000051'::uuid)::int, 0,
  'post-switch: multirole-as-Parent does not see Teacher A''s Class A update either'
);
-- Comments: as Parent (Family B), sees Class B's public comment plus its own family's private
-- thread (none yet -- so just the public one), and definitely not Class A's private teacher
-- reply targeting Parent 1, nor Class A's public comment.
select is(
  (select count(*) from comments)::int, 1,
  'post-switch: multirole-as-Parent sees exactly Class B''s 1 visible comment (public), nothing from Class A'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000065'::uuid)::int, 0,
  'post-switch: multirole-as-Parent cannot see Class A''s private teacher-reply-to-Parent-1 thread'
);
select tests.clear_authentication();

-- Switch back to Teacher: immediately regains Class A visibility, with no residual Parent-scope
-- narrowing carried over.
select tests.authenticate_as(:'v_multirole'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select is(
  (select count(*) from class_updates)::int, 2,
  'switch-back: multirole-as-Teacher-A regains exactly Class A''s 2 updates, no residual Parent-scope narrowing'
);
select tests.clear_authentication();

-- =====================================================================================
-- ATTACK GROUP 7: co-teacher / non-posting-teacher cannot read another teacher's private reply
-- thread on the SAME class, even when both are legitimately scoped to that class (there is no
-- multi-teacher-per-class fixture upstream, so this is simulated by re-scoping Teacher B
-- directly into Class A's scope_id to model a substitute/second teacher of the same class).
-- =====================================================================================

select tests.authenticate_as(:'v_teacher_b'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000065'::uuid)::int, 0,
  'ATTACK 7 DENY: a second/substitute Teacher scoped to the same class does not see Teacher A''s private reply thread (comments_poster_teacher_private_select is posted_by-scoped, not class-scoped)'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000061'::uuid)::int, 1,
  'CONTROL: same substitute-Teacher scope DOES see the public comment on Class A (proves the prior denial was private-thread-specific, not a general scope failure)'
);
select tests.clear_authentication();

-- =====================================================================================
-- ATTACK GROUP 8 (issue #52): is_parent_of_class is a directly-callable SECURITY DEFINER RPC
-- granted to `authenticated`, not just an internal policy helper reached only via a pre-scoped
-- WITH CHECK — it must carry its own auth.jwt() scope gate (mirroring
-- resolve_parent_family_label's pattern), not rely on every caller pre-scoping p_class_id.
-- =====================================================================================

select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select is(
  is_parent_of_class(:'v_parent_2'::uuid, 'ce777777-0000-0000-0000-000000000022'::uuid),
  false,
  'ATTACK 8a DENY: Teacher A (scoped to Class A) cannot use is_parent_of_class as a cross-class oracle against Class B, even though v_parent_2 genuinely is a parent there'
);
select is(
  is_parent_of_class(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid),
  true,
  'CONTROL: Teacher A asking about their OWN class (Class A) for its real parent still resolves true'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_coordinator_2'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000012'::uuid);
select is(
  is_parent_of_class(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid),
  false,
  'ATTACK 8b DENY: Coordinator of Session Two (owns Class B) cannot query Class A, which belongs to Session One'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_coordinator_1'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000011'::uuid);
select is(
  is_parent_of_class(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid),
  true,
  'CONTROL: Coordinator of Session One (owns Class A) legitimately resolves true for their own session'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_outsider'::uuid, 'student', 'class', 'ce777777-0000-0000-0000-000000000021'::uuid);
select is(
  is_parent_of_class(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000021'::uuid),
  false,
  'ATTACK 8c DENY: a Student (no role match in the function''s auth.jwt() gate at all) gets false regardless of scope_id'
);
select tests.clear_authentication();

-- =====================================================================================
-- GROUP 9 (issue #96, ADR-2026-09-19): withdrawal revokes conversational access outright.
-- The withdrawn state is built by UPDATE, after the class update and comments exist and
-- after two controls prove the family could read them -- so "cannot read an update posted
-- before withdrawal" cannot pass vacuously against a family that was never enrolled.
-- Fixtures live here, not at the top of the file, so no earlier count assertion moves.
-- Count assertions below target fixture ids, so they stay exact even on a RED run where an
-- insert that should have been refused leaked a row.
-- =====================================================================================

insert into classes (id, session_id, name, grade_band) values
  ('ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'Adv Class W (withdrawal transitions)', 'HS9-12');

insert into families (id, label) values
  ('ce777777-0000-0000-0000-000000000033', 'Adv Family W1'),
  ('ce777777-0000-0000-0000-000000000034', 'Adv Family W2');

select tests.create_supabase_user('adv-teacher-w@test.local') as v_teacher_w \gset
select tests.create_supabase_user('adv-parent-w1@test.local') as v_parent_w1 \gset
select tests.create_supabase_user('adv-parent-w2@test.local') as v_parent_w2 \gset
select tests.create_supabase_user('adv-student-w1@test.local') as v_student_w1 \gset
select tests.create_supabase_user('adv-student-w2@test.local') as v_student_w2 \gset

insert into family_members (family_id, user_id, relationship) values
  ('ce777777-0000-0000-0000-000000000033', :'v_parent_w1'::uuid, 'guardian'),
  ('ce777777-0000-0000-0000-000000000034', :'v_parent_w2'::uuid, 'guardian');

-- Family W1 has one child (Wes) -> withdrawing him withdraws the family from Class W.
-- Family W2 has two (Xan, Yul) in the same class -> withdrawing Xan leaves Yul as the
-- still-enrolled sibling, which must keep the family's access with no special guard.
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('ce777777-0000-0000-0000-000000000043', 'ce777777-0000-0000-0000-000000000033', 'Wes', 'Wone', 'HS9', :'v_student_w1'::uuid),
  ('ce777777-0000-0000-0000-000000000044', 'ce777777-0000-0000-0000-000000000034', 'Xan', 'Wtwo', 'HS9', :'v_student_w2'::uuid),
  ('ce777777-0000-0000-0000-000000000045', 'ce777777-0000-0000-0000-000000000034', 'Yul', 'Wtwo', 'HS9', null);

insert into enrollments (student_id, class_id, session_id, status) values
  ('ce777777-0000-0000-0000-000000000043', 'ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'active'),
  ('ce777777-0000-0000-0000-000000000044', 'ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'active'),
  ('ce777777-0000-0000-0000-000000000045', 'ce777777-0000-0000-0000-000000000024', 'ce777777-0000-0000-0000-000000000011', 'active');

-- Posted while every enrollment above is active.
insert into class_updates (id, class_id, posted_by, body, homework, meeting_date) values
  ('ce777777-0000-0000-0000-000000000054', 'ce777777-0000-0000-0000-000000000024', :'v_teacher_w'::uuid, 'Adv Class W update, posted before any withdrawal', null, '2026-01-11');

insert into comments (id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id) values
  ('ce777777-0000-0000-0000-000000000066', 'ce777777-0000-0000-0000-000000000054', :'v_student_w1'::uuid, 'student', 'public comment on Adv W', false, null),
  ('ce777777-0000-0000-0000-000000000067', 'ce777777-0000-0000-0000-000000000054', :'v_parent_w1'::uuid, 'parent', 'private note from parent W1', true, :'v_parent_w1'::uuid),
  ('ce777777-0000-0000-0000-000000000068', 'ce777777-0000-0000-0000-000000000054', :'v_teacher_w'::uuid, 'teacher', 'teacher private reply to parent W1', true, :'v_parent_w1'::uuid),
  ('ce777777-0000-0000-0000-000000000069', 'ce777777-0000-0000-0000-000000000054', :'v_parent_w2'::uuid, 'parent', 'private note from parent W2', true, :'v_parent_w2'::uuid);

-- Non-vacuity controls: while enrolled, Parent W1 reads the update and their whole thread.
select tests.authenticate_as(:'v_parent_w1'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 1,
  'CONTROL 9-pre: while enrolled, Parent W1 reads Class W''s update (so the denials below are a real transition)'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 2,
  'CONTROL 9-pre: while enrolled, Parent W1 reads both sides of their own private thread'
);
select tests.clear_authentication();

-- THE TRANSITION: active -> withdrawn by UPDATE. Wes (all of Family W1) and Xan (one of two
-- Family W2 children).
update enrollments set status = 'withdrawn'
where class_id = 'ce777777-0000-0000-0000-000000000024'
  and student_id in ('ce777777-0000-0000-0000-000000000043', 'ce777777-0000-0000-0000-000000000044');

-- A second update, posted after the withdrawal.
insert into class_updates (id, class_id, posted_by, body, homework, meeting_date) values
  ('ce777777-0000-0000-0000-000000000055', 'ce777777-0000-0000-0000-000000000024', :'v_teacher_w'::uuid, 'Adv Class W update, posted after the withdrawal', null, '2026-01-18');

-- Withdrawn Parent.
select tests.authenticate_as(:'v_parent_w1'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 0,
  'ATTACK 9a DENY: withdrawn Parent cannot read a class update posted BEFORE withdrawal (no time bound -- the ADR-2026-09-19 vs ADR-0037 difference)'
);
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000055'::uuid)::int, 0,
  'ATTACK 9b DENY: withdrawn Parent cannot read a class update posted after withdrawal'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000066'::uuid)::int, 0,
  'ATTACK 9c DENY: withdrawn Parent cannot read the class''s public comments'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 0,
  'ATTACK 9d DENY: withdrawn Parent cannot read their OWN private thread (Decision 1b -- comments_target_parent_select is identity-derived and had no enrollments join to filter)'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 'withdrawn parent public comment', false, null)$$, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9e DENY: withdrawn Parent cannot insert a public comment'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 'withdrawn parent private note', true, %L)$$, :'v_parent_w1'::uuid, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9f DENY: withdrawn Parent cannot insert into their own private thread'
);
select tests.clear_authentication();

-- Withdrawn Student.
select tests.authenticate_as(:'v_student_w1'::uuid, 'student');
select is(
  (select count(*) from class_updates where class_id = 'ce777777-0000-0000-0000-000000000024'::uuid)::int, 0,
  'ATTACK 9g DENY: withdrawn Student cannot read any of the class''s updates'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000066'::uuid)::int, 0,
  'ATTACK 9h DENY: withdrawn Student cannot read the class''s public comments -- including their own'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'student', 'withdrawn student comment', false, null)$$, :'v_student_w1'::uuid),
  '42501', null, 'ATTACK 9i DENY: withdrawn Student cannot insert a comment'
);
select tests.clear_authentication();

-- The class's Teacher: write to the withdrawn family is revoked, read is not.
select tests.authenticate_as(:'v_teacher_w'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000024'::uuid);
select is(
  is_parent_of_class(:'v_parent_w1'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid),
  false,
  'ATTACK 9j DENY: is_parent_of_class is false for a Parent whose only enrollment in the class is withdrawn'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000055'::uuid, %L, 'teacher', 'opening a new thread with a withdrawn parent', true, %L)$$, :'v_teacher_w'::uuid, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9k DENY: Teacher cannot open a NEW private thread with a withdrawn Parent'
);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'teacher', 'replying into an existing thread with a withdrawn parent', true, %L)$$, :'v_teacher_w'::uuid, :'v_parent_w1'::uuid),
  '42501', null, 'ATTACK 9l DENY: Teacher cannot reply into an EXISTING private thread with a withdrawn Parent (is_parent_of_class runs on every private insert, not once per thread)'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 2,
  'CONTROL 9: Teacher still READS the withdrawn family''s private thread (authorship-derived, never joined enrollments)'
);
savepoint before_w_teacher_public_comment;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'teacher', 'teacher public comment', false, null)$$, :'v_teacher_w'::uuid),
  'CONTROL 9: Teacher still posts PUBLIC comments on that update (the public branch never calls is_parent_of_class)'
);
rollback to savepoint before_w_teacher_public_comment;
select is(
  (select public.resolve_parent_family_label(:'v_parent_w1'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid)),
  'Adv Family W1', 'CONTROL 9: Teacher resolves the withdrawn family''s real label (no "Private thread" fallback, Decision 4)'
);
-- Sibling still enrolled (Yul): Family W2 keeps its write path, with no special guard.
select is(
  is_parent_of_class(:'v_parent_w2'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid),
  true,
  'CONTROL 9: is_parent_of_class stays true for a Parent with one child withdrawn and a sibling still enrolled in the same class'
);
savepoint before_w_teacher_reply_to_sibling_family;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'teacher', 'reply to parent W2', true, %L)$$, :'v_teacher_w'::uuid, :'v_parent_w2'::uuid),
  'CONTROL 9: Teacher can still reply privately to the family with a sibling still enrolled'
);
rollback to savepoint before_w_teacher_reply_to_sibling_family;
select tests.clear_authentication();

select tests.authenticate_as(:'v_parent_w2'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 1,
  'CONTROL 9: Parent with a sibling still enrolled keeps reading the class''s updates'
);
select is(
  (select count(*) from comments where id = 'ce777777-0000-0000-0000-000000000069'::uuid)::int, 1,
  'CONTROL 9: Parent with a sibling still enrolled keeps reading their own private thread'
);
savepoint before_w_sibling_parent_comment;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 'sibling-family public comment', false, null)$$, :'v_parent_w2'::uuid),
  'CONTROL 9: Parent with a sibling still enrolled can still comment'
);
rollback to savepoint before_w_sibling_parent_comment;
select tests.clear_authentication();

-- ...but the withdrawn sibling himself is out: student access is per-student.
select tests.authenticate_as(:'v_student_w2'::uuid, 'student');
select is(
  (select count(*) from class_updates where class_id = 'ce777777-0000-0000-0000-000000000024'::uuid)::int, 0,
  'ATTACK 9m DENY: the withdrawn sibling (Student) loses the feed even though his family keeps it through the enrolled sibling'
);
select tests.clear_authentication();

-- Oversight is scope-derived and untouched.
select tests.authenticate_as(:'v_coordinator_1'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000011'::uuid);
select is(
  (select count(*) from comments where id in (
    'ce777777-0000-0000-0000-000000000066'::uuid, 'ce777777-0000-0000-0000-000000000067'::uuid,
    'ce777777-0000-0000-0000-000000000068'::uuid, 'ce777777-0000-0000-0000-000000000069'::uuid))::int, 4,
  'CONTROL 9: Coordinator oversight still reads every comment, public and private, after the withdrawal'
);
select tests.clear_authentication();

-- RE-ENROLMENT: withdrawn -> active restores everything, including what was posted meanwhile.
update enrollments set status = 'active'
where class_id = 'ce777777-0000-0000-0000-000000000024'
  and student_id = 'ce777777-0000-0000-0000-000000000043';

select tests.authenticate_as(:'v_parent_w1'::uuid, 'parent');
select is(
  (select count(*) from class_updates where id = 'ce777777-0000-0000-0000-000000000054'::uuid)::int, 1,
  'CONTROL 9: re-enrolment restores the Parent''s read of the earlier update'
);
select is(
  (select count(*) from class_updates where class_id = 'ce777777-0000-0000-0000-000000000024'::uuid)::int, 2,
  'CONTROL 9: re-enrolment also reveals the update posted while they were withdrawn (nothing was stamped, so nothing to un-stamp)'
);
select is(
  (select count(*) from comments where id in ('ce777777-0000-0000-0000-000000000067'::uuid, 'ce777777-0000-0000-0000-000000000068'::uuid))::int, 2,
  'CONTROL 9: re-enrolment restores the Parent''s private thread'
);
savepoint before_w_reenrolled_parent_note;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('ce777777-0000-0000-0000-000000000054'::uuid, %L, 'parent', 're-enrolled parent private note', true, %L)$$, :'v_parent_w1'::uuid, :'v_parent_w1'::uuid),
  'CONTROL 9: re-enrolment restores the Parent''s write'
);
rollback to savepoint before_w_reenrolled_parent_note;
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_w'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000024'::uuid);
select is(
  is_parent_of_class(:'v_parent_w1'::uuid, 'ce777777-0000-0000-0000-000000000024'::uuid),
  true,
  'CONTROL 9: re-enrolment restores is_parent_of_class, so the Teacher can reply again'
);
select tests.clear_authentication();

select * from finish();
rollback;

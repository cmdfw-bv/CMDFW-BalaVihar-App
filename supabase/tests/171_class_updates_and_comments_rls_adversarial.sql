-- Adversarial RLS suite for class_updates/comments + resolve_parent_family_label RPC
-- (issue #21 red-team pass, run against 170's already-passing suite). Goes beyond 170's
-- positive/negative shape checks: direct ID-targeting (IDOR) across sessions/classes,
-- insert-path impersonation/scope-spoofing, write-grant absence for every role, anon/zero-role
-- access, enrollment-status-aware RPC scoping, and a genuine (not synthetic) multi-role
-- active-role-switch scenario where the same account has real, disjoint data in both scopes.
begin;
select plan(47);

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
  -- Ivy's withdrawn (non-active) enrollment in Class D: proves the recipient-label RPC's
  -- e.status = 'active' filter actually blocks a stale/withdrawn link, not just an absent one.
  ('ce777777-0000-0000-0000-000000000041', 'ce777777-0000-0000-0000-000000000023', 'ce777777-0000-0000-0000-000000000011', 'withdrawn');

insert into class_updates (id, class_id, posted_by, body, homework) values
  ('ce777777-0000-0000-0000-000000000051', 'ce777777-0000-0000-0000-000000000021', :'v_teacher_a'::uuid, 'Adv Class A update', null),
  ('ce777777-0000-0000-0000-000000000052', 'ce777777-0000-0000-0000-000000000022', :'v_teacher_b'::uuid, 'Adv Class B update', null),
  ('ce777777-0000-0000-0000-000000000053', 'ce777777-0000-0000-0000-000000000021', :'v_multirole'::uuid, 'Adv Class A update by multirole-as-teacher', null);

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
  format($$insert into class_updates (class_id, posted_by, body) values (%L, %L, 'parent trying to post an announcement')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_parent_1'::uuid),
  '42501', null, 'ATTACK 2a DENY: Parent cannot insert a class_update'
);
select tests.clear_authentication();

-- Student cannot post a class_update.
select tests.authenticate_as(:'v_student_1'::uuid, 'student');
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body) values (%L, %L, 'student trying to post an announcement')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_student_1'::uuid),
  '42501', null, 'ATTACK 2b DENY: Student cannot insert a class_update'
);
select tests.clear_authentication();

-- Coordinator (oversight is read-only) cannot post a class_update, even into their own session.
select tests.authenticate_as(:'v_coordinator_1'::uuid, 'coordinator', 'session', 'ce777777-0000-0000-0000-000000000011'::uuid);
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body) values (%L, %L, 'coordinator trying to post an announcement')$$,
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
  format($$insert into class_updates (class_id, posted_by, body) values (%L, %L, 'admin trying to post an announcement')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_admin'::uuid),
  '42501', null, 'ATTACK 2e DENY: Admin cannot insert a class_update, org oversight is read-only'
);
select tests.clear_authentication();

-- Teacher B cannot post an update INTO Class A while scoped to Class B, even naming themselves
-- honestly as posted_by (scope-spoofing the class_id, not identity-spoofing).
select tests.authenticate_as(:'v_teacher_b'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000022'::uuid);
select throws_ok(
  format($$insert into class_updates (class_id, posted_by, body) values (%L, %L, 'teacher b cross-posting into class a')$$,
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
  format($$insert into class_updates (class_id, posted_by, body) values (%L, %L, 'teacher a spoofing posted_by as teacher b')$$,
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
-- ATTACK GROUP 4: resolve_parent_family_label RPC -- authorization boundary + enrollment
-- status-awareness + no existence-leak via error.
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

-- Enrollment-status awareness: Teacher D (Class D) cannot resolve Parent 1's label via Class D
-- -- Ivy's only link to Class D is a WITHDRAWN enrollment, so the e.status = 'active' filter
-- must block it even though the family/class/teacher-scope join otherwise lines up.
select tests.authenticate_as(:'v_teacher_d'::uuid, 'teacher', 'class', 'ce777777-0000-0000-0000-000000000023'::uuid);
select is(
  (select public.resolve_parent_family_label(:'v_parent_1'::uuid, 'ce777777-0000-0000-0000-000000000023'::uuid)),
  null, 'ATTACK 4f DENY: Teacher D gets null for Parent 1 via Class D -- the only enrollment link is withdrawn, not active'
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
  format($$insert into class_updates (class_id, posted_by, body) values (%L, %L, 'anon forging a class update')$$,
    'ce777777-0000-0000-0000-000000000021'::uuid, :'v_teacher_a'::uuid),
  '42501', null, 'ATTACK 5c DENY: anon cannot insert into class_updates (no grant)'
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

select * from finish();
rollback;

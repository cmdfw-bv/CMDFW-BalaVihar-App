begin;
select plan(25);

insert into centers (id, name) values ('cd888888-0000-0000-0000-000000000001', 'Plan Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('cd888888-0000-0000-0000-000000000011', 'cd888888-0000-0000-0000-000000000001', 'Session One', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('cd888888-0000-0000-0000-000000000012', 'cd888888-0000-0000-0000-000000000001', 'Session Two', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('cd888888-0000-0000-0000-000000000021', 'cd888888-0000-0000-0000-000000000011', 'Class A', 'HS9-12'),
  ('cd888888-0000-0000-0000-000000000022', 'cd888888-0000-0000-0000-000000000012', 'Class B', 'HS9-12');

insert into families (id, label) values
  ('cd888888-0000-0000-0000-000000000031', 'Family A1'),
  ('cd888888-0000-0000-0000-000000000032', 'Family A2');

select tests.create_supabase_user('plan-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('plan-teacher-b@test.local') as v_teacher_b \gset
select tests.create_supabase_user('plan-student-a1@test.local') as v_student_a1 \gset
select tests.create_supabase_user('plan-student-a2@test.local') as v_student_a2 \gset
select tests.create_supabase_user('plan-parent-a1@test.local') as v_parent_a1 \gset
select tests.create_supabase_user('plan-parent-a2@test.local') as v_parent_a2 \gset
select tests.create_supabase_user('plan-coordinator-s1@test.local') as v_coordinator_s1 \gset
select tests.create_supabase_user('plan-coordinator-s2@test.local') as v_coordinator_s2 \gset
select tests.create_supabase_user('plan-admin@test.local') as v_admin \gset
select tests.create_supabase_user('plan-outsider@test.local') as v_outsider \gset

insert into family_members (family_id, user_id, relationship) values
  ('cd888888-0000-0000-0000-000000000031', :'v_parent_a1'::uuid, 'guardian'),
  ('cd888888-0000-0000-0000-000000000032', :'v_parent_a2'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('cd888888-0000-0000-0000-000000000041', 'cd888888-0000-0000-0000-000000000031', 'Ann', 'One', 'HS9', :'v_student_a1'::uuid),
  ('cd888888-0000-0000-0000-000000000042', 'cd888888-0000-0000-0000-000000000032', 'Bea', 'Two', 'HS9', :'v_student_a2'::uuid);

-- Both students enrolled in Class A — gives parent_a1 and parent_a2 a shared class, needed
-- to prove each parent sees only their own private thread on the same class_update (edge case).
insert into enrollments (student_id, class_id, session_id, status) values
  ('cd888888-0000-0000-0000-000000000041', 'cd888888-0000-0000-0000-000000000021', 'cd888888-0000-0000-0000-000000000011', 'active'),
  ('cd888888-0000-0000-0000-000000000042', 'cd888888-0000-0000-0000-000000000021', 'cd888888-0000-0000-0000-000000000011', 'active');

-- Fixture rows inserted directly (bypasses RLS at setup time — same convention as
-- 060_chat_rls.sql's own fixtures) so the read-side policies below have real rows to check.
insert into class_updates (id, class_id, posted_by, body, homework) values
  ('cd888888-0000-0000-0000-000000000051', 'cd888888-0000-0000-0000-000000000021', :'v_teacher_a'::uuid, 'Class A update', null),
  ('cd888888-0000-0000-0000-000000000052', 'cd888888-0000-0000-0000-000000000022', :'v_teacher_b'::uuid, 'Class B update', null);

insert into comments (id, class_update_id, author_user_id, author_role, body, is_private, target_parent_id) values
  ('cd888888-0000-0000-0000-000000000061', 'cd888888-0000-0000-0000-000000000051', :'v_student_a1'::uuid, 'student', 'public comment on A', false, null),
  ('cd888888-0000-0000-0000-000000000062', 'cd888888-0000-0000-0000-000000000051', :'v_parent_a1'::uuid, 'parent', 'private note from parent A1', true, :'v_parent_a1'::uuid),
  ('cd888888-0000-0000-0000-000000000063', 'cd888888-0000-0000-0000-000000000052', :'v_parent_a2'::uuid, 'parent', 'fixture-only private note on B', true, :'v_parent_a2'::uuid);

-- (1) Teacher A: exactly their own class's update.
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000021'::uuid);
select is((select count(*) from class_updates)::int, 1, 'Teacher sees exactly their own active-role class''s update');

-- (2) Teacher A can insert into their own class. Savepoint + rollback so this positive-insert
-- proof doesn't leak an extra row into every class_updates count assertion below it.
savepoint before_teacher_insert_check;
select lives_ok(
  $$insert into class_updates (class_id, posted_by, body) values ('cd888888-0000-0000-0000-000000000021'::uuid, auth.uid(), 'another update')$$,
  'Teacher can insert a class_update into their own active-role class'
);
rollback to savepoint before_teacher_insert_check;

-- (3) Teacher A cannot insert into a different class.
select throws_ok(
  $$insert into class_updates (class_id, posted_by, body) values ('cd888888-0000-0000-0000-000000000022'::uuid, auth.uid(), 'wrong class')$$,
  '42501', null, 'Teacher cannot insert a class_update into a class outside their active-role scope'
);
select tests.clear_authentication();

-- (4) Parent A1: exactly their child's class's update.
select tests.authenticate_as(:'v_parent_a1'::uuid, 'parent');
select is((select count(*) from class_updates)::int, 1, 'Parent sees exactly their enrolled child''s class update');

-- (7) Parent A1 sees the public comment plus their own private one (2), not Parent A2's.
select is((select count(*) from comments)::int, 2, 'Parent sees the public comment and only their own private thread');
select tests.clear_authentication();

-- (5) Student A1: exactly their own class's update.
select tests.authenticate_as(:'v_student_a1'::uuid, 'student');
select is((select count(*) from class_updates)::int, 1, 'Student sees exactly their own class''s update');

-- (6) Student A1 sees only the public comment — never any private row, ever.
select is((select count(*) from comments)::int, 1, 'Student sees only the public comment, no private thread');

-- Student cannot post a private comment.
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'student', 'trying private', true, %L)$$, :'v_student_a1'::uuid, :'v_parent_a1'::uuid),
  '42501', null, 'Student cannot post a private comment'
);
select tests.clear_authentication();

-- (8) Parent A2 (sibling family, same class): sees the public comment, never Parent A1's private thread.
select tests.authenticate_as(:'v_parent_a2'::uuid, 'parent');
select is(
  (select count(*) from comments where class_update_id = 'cd888888-0000-0000-0000-000000000051'::uuid)::int, 1,
  'A different Parent on the same class_update never sees another family''s private thread'
);

-- Parent A2 cannot impersonate Parent A1 by targeting someone else's target_parent_id.
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'parent', 'spoofed target', true, %L)$$, :'v_parent_a2'::uuid, :'v_parent_a1'::uuid),
  '42501', null, 'A Parent cannot set target_parent_id to another Parent''s id (self-target only)'
);
select tests.clear_authentication();

-- (9)/(10) Teacher's private-reply guard: rejects a non-Parent-of-class target, accepts a real one.
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000021'::uuid);
select throws_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'teacher', 'reply to nobody', true, %L)$$, :'v_teacher_a'::uuid, :'v_outsider'::uuid),
  '42501', null, 'is_parent_of_class rejects a Teacher''s private reply whose target isn''t actually a Parent of that class'
);
-- Savepoint + rollback here too — this positive insert would otherwise leak an extra private
-- comment into the Coordinator/Admin oversight count assertions further below.
savepoint before_teacher_private_reply_check;
select lives_ok(
  format($$insert into comments (class_update_id, author_user_id, author_role, body, is_private, target_parent_id)
    values ('cd888888-0000-0000-0000-000000000051'::uuid, %L, 'teacher', 'reply to parent A1', true, %L)$$, :'v_teacher_a'::uuid, :'v_parent_a1'::uuid),
  'is_parent_of_class accepts a Teacher''s private reply targeting a real Parent of that class'
);
rollback to savepoint before_teacher_private_reply_check;

-- No update/delete grant exists on either table for any role, including Teacher on their own post.
select throws_ok(
  $$update class_updates set body = 'edited' where id = 'cd888888-0000-0000-0000-000000000051'::uuid$$,
  '42501', null, 'no role — including the posting Teacher — can update a class_update (no moderation/edit in scope)'
);
select throws_ok(
  $$delete from comments where id = 'cd888888-0000-0000-0000-000000000061'::uuid$$,
  '42501', null, 'no role can delete a comment (moderation explicitly out of scope)'
);

-- (22) resolve_parent_family_label: Teacher A resolves Parent A1's label; Teacher B (wrong class) gets null.
select is(
  (select public.resolve_parent_family_label(:'v_parent_a1'::uuid, 'cd888888-0000-0000-0000-000000000021'::uuid)),
  'Family A1', 'Teacher of the class resolves the target Parent''s family label (families.label, never the student''s name)'
);
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_b'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000022'::uuid);
select is(
  (select public.resolve_parent_family_label(:'v_parent_a1'::uuid, 'cd888888-0000-0000-0000-000000000021'::uuid)),
  null, 'A Teacher outside the class gets null, not another class''s family data'
);
select tests.clear_authentication();

-- (13)/(14) Coordinator S1 (session one): sees Class A's update, not Class B's (sibling session).
select tests.authenticate_as(:'v_coordinator_s1'::uuid, 'coordinator', 'session', 'cd888888-0000-0000-0000-000000000011'::uuid);
select is((select count(*) from class_updates)::int, 1, 'Coordinator sees only their own session''s class_updates');
select is(
  (select count(*) from class_updates where id = 'cd888888-0000-0000-0000-000000000052'::uuid)::int, 0,
  'Coordinator does not see a sibling session''s class_update, proving session-scoping (not center-wide)'
);

-- (15) Coordinator S1 oversight: full read (public + private) on their session's class_update.
select is(
  (select count(*) from comments where class_update_id = 'cd888888-0000-0000-0000-000000000051'::uuid)::int, 2,
  'Coordinator oversight reads both the public comment and the private thread on their own session''s update'
);
select tests.clear_authentication();

-- (16) Coordinator S2 (different session): zero rows into Class A's data.
select tests.authenticate_as(:'v_coordinator_s2'::uuid, 'coordinator', 'session', 'cd888888-0000-0000-0000-000000000012'::uuid);
select is(
  (select count(*) from class_updates where id = 'cd888888-0000-0000-0000-000000000051'::uuid)::int, 0,
  'A Coordinator from a different session sees zero rows of Class A''s update — no session-to-session leak'
);
select tests.clear_authentication();

-- (17)/(18) Admin: org-wide, both class_updates and every comment (public + private, both classes).
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is((select count(*) from class_updates)::int, 2, 'Admin sees every class_update, org-wide');
select is((select count(*) from comments)::int, 3, 'Admin sees every comment (public and private) org-wide, both classes');
select throws_ok(
  $$update class_updates set body = 'admin edit' where id = 'cd888888-0000-0000-0000-000000000051'::uuid$$,
  '42501', null, 'Admin oversight is read-only — no update grant exists even org-wide'
);
select tests.clear_authentication();

-- (21) Role-switch atomicity: same account, Teacher scope sees 1 row, Parent scope (unrelated) sees 0 — no stale leak.
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'cd888888-0000-0000-0000-000000000021'::uuid);
select is((select count(*) from class_updates)::int, 1, 'pre-switch: Teacher A sees their class''s update');
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_a'::uuid, 'parent');
select is(
  (select count(*) from class_updates)::int, 0,
  'post-switch: same account as an unrelated Parent role sees zero rows immediately — no stale Teacher-scope leak'
);
select tests.clear_authentication();

select * from finish();
rollback;

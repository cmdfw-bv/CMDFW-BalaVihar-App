-- Teacher -> chat-message-removal (issue #113, ADR-2026-11-14-chat-message-removal-move-aside).
-- Adversarial role x scope ladder for public.remove_message (spec Decision 4, AC 2-4, 8, 10).
--
-- Every refusal is paired with a CONTROL that differs from it in the one property under test and
-- succeeds, so a refusal cannot pass for the wrong reason (missing grant, unseen row, bad fixture).
-- Callers always run as `authenticated` with JWT claims, or as `anon`; never
-- tests.clear_authentication() as an "unauthorized" stand-in (it resets to a superuser).
-- clear_authentication() is used only to return to the superuser between fixture steps.
begin;
select plan(46);

-- ---------------------------------------------------------------------------------------------
-- Fixture. Session S1 holds classes A and B; session S2 holds class C.
-- ---------------------------------------------------------------------------------------------
insert into centers (id, name) values ('f2010000-0000-0000-0000-000000000001', 'MRA Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('f2010000-0000-0000-0000-000000000011', 'f2010000-0000-0000-0000-000000000001', 'MRA Session 1', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('f2010000-0000-0000-0000-000000000012', 'f2010000-0000-0000-0000-000000000001', 'MRA Session 2', '2026-01-01', '2026-06-01', 6, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('f2010000-0000-0000-0000-0000000000a1', 'f2010000-0000-0000-0000-000000000011', 'MRA Class A', 'HS9-12'),
  ('f2010000-0000-0000-0000-0000000000b1', 'f2010000-0000-0000-0000-000000000011', 'MRA Class B', 'HS9-12'),
  ('f2010000-0000-0000-0000-0000000000c1', 'f2010000-0000-0000-0000-000000000012', 'MRA Class C', 'HS9-12');
insert into families (id, label) values ('f2010000-0000-0000-0000-000000000031', 'MRA Family');

select tests.create_supabase_user('mra-student-a@test.local') as v_student_a \gset
select tests.create_supabase_user('mra-student-b@test.local') as v_student_b \gset
select tests.create_supabase_user('mra-student-c@test.local') as v_student_c \gset
select tests.create_supabase_user('mra-parent-a@test.local') as v_parent_a \gset
select tests.create_supabase_user('mra-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('mra-teacher-a2@test.local') as v_teacher_a2 \gset
select tests.create_supabase_user('mra-teacher-b@test.local') as v_teacher_b \gset
select tests.create_supabase_user('mra-multi@test.local') as v_multi \gset
select tests.create_supabase_user('mra-teacher-parent@test.local') as v_tp \gset
select tests.create_supabase_user('mra-coord-1@test.local') as v_coord_1 \gset
select tests.create_supabase_user('mra-coord-1b@test.local') as v_coord_1b \gset
select tests.create_supabase_user('mra-coord-2@test.local') as v_coord_2 \gset
select tests.create_supabase_user('mra-bvc@test.local') as v_bvc \gset
select tests.create_supabase_user('mra-admin@test.local') as v_admin \gset

insert into family_members (family_id, user_id, relationship)
  values ('f2010000-0000-0000-0000-000000000031', :'v_parent_a'::uuid, 'parent');
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('f2010000-0000-0000-0000-000000000041', 'f2010000-0000-0000-0000-000000000031', 'Mra', 'StudentA', 'HS9', :'v_student_a'::uuid),
  ('f2010000-0000-0000-0000-000000000042', 'f2010000-0000-0000-0000-000000000031', 'Mra', 'StudentB', 'HS9', :'v_student_b'::uuid),
  ('f2010000-0000-0000-0000-000000000043', 'f2010000-0000-0000-0000-000000000031', 'Mra', 'StudentC', 'HS9', :'v_student_c'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  ('f2010000-0000-0000-0000-000000000041', 'f2010000-0000-0000-0000-0000000000a1', 'f2010000-0000-0000-0000-000000000011', 'active'),
  ('f2010000-0000-0000-0000-000000000042', 'f2010000-0000-0000-0000-0000000000b1', 'f2010000-0000-0000-0000-000000000011', 'active'),
  ('f2010000-0000-0000-0000-000000000043', 'f2010000-0000-0000-0000-0000000000c1', 'f2010000-0000-0000-0000-000000000012', 'active');

-- One active grant per user (partial unique index), matching the claims each caller presents.
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_teacher_a'::uuid,  'teacher',        'class',   'f2010000-0000-0000-0000-0000000000a1', true),
  (:'v_teacher_a2'::uuid, 'teacher',        'class',   'f2010000-0000-0000-0000-0000000000a1', true),
  (:'v_teacher_b'::uuid,  'teacher',        'class',   'f2010000-0000-0000-0000-0000000000b1', true),
  -- multi: teaches A (active) and B (inactive); presents a class-B token in the mismatch case.
  (:'v_multi'::uuid,      'teacher',        'class',   'f2010000-0000-0000-0000-0000000000a1', true),
  (:'v_multi'::uuid,      'teacher',        'class',   'f2010000-0000-0000-0000-0000000000b1', false),
  -- tp: Teacher+Parent user, currently switched to parent.
  (:'v_tp'::uuid,         'teacher',        'class',   'f2010000-0000-0000-0000-0000000000a1', false),
  (:'v_tp'::uuid,         'parent',         'org',     null, true),
  (:'v_coord_1'::uuid,    'coordinator',    'session', 'f2010000-0000-0000-0000-000000000011', true),
  (:'v_coord_1b'::uuid,   'coordinator',    'session', 'f2010000-0000-0000-0000-000000000011', true),
  (:'v_coord_2'::uuid,    'coordinator',    'session', 'f2010000-0000-0000-0000-000000000012', true),
  (:'v_bvc'::uuid,        'bv_coordinator', 'org',     null, true),
  (:'v_admin'::uuid,      'admin',          'org',     null, true);

select id as v_conv_a from conversations where kind = 'class' and scope_id = 'f2010000-0000-0000-0000-0000000000a1'::uuid \gset
select id as v_conv_b from conversations where kind = 'class' and scope_id = 'f2010000-0000-0000-0000-0000000000b1'::uuid \gset
select id as v_conv_c from conversations where kind = 'class' and scope_id = 'f2010000-0000-0000-0000-0000000000c1'::uuid \gset
select id as v_conv_s1 from conversations where kind = 'session_staff' and scope_id = 'f2010000-0000-0000-0000-000000000011'::uuid \gset

-- Messages, inserted as the superuser. The insert trigger stamps sender_role from the sender's
-- participant role; rows whose sender is not a participant are then given the role under test
-- explicitly, so the ONLY reason for a refusal is the property being tested.
insert into messages (id, conversation_id, sender_user_id, body, mention_targets) values
  ('f2010000-0000-0000-0000-000000000101', :'v_conv_a'::uuid,  :'v_student_a'::uuid,  'student A probe',      array[]::text[]),
  ('f2010000-0000-0000-0000-000000000102', :'v_conv_a'::uuid,  :'v_student_a'::uuid,  'student A for multi',  array[]::text[]),
  ('f2010000-0000-0000-0000-000000000103', :'v_conv_a'::uuid,  :'v_teacher_a2'::uuid, 'teacher A2 says',      array[]::text[]),
  ('f2010000-0000-0000-0000-000000000104', :'v_conv_a'::uuid,  :'v_student_a'::uuid,  'student A for teacher', array[:'v_teacher_a']::text[]),
  ('f2010000-0000-0000-0000-000000000105', :'v_conv_a'::uuid,  :'v_coord_1b'::uuid,   'coordinator says',     array[]::text[]),
  ('f2010000-0000-0000-0000-000000000106', :'v_conv_a'::uuid,  :'v_teacher_a'::uuid,  'teacher A own',        array[]::text[]),
  ('f2010000-0000-0000-0000-000000000107', :'v_conv_s1'::uuid, :'v_parent_a'::uuid,   'parent in staff conv', array[]::text[]),
  ('f2010000-0000-0000-0000-000000000108', :'v_conv_a'::uuid,  :'v_parent_a'::uuid,   'parent A says',        array[]::text[]),
  ('f2010000-0000-0000-0000-000000000109', :'v_conv_a'::uuid,  :'v_student_a'::uuid,  'student A for tp',     array[]::text[]),
  ('f2010000-0000-0000-0000-000000000110', :'v_conv_a'::uuid,  :'v_teacher_a2'::uuid, 'teacher A2 again',     array[]::text[]),
  ('f2010000-0000-0000-0000-000000000111', :'v_conv_c'::uuid,  :'v_student_c'::uuid,  'student C says',       array[]::text[]),
  ('f2010000-0000-0000-0000-000000000112', :'v_conv_a'::uuid,  :'v_bvc'::uuid,        'bv coordinator says',  array[]::text[]),
  ('f2010000-0000-0000-0000-000000000113', :'v_conv_a'::uuid,  :'v_student_a'::uuid,  'student A unresolved', array[]::text[]),
  ('f2010000-0000-0000-0000-000000000114', :'v_conv_b'::uuid,  :'v_student_b'::uuid,  'student B says',       array[]::text[]),
  ('f2010000-0000-0000-0000-000000000115', :'v_conv_a'::uuid,  :'v_admin'::uuid,      'admin says',           array[]::text[]);

update messages set sender_role = 'coordinator'    where id = 'f2010000-0000-0000-0000-000000000105';
update messages set sender_role = 'student'        where id = 'f2010000-0000-0000-0000-000000000106'; -- isolate the self check
update messages set sender_role = 'parent'         where id = 'f2010000-0000-0000-0000-000000000107';
update messages set sender_role = 'bv_coordinator' where id = 'f2010000-0000-0000-0000-000000000112';
update messages set sender_role = null             where id = 'f2010000-0000-0000-0000-000000000113';
update messages set sender_role = 'admin'          where id = 'f2010000-0000-0000-0000-000000000115';

-- Fixture sanity: the stamped and forced roles are what each test assumes.
select is(
  (select string_agg(right(id::text, 3) || '=' || coalesce(sender_role, '<null>'), ',' order by id)
     from messages where id::text like 'f2010000-0000-0000-0000-000000000___'),
  '101=student,102=student,103=teacher,104=student,105=coordinator,106=student,107=parent,108=parent,'
  || '109=student,110=teacher,111=student,112=bv_coordinator,113=<null>,114=student,115=admin',
  'fixture: every message carries the sender_role its test assumes'
);

-- ---------------------------------------------------------------------------------------------
-- Index shape (Task 1 review)
-- ---------------------------------------------------------------------------------------------
select is(
  (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'messages_removed_idx'),
  'CREATE INDEX messages_removed_idx ON public.messages USING btree (conversation_id, removed_at) WHERE (removed_at IS NOT NULL)',
  'messages_removed_idx is on (conversation_id, removed_at) where removed_at is not null'
);

-- ---------------------------------------------------------------------------------------------
-- Teacher rung
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_teacher_b'::uuid, 'teacher', 'class', 'f2010000-0000-0000-0000-0000000000b1');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'teacher_other_class_refused: the class-B teacher cannot remove a student message in class A');
select lives_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000114'),
  'CONTROL teacher_other_class: the same class-B teacher removes a student message in class B');
select tests.clear_authentication();

-- multi's active grant is A, so the only failing check is the token's scope (B) vs the class (A).
select tests.authenticate_as(:'v_multi'::uuid, 'teacher', 'class', 'f2010000-0000-0000-0000-0000000000b1');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'teacher_scope_mismatch_refused: a class-B token cannot remove in class A even though the user teaches A');
select tests.clear_authentication();
select tests.authenticate_as(:'v_multi'::uuid, 'teacher', 'class', 'f2010000-0000-0000-0000-0000000000a1');
select lives_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000102'),
  'CONTROL teacher_scope_mismatch: the same user with a class-A token removes a class-A student message');
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'f2010000-0000-0000-0000-0000000000a1');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000103'),
  '42501', null, 'teacher_on_teacher_refused: a teacher cannot remove another teacher''s message');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000105'),
  '42501', null, 'teacher_on_coordinator_refused: a teacher cannot remove a coordinator''s message');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000106'),
  '42501', null, 'self_removal_refused: a teacher cannot remove their own message (even one stamped student)');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000113'),
  '42501', null, 'null_sender_role_fail_closed: a teacher cannot remove a message whose sender_role is null');
select lives_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000104'),
  'CONTROL teacher rung: the same class-A teacher removes a class-A student message');
select tests.clear_authentication();

-- tp holds an inactive class-A teacher grant and is switched to parent.
select tests.authenticate_as(:'v_tp'::uuid, 'parent', 'org', null);
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'active_role_parent_refused: a Teacher+Parent user switched to parent cannot remove');
select tests.clear_authentication();
-- And a teacher token alone is not enough while the teacher grant is inactive (stale token).
select tests.authenticate_as(:'v_tp'::uuid, 'teacher', 'class', 'f2010000-0000-0000-0000-0000000000a1');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'active_role_parent_refused: a stale teacher token without an active teacher grant is refused');
select tests.clear_authentication();
update user_roles set is_active = false where user_id = :'v_tp'::uuid and role = 'parent';
update user_roles set is_active = true  where user_id = :'v_tp'::uuid and role = 'teacher';
select tests.authenticate_as(:'v_tp'::uuid, 'teacher', 'class', 'f2010000-0000-0000-0000-0000000000a1');
select lives_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000109'),
  'CONTROL active_role_parent: the same user switched to teacher removes a class-A student message');
select tests.clear_authentication();

-- The class-A teacher's own token (whose CONTROL above succeeds) with ONLY active_role removed, so
-- the scope claims and the live grant are all valid and the missing role is the sole difference.
select set_config('request.jwt.claims',
  json_build_object('sub', :'v_teacher_a', 'role', 'authenticated',
                    'scope_type', 'class', 'scope_id', 'f2010000-0000-0000-0000-0000000000a1')::text, true);
set local role authenticated;
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'no_claims_refused: an authenticated caller with no active_role cannot remove');
reset role;
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- Coordinator rung
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_coord_1'::uuid, 'coordinator', 'session', 'f2010000-0000-0000-0000-000000000011');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000107'),
  '42501', null, 'non_class_conversation_refused: a parent message in a session_staff conversation cannot be removed');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000105'),
  '42501', null, 'coordinator_on_coordinator_refused: a coordinator cannot remove another coordinator''s message');
select lives_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000108'),
  'CONTROL non_class_conversation: the same coordinator removes a parent message in a class chat');
select is(
  (select (r).removed_by_role || '|' || ((r).body is null)::text
     from (select public.remove_message('f2010000-0000-0000-0000-000000000110'::uuid) as r offset 0) x),
  'coordinator|true',
  'coordinator_in_session_allowed: a session coordinator removes a teacher message in that session''s class'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_2'::uuid, 'coordinator', 'session', 'f2010000-0000-0000-0000-000000000012');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'coordinator_other_session_refused: a coordinator of another session cannot remove in class A');
select lives_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000111'),
  'CONTROL coordinator_other_session: the same coordinator removes a student message in their own session');
select tests.clear_authentication();
-- Token scope and live grant are each required: an S1 coordinator holding a session-2 token, and an
-- S2 coordinator holding a session-1 token (no S1 grant), are both refused.
select tests.authenticate_as(:'v_coord_1'::uuid, 'coordinator', 'session', 'f2010000-0000-0000-0000-000000000012');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'coordinator_other_session_refused: a session-2 token cannot remove in session 1, even for a session-1 coordinator');
select tests.clear_authentication();
select tests.authenticate_as(:'v_coord_2'::uuid, 'coordinator', 'session', 'f2010000-0000-0000-0000-000000000011');
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'coordinator_other_session_refused: a session-1 token without a live session-1 grant is refused');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- BV Coordinator / Admin rung
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000112'),
  '42501', null, 'admin_on_bv_coordinator_refused: an admin cannot remove a bv_coordinator''s message');
select is(
  (select (r).removed_by_role || '|' || ((r).body is null)::text
     from (select public.remove_message('f2010000-0000-0000-0000-000000000105'::uuid) as r offset 0) x),
  'admin|true',
  'admin_on_coordinator_allowed: an admin removes a coordinator''s message'
);
-- The admin is org-wide with no scope check, so only the kind check stops it here: this isolates
-- non_class_conversation_refused from the coordinator's scope check.
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000107'),
  '42501', null, 'non_class_conversation_refused: even an admin cannot remove in a session_staff conversation');
select tests.clear_authentication();
-- An admin token without a live admin grant (the class-A teacher, whose own grant is live) is refused.
select tests.authenticate_as(:'v_teacher_a'::uuid, 'admin', 'org', null);
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', null, 'admin token without an active admin grant is refused');
select tests.clear_authentication();

select tests.authenticate_as(:'v_bvc'::uuid, 'bv_coordinator', 'org', null);
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000115'),
  '42501', null, 'bv_coordinator_on_admin_refused: a bv_coordinator cannot remove an admin''s message (same rung)');
select is(
  (select (r).removed_by_role || '|' || ((r).body is null)::text
     from (select public.remove_message('f2010000-0000-0000-0000-000000000113'::uuid) as r offset 0) x),
  'bv_coordinator|true',
  'null_sender_role_fail_closed: a bv_coordinator removes the null-sender_role message'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- Unauthenticated
-- ---------------------------------------------------------------------------------------------
-- The function body would also raise 42501 for a null auth.uid(), so the privilege itself is pinned
-- (anon and PUBLIC hold no EXECUTE) and the runtime error message must be the privilege error.
select ok(not has_function_privilege('anon', 'public.remove_message(uuid)', 'execute'),
  'anon_cannot_execute: anon holds no EXECUTE privilege on remove_message');
select ok(not exists (
    select 1 from pg_proc p,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'public.remove_message(uuid)'::regprocedure
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'anon_cannot_execute: PUBLIC holds no EXECUTE privilege on remove_message');
set local role anon;
select throws_ok(format('select public.remove_message(%L::uuid)', 'f2010000-0000-0000-0000-000000000101'),
  '42501', 'permission denied for function remove_message',
  'anon_cannot_execute: an unauthenticated caller is refused by the missing privilege, not the body');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Refusals left no trace (each raised and rolled back its own work).
-- ---------------------------------------------------------------------------------------------
select is(
  (select string_agg(right(m.id::text, 3) || '=' || (m.body is not null and m.removed_at is null)::text, ',' order by m.id)
     from messages m
    where m.id in ('f2010000-0000-0000-0000-000000000101', 'f2010000-0000-0000-0000-000000000103',
                   'f2010000-0000-0000-0000-000000000106', 'f2010000-0000-0000-0000-000000000107',
                   'f2010000-0000-0000-0000-000000000112', 'f2010000-0000-0000-0000-000000000115')),
  '101=true,103=true,106=true,107=true,112=true,115=true',
  'refused targets are untouched: body present, removed_at null'
);
select is(
  (select count(*) from message_removals
    where message_id in ('f2010000-0000-0000-0000-000000000101', 'f2010000-0000-0000-0000-000000000103',
                         'f2010000-0000-0000-0000-000000000106', 'f2010000-0000-0000-0000-000000000107',
                         'f2010000-0000-0000-0000-000000000112', 'f2010000-0000-0000-0000-000000000115'))::int
  + (select count(*) from audit_log
    where action = 'remove'
      and target_id in ('f2010000-0000-0000-0000-000000000101', 'f2010000-0000-0000-0000-000000000103',
                        'f2010000-0000-0000-0000-000000000106', 'f2010000-0000-0000-0000-000000000107',
                        'f2010000-0000-0000-0000-000000000112', 'f2010000-0000-0000-0000-000000000115'))::int,
  0,
  'refused targets have no side-table row and no remove audit entry'
);
select is(
  (select count(*) from messages
    where id in ('f2010000-0000-0000-0000-000000000102', 'f2010000-0000-0000-0000-000000000104',
                 'f2010000-0000-0000-0000-000000000105', 'f2010000-0000-0000-0000-000000000108',
                 'f2010000-0000-0000-0000-000000000109', 'f2010000-0000-0000-0000-000000000110',
                 'f2010000-0000-0000-0000-000000000111', 'f2010000-0000-0000-0000-000000000113',
                 'f2010000-0000-0000-0000-000000000114')
      and body is null and removed_at is not null)::int,
  9,
  'every CONTROL / allowed removal actually removed its message'
);

-- ---------------------------------------------------------------------------------------------
-- Unreadability, as a student, a parent and a teacher in class A. Message 104 was removed by the
-- class-A teacher and originally carried a mention, so '{}' proves the mentions were cleared.
-- The coalesce makes an invisible row (null) fail instead of passing vacuously.
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student_a'::uuid, 'student', 'org', null);
select throws_ok('select * from message_removals', '42501', null,
  'message_removals_unreadable: a student cannot read message_removals');
select is(
  (select coalesce(body, '<null>') || '|' || mention_targets::text from messages where id = 'f2010000-0000-0000-0000-000000000104'),
  '<null>|{}', 'removed_body_unreadable: a student sees body null and mentions empty');
select throws_ok(format('update messages set body = %L where id = %L::uuid', 'restored', 'f2010000-0000-0000-0000-000000000104'),
  '42501', null, 'no_update_on_messages: a student cannot update messages');
select tests.clear_authentication();

select tests.authenticate_as(:'v_parent_a'::uuid, 'parent', 'org', null);
select throws_ok('select * from message_removals', '42501', null,
  'message_removals_unreadable: a parent cannot read message_removals');
select is(
  (select coalesce(body, '<null>') || '|' || mention_targets::text from messages where id = 'f2010000-0000-0000-0000-000000000104'),
  '<null>|{}', 'removed_body_unreadable: a parent sees body null and mentions empty');
select throws_ok(format('update messages set body = %L where id = %L::uuid', 'restored', 'f2010000-0000-0000-0000-000000000104'),
  '42501', null, 'no_update_on_messages: a parent cannot update messages');
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'f2010000-0000-0000-0000-0000000000a1');
select throws_ok('select * from message_removals', '42501', null,
  'message_removals_unreadable: the class teacher (the remover) cannot read message_removals');
select is(
  (select coalesce(body, '<null>') || '|' || mention_targets::text from messages where id = 'f2010000-0000-0000-0000-000000000104'),
  '<null>|{}', 'removed_body_unreadable: the class teacher sees body null and mentions empty');
select throws_ok(format('update messages set body = %L where id = %L::uuid', 'restored', 'f2010000-0000-0000-0000-000000000104'),
  '42501', null, 'no_update_on_messages: the class teacher cannot update messages');
-- CONTROL for the unreadability block: the same reader sees an unremoved message's text.
select is(
  (select body from messages where id = 'f2010000-0000-0000-0000-000000000101'),
  'student A probe', 'CONTROL removed_body_unreadable: the class teacher reads an unremoved message''s text');
select tests.clear_authentication();

-- The moved-aside text is intact and the update attempts changed nothing.
select is(
  (select mr.body || '|' || mr.mention_targets::text || '|' || mr.removed_by_role
     from message_removals mr where mr.message_id = 'f2010000-0000-0000-0000-000000000104'),
  'student A for teacher|{' || :'v_teacher_a' || '}|teacher',
  'the moved-aside text for 104 is intact after the client update attempts'
);

select * from finish();
rollback;

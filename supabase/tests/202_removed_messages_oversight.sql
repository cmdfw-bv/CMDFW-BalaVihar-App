-- Teacher -> chat-message-removal (issue #113, ADR-2026-11-14-chat-message-removal-move-aside).
-- Oversight review list (get_removed_messages_for_oversight) and the extended
-- audit_log_coordinator_read policy (spec "Design -> Data & RLS impact").
--
-- Callers always run as `authenticated` with JWT claims, or as `anon`; never
-- tests.clear_authentication() as an "unauthorized" stand-in (it resets to a superuser).
-- clear_authentication() is used only to return to the superuser between steps.
-- Every "hidden from another session" assertion is paired with a "visible in-session" control
-- on the same row, so a hide cannot pass because the row was never there.
begin;
select plan(46);

-- ---------------------------------------------------------------------------------------------
-- Fixture. Session S holds class A; session T holds class C.
-- ---------------------------------------------------------------------------------------------
insert into centers (id, name) values ('f2020000-0000-0000-0000-000000000001', 'RMO Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('f2020000-0000-0000-0000-000000000011', 'f2020000-0000-0000-0000-000000000001', 'RMO Session S', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('f2020000-0000-0000-0000-000000000012', 'f2020000-0000-0000-0000-000000000001', 'RMO Session T', '2026-01-01', '2026-06-01', 6, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('f2020000-0000-0000-0000-0000000000a1', 'f2020000-0000-0000-0000-000000000011', 'RMO Class A', 'HS9-12'),
  ('f2020000-0000-0000-0000-0000000000c1', 'f2020000-0000-0000-0000-000000000012', 'RMO Class C', 'HS9-12');
insert into families (id, label) values
  ('f2020000-0000-0000-0000-000000000031', 'Mehta Family'),
  ('f2020000-0000-0000-0000-000000000032', 'Rao Family');

select tests.create_supabase_user('rmo-student-a@test.local') as v_student_a \gset
select tests.create_supabase_user('rmo-student-c@test.local') as v_student_c \gset
select tests.create_supabase_user('rmo-parent-a@test.local') as v_parent_a \gset
select tests.create_supabase_user('rmo-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('rmo-teacher-c@test.local') as v_teacher_c \gset
select tests.create_supabase_user('rmo-coord-s@test.local') as v_coord_s \gset
select tests.create_supabase_user('rmo-coord-t@test.local') as v_coord_t \gset
select tests.create_supabase_user('rmo-coord-stale@test.local') as v_coord_stale \gset
select tests.create_supabase_user('rmo-admin@test.local') as v_admin \gset
select tests.create_supabase_user('rmo-nobody@test.local') as v_nobody \gset

insert into family_members (family_id, user_id, relationship)
  values ('f2020000-0000-0000-0000-000000000031', :'v_parent_a'::uuid, 'parent');
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('f2020000-0000-0000-0000-000000000041', 'f2020000-0000-0000-0000-000000000031', 'Aarav', 'Mehta', 'HS9', :'v_student_a'::uuid),
  ('f2020000-0000-0000-0000-000000000043', 'f2020000-0000-0000-0000-000000000032', 'Kavya', 'Rao',   'HS9', :'v_student_c'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  ('f2020000-0000-0000-0000-000000000041', 'f2020000-0000-0000-0000-0000000000a1', 'f2020000-0000-0000-0000-000000000011', 'active'),
  ('f2020000-0000-0000-0000-000000000043', 'f2020000-0000-0000-0000-0000000000c1', 'f2020000-0000-0000-0000-000000000012', 'active');

insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_teacher_a'::uuid,     'teacher',     'class',   'f2020000-0000-0000-0000-0000000000a1', true),
  (:'v_teacher_c'::uuid,     'teacher',     'class',   'f2020000-0000-0000-0000-0000000000c1', true),
  (:'v_coord_s'::uuid,       'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011', true),
  (:'v_coord_t'::uuid,       'coordinator', 'session', 'f2020000-0000-0000-0000-000000000012', true),
  (:'v_coord_stale'::uuid,   'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011', false),
  (:'v_admin'::uuid,         'admin',       'org',     null, true);

select id as v_conv_a from conversations where kind = 'class' and scope_id = 'f2020000-0000-0000-0000-0000000000a1'::uuid \gset
select id as v_conv_c from conversations where kind = 'class' and scope_id = 'f2020000-0000-0000-0000-0000000000c1'::uuid \gset

insert into messages (id, conversation_id, sender_user_id, body, mention_targets) values
  ('f2020000-0000-0000-0000-000000000101', :'v_conv_a'::uuid, :'v_student_a'::uuid, 'student A original text', array[]::text[]),
  ('f2020000-0000-0000-0000-000000000102', :'v_conv_a'::uuid, :'v_parent_a'::uuid,  'parent A original text',  array[]::text[]),
  ('f2020000-0000-0000-0000-000000000103', :'v_conv_a'::uuid, :'v_teacher_a'::uuid, 'teacher A original text', array[]::text[]),
  ('f2020000-0000-0000-0000-000000000111', :'v_conv_c'::uuid, :'v_student_c'::uuid, 'student C original text', array[]::text[]),
  ('f2020000-0000-0000-0000-000000000112', :'v_conv_c'::uuid, :'v_nobody'::uuid,    'unknown sender text',     array[]::text[]);

select is(
  (select string_agg(right(id::text, 3) || '=' || coalesce(sender_role, '<null>'), ',' order by id)
     from messages where id::text like 'f2020000-0000-0000-0000-000000000___'),
  '101=student,102=parent,103=teacher,111=student,112=<null>',
  'fixture: every message carries the sender_role its test assumes'
);

-- Real removals through remove_message.
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'f2020000-0000-0000-0000-0000000000a1');
select public.remove_message('f2020000-0000-0000-0000-000000000101'::uuid);
select public.remove_message('f2020000-0000-0000-0000-000000000102'::uuid);
select tests.clear_authentication();
select tests.authenticate_as(:'v_coord_s'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select public.remove_message('f2020000-0000-0000-0000-000000000103'::uuid);
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher_c'::uuid, 'teacher', 'class', 'f2020000-0000-0000-0000-0000000000c1');
select public.remove_message('f2020000-0000-0000-0000-000000000111'::uuid);
select tests.clear_authentication();
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select public.remove_message('f2020000-0000-0000-0000-000000000112'::uuid);
select tests.clear_authentication();

select is(
  (select count(*) from message_removals where message_id::text like 'f2020000-0000-0000-0000-000000000___'),
  5::bigint,
  'fixture: all five removals landed'
);

-- ---------------------------------------------------------------------------------------------
-- Privileges: anon/PUBLIC hold no EXECUTE (pinned directly, not only via a throws_ok).
-- ---------------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.get_removed_messages_for_oversight(timestamptz, uuid, int)', 'execute'),
  'anon_cannot_execute: anon holds no EXECUTE privilege on get_removed_messages_for_oversight');
select ok(not exists (
    select 1 from pg_proc p,
           aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.oid = 'public.get_removed_messages_for_oversight(timestamptz, uuid, int)'::regprocedure
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'anon_cannot_execute: PUBLIC holds no EXECUTE privilege on get_removed_messages_for_oversight');
select ok(has_function_privilege('authenticated', 'public.get_removed_messages_for_oversight(timestamptz, uuid, int)', 'execute'),
  'authenticated holds EXECUTE on get_removed_messages_for_oversight');
set local role anon;
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', 'permission denied for function get_removed_messages_for_oversight',
  'anon_cannot_execute: an unauthenticated caller is refused by the missing privilege');
reset role;

-- ---------------------------------------------------------------------------------------------
-- Refusals (42501). The coordinator CONTROLS below use the same call and succeed.
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'f2020000-0000-0000-0000-0000000000a1');
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', null, 'teacher_refused: a teacher cannot open the oversight review list');
select tests.clear_authentication();

select tests.authenticate_as(:'v_student_a'::uuid, 'student', 'class', 'f2020000-0000-0000-0000-0000000000a1');
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', null, 'student_refused: a student cannot open the oversight review list');
select tests.clear_authentication();

select tests.authenticate_as(:'v_parent_a'::uuid, 'parent', 'org', null);
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', null, 'parent_refused: a parent cannot open the oversight review list');
select tests.clear_authentication();

-- coord_s's valid token with ONLY active_role removed.
select set_config('request.jwt.claims',
  json_build_object('sub', :'v_coord_s', 'role', 'authenticated',
                    'scope_type', 'session', 'scope_id', 'f2020000-0000-0000-0000-000000000011')::text, true);
set local role authenticated;
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', null, 'no_claims_refused: an authenticated caller with no active_role is refused');
reset role;
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_s'::uuid, 'coordinator', 'session', null);
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', null, 'coord_null_scope_refused: a coordinator token with no scope_id fails closed');
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_stale'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', null, 'coord_stale_grant_refused: a coordinator token without a live active grant is refused');
select tests.clear_authentication();

-- coord_t's token claiming session S (its live grant is T).
select tests.authenticate_as(:'v_coord_t'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select throws_ok('select * from public.get_removed_messages_for_oversight()',
  '42501', null, 'coord_scope_mismatch_refused: a session-S token is refused when the live grant is session T');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- review_audit_per_row: coord_s's FIRST review call returns exactly the 3 class-A removals and
-- writes exactly 3 'read' rows.
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*) from audit_log where actor_user_id = :'v_coord_s'::uuid and action = 'read'),
  0::bigint,
  'review_audit_per_row: no read rows for coord_s before the call'
);
select tests.authenticate_as(:'v_coord_s'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select is(
  (select count(*) from public.get_removed_messages_for_oversight(null, null, 50)),
  3::bigint,
  'review_audit_per_row: the coordinator call returns 3 rows'
);
select tests.clear_authentication();
select is(
  (select count(*) from audit_log where actor_user_id = :'v_coord_s'::uuid and action = 'read'),
  3::bigint,
  'review_audit_per_row: one call returning 3 rows adds exactly 3 read rows'
);
select is(
  (select string_agg(right(target_id::text, 3) || ':' || actor_role || ':' || target_table || ':'
                     || coalesce(target_student_id::text, '<null>'), ',' order by target_id)
     from audit_log where actor_user_id = :'v_coord_s'::uuid and action = 'read'),
  '101:coordinator:messages:f2020000-0000-0000-0000-000000000041,'
  || '102:coordinator:messages:<null>,103:coordinator:messages:<null>',
  'review_audit_per_row: actor role, target_table=messages, target_student_id only for the student sender'
);

-- ---------------------------------------------------------------------------------------------
-- coordinator_scoped / admin_org_wide
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_coord_s'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select is(
  (select string_agg(right(message_id::text, 3), ',' order by message_id)
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id::text like 'f2020000-0000-0000-0000-000000000___'),
  '101,102,103',
  'coordinator_scoped: the session-S coordinator sees the class-A removals'
);
select is(
  (select count(*) from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id in ('f2020000-0000-0000-0000-000000000111', 'f2020000-0000-0000-0000-000000000112')),
  0::bigint,
  'coordinator_scoped: the session-S coordinator sees none of session T''s removals'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_t'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000012');
select is(
  (select string_agg(right(message_id::text, 3), ',' order by message_id)
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id::text like 'f2020000-0000-0000-0000-000000000___'),
  '111,112',
  'coordinator_scoped: the session-T coordinator sees only the class-C removals'
);
select tests.clear_authentication();

select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is(
  (select string_agg(right(message_id::text, 3), ',' order by message_id)
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id::text like 'f2020000-0000-0000-0000-000000000___'),
  '101,102,103,111,112',
  'admin_org_wide: an admin sees removals from both sessions'
);

-- ---------------------------------------------------------------------------------------------
-- review_returns_text_and_labels (as the admin)
-- ---------------------------------------------------------------------------------------------
select is(
  (select body || '|' || sender_label || '|' || sender_role || '|' || class_name || '|'
          || remover_label || '|' || removed_by_role
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id = 'f2020000-0000-0000-0000-000000000101'),
  'student A original text|Aarav M.|student|RMO Class A|the RMO Class A teacher|teacher',
  'review_returns_text_and_labels: student row has the original body, "Aarav M." and the class-teacher remover label'
);
select is(
  (select body || '|' || sender_label || '|' || remover_label
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id = 'f2020000-0000-0000-0000-000000000102'),
  'parent A original text|Parent · Mehta Family|the RMO Class A teacher',
  'review_returns_text_and_labels: parent row is labelled "Parent · <family label>"'
);
select is(
  (select body || '|' || sender_label || '|' || remover_label || '|' || removed_by_role
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id = 'f2020000-0000-0000-0000-000000000103'),
  'teacher A original text|teacher|a coordinator|coordinator',
  'review_returns_text_and_labels: staff sender labelled by role; coordinator remover is "a coordinator"'
);
select is(
  (select body || '|' || sender_label || '|' || coalesce(sender_role, '<null>') || '|' || remover_label
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id = 'f2020000-0000-0000-0000-000000000112'),
  'unknown sender text|Unknown sender|<null>|an admin',
  'review_returns_text_and_labels: null sender_role is "Unknown sender"; admin remover is "an admin"'
);
select tests.clear_authentication();
select created_at as v_101_created, removed_at as v_101_removed
  from messages where id = 'f2020000-0000-0000-0000-000000000101' \gset
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is(
  (select created_at = :'v_101_created'::timestamptz and removed_at = :'v_101_removed'::timestamptz
     from public.get_removed_messages_for_oversight(null, null, 50)
    where message_id = 'f2020000-0000-0000-0000-000000000101'),
  true,
  'review_returns_text_and_labels: created_at and removed_at match the message row'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- coord_policy_old_clauses_pinned: each pre-existing clause of audit_log_coordinator_read still
-- holds after the policy is recreated (visible in-session, hidden from another session).
-- ---------------------------------------------------------------------------------------------
insert into audit_log (id, actor_user_id, actor_role, action, target_table, target_id, target_student_id) values
  ('f2020000-0000-0000-0000-000000000901', :'v_admin'::uuid, 'admin', 'read', 'students',   'f2020000-0000-0000-0000-000000000041', 'f2020000-0000-0000-0000-000000000041'),
  ('f2020000-0000-0000-0000-000000000902', :'v_admin'::uuid, 'admin', 'read', 'classes',    'f2020000-0000-0000-0000-0000000000a1', null),
  ('f2020000-0000-0000-0000-000000000903', :'v_admin'::uuid, 'admin', 'read', 'attendance', 'f2020000-0000-0000-0000-000000000011', null),
  ('f2020000-0000-0000-0000-000000000904', :'v_admin'::uuid, 'admin', 'read', 'sessions',   'f2020000-0000-0000-0000-000000000011', null);

select tests.authenticate_as(:'v_coord_s'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000901'), 1::bigint,
  'coord_policy_old_clauses_pinned: student-target row visible to the in-session coordinator');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000902'), 1::bigint,
  'coord_policy_old_clauses_pinned: classes row visible to the in-session coordinator');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000903'), 1::bigint,
  'coord_policy_old_clauses_pinned: attendance (session-scoped) row visible to the in-session coordinator');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000904'), 1::bigint,
  'coord_policy_old_clauses_pinned: sessions (session-scoped) row visible to the in-session coordinator');
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_t'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000012');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000901'), 0::bigint,
  'coord_policy_old_clauses_pinned: student-target row hidden from another session''s coordinator');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000902'), 0::bigint,
  'coord_policy_old_clauses_pinned: classes row hidden from another session''s coordinator');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000903'), 0::bigint,
  'coord_policy_old_clauses_pinned: attendance row hidden from another session''s coordinator');
select is((select count(*) from audit_log where id = 'f2020000-0000-0000-0000-000000000904'), 0::bigint,
  'coord_policy_old_clauses_pinned: sessions row hidden from another session''s coordinator');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- coord_sees_parent_removal_entry: the new messages clause. The parent message's 'remove' row
-- has no target_student_id, so no old clause can be what makes it visible.
-- ---------------------------------------------------------------------------------------------
select id as v_parent_remove_row from audit_log
 where action = 'remove' and target_table = 'messages'
   and target_id = 'f2020000-0000-0000-0000-000000000102' \gset
select id as v_c_remove_row from audit_log
 where action = 'remove' and target_table = 'messages'
   and target_id = 'f2020000-0000-0000-0000-000000000112' \gset

select is(
  (select target_student_id from audit_log where id = :'v_parent_remove_row'::uuid),
  null::uuid,
  'coord_sees_parent_removal_entry: the parent removal row carries no target_student_id'
);

select tests.authenticate_as(:'v_coord_s'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select is((select count(*) from audit_log where id = :'v_parent_remove_row'::uuid), 1::bigint,
  'coord_sees_parent_removal_entry: the session-S coordinator sees the remove row for a parent message in class A');
select is((select count(*) from audit_log where id = :'v_c_remove_row'::uuid), 0::bigint,
  'coord_sees_parent_removal_entry: the session-S coordinator does not see a session-T message removal row');
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_t'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000012');
select is((select count(*) from audit_log where id = :'v_parent_remove_row'::uuid), 0::bigint,
  'coord_sees_parent_removal_entry: the session-T coordinator does not see that remove row');
select is((select count(*) from audit_log where id = :'v_c_remove_row'::uuid), 1::bigint,
  'coord_sees_parent_removal_entry: CONTROL the session-T coordinator sees its own session''s message removal row');
select tests.clear_authentication();

-- The review 'read' rows for parent/teacher messages (no target_student_id) are visible the same way.
select tests.authenticate_as(:'v_coord_s'::uuid, 'coordinator', 'session', 'f2020000-0000-0000-0000-000000000011');
select is(
  (select count(distinct target_id) from audit_log where action = 'read' and target_table = 'messages'
      and target_id in ('f2020000-0000-0000-0000-000000000102', 'f2020000-0000-0000-0000-000000000103')
      and actor_user_id = :'v_coord_s'::uuid),
  2::bigint,
  'coord_sees_parent_removal_entry: the coordinator sees its own review read rows for non-student messages'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- limit_capped_50: 55 more removals in class A (inserted directly, check constraint satisfied).
-- ---------------------------------------------------------------------------------------------
insert into messages (id, conversation_id, sender_user_id, body, mention_targets)
select ('f2020000-0000-0000-0001-' || lpad(g::text, 12, '0'))::uuid, :'v_conv_a'::uuid, :'v_student_a'::uuid,
       'bulk ' || g, array[]::text[]
  from generate_series(1, 55) g;
update messages
   set body = null, removed_at = '2026-01-01 00:00:00+00'::timestamptz + make_interval(secs => right(id::text, 2)::int),
       removed_by_role = 'teacher'
 where id::text like 'f2020000-0000-0000-0001-%';
insert into message_removals (message_id, conversation_id, body, mention_targets, removed_by_user_id, removed_by_role, removed_at)
select m.id, m.conversation_id, 'bulk', array[]::text[], :'v_teacher_a'::uuid, 'teacher', m.removed_at
  from messages m where m.id::text like 'f2020000-0000-0000-0001-%';

select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is(
  (select count(*) from public.get_removed_messages_for_oversight(null, null, 500)),
  50::bigint,
  'limit_capped_50: p_limit => 500 returns 50 rows'
);
select is(
  (select count(*) from public.get_removed_messages_for_oversight(null, null, null)),
  20::bigint,
  'limit_capped_50: a null p_limit defaults to 20'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- review_keyset_ties: 3 removals with an identical removed_at (newest of all), paged by 2.
-- ---------------------------------------------------------------------------------------------
insert into messages (id, conversation_id, sender_user_id, body, mention_targets) values
  ('f2020000-0000-0000-0002-000000000001', :'v_conv_a'::uuid, :'v_student_a'::uuid, 'tie 1', array[]::text[]),
  ('f2020000-0000-0000-0002-000000000002', :'v_conv_a'::uuid, :'v_student_a'::uuid, 'tie 2', array[]::text[]),
  ('f2020000-0000-0000-0002-000000000003', :'v_conv_a'::uuid, :'v_student_a'::uuid, 'tie 3', array[]::text[]);
update messages
   set body = null, removed_at = '2099-01-01 00:00:00+00', removed_by_role = 'teacher'
 where id::text like 'f2020000-0000-0000-0002-%';
insert into message_removals (message_id, conversation_id, body, mention_targets, removed_by_user_id, removed_by_role, removed_at)
select m.id, m.conversation_id, m.id::text, array[]::text[], :'v_teacher_a'::uuid, 'teacher', m.removed_at
  from messages m where m.id::text like 'f2020000-0000-0000-0002-%';

select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select removed_at as v_p1_at, message_id as v_p1_id
  from public.get_removed_messages_for_oversight(null, null, 2)
 order by removed_at, message_id limit 1 \gset
select is(
  (select string_agg(right(message_id::text, 1), ',' order by removed_at desc, message_id desc)
     from public.get_removed_messages_for_oversight(null, null, 2)),
  '3,2',
  'review_keyset_ties: page 1 is the two highest ids of the tie, newest first'
);
select is(
  (select right(message_id::text, 1) || '@' || removed_at::text
     from public.get_removed_messages_for_oversight(:'v_p1_at'::timestamptz, :'v_p1_id'::uuid, 2)
    limit 1),
  '1@' || '2099-01-01 00:00:00+00'::timestamptz::text,
  'review_keyset_ties: page 2 starts with the third tied removal'
);
select is(
  (select count(*) || '/' || count(distinct message_id) from (
     select message_id from public.get_removed_messages_for_oversight(null, null, 2)
     union all
     select message_id from public.get_removed_messages_for_oversight(:'v_p1_at'::timestamptz, :'v_p1_id'::uuid, 2)
   ) x where message_id::text like 'f2020000-0000-0000-0002-%'),
  '3/3',
  'review_keyset_ties: all 3 tied removals across two pages, no duplicates'
);
select is(
  (select count(*) from public.get_removed_messages_for_oversight(:'v_p1_at'::timestamptz, :'v_p1_id'::uuid, 2)
    where removed_at > :'v_p1_at'::timestamptz
       or (removed_at = :'v_p1_at'::timestamptz and message_id >= :'v_p1_id'::uuid)),
  0::bigint,
  'review_keyset_ties: page 2 holds only rows strictly before the cursor'
);
select tests.clear_authentication();

select * from finish();
rollback;

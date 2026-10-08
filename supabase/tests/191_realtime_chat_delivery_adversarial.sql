-- Adversarial suite for the chat channel policy on realtime.messages (issue #6, ADR-2026-10-07,
-- acceptance criterion 6). Realtime authorizes a channel join by evaluating the realtime.messages
-- policies with the `realtime.topic` setting equal to the requested topic, as the connecting
-- user. rt_visible() reproduces that: set the topic, count what the caller can see.
--
-- Every DENY is paired with a CONTROL on the same topic. Each conversation holds exactly one
-- signal, so a control is `1` and a deny is `0`; no assertion can pass because the table was empty.
--
-- realtime.send() runs `SET LOCAL realtime.topic` in the saving transaction, so after any insert
-- into messages the setting holds that message's topic. Never rely on it: rt_visible() always
-- sets the topic itself.
begin;
select plan(56);

create function public.rt_visible(p_topic text) returns integer
language sql volatile
as $$
  select set_config('realtime.topic', p_topic, true);
  select count(*)::int from realtime.messages;
$$;
grant execute on function public.rt_visible(text) to authenticated, anon;

-- ---------------------------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------------------------
insert into centers (id, name) values ('e6000000-0000-0000-0000-000000000001', 'RT Adv Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('e6000000-0000-0000-0000-000000000011', 'e6000000-0000-0000-0000-000000000001', 'RT Adv S1', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('e6000000-0000-0000-0000-000000000012', 'e6000000-0000-0000-0000-000000000001', 'RT Adv S2', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'RT Adv A (HS)', 'HS9-12'),
  ('e6000000-0000-0000-0000-0000000000b1', 'e6000000-0000-0000-0000-000000000011', 'RT Adv B (HS)', 'HS9-12'),
  ('e6000000-0000-0000-0000-0000000000c1', 'e6000000-0000-0000-0000-000000000011', 'RT Adv K (KG-2)', 'KG, 1, 2'),
  ('e6000000-0000-0000-0000-0000000000d1', 'e6000000-0000-0000-0000-000000000012', 'RT Adv X (HS, other session)', 'HS9-12');

select tests.create_supabase_user('rta-student@test.local') as v_student \gset
select tests.create_supabase_user('rta-parent@test.local') as v_parent \gset
select tests.create_supabase_user('rta-teacher-a@test.local') as v_teacher_a \gset
select tests.create_supabase_user('rta-teacher-x@test.local') as v_teacher_x \gset
select tests.create_supabase_user('rta-coord-1@test.local') as v_coord_1 \gset
select tests.create_supabase_user('rta-coord-2@test.local') as v_coord_2 \gset
select tests.create_supabase_user('rta-bvc@test.local') as v_bvc \gset
select tests.create_supabase_user('rta-admin@test.local') as v_admin \gset
select tests.create_supabase_user('rta-wd-student@test.local') as v_wd_student \gset
select tests.create_supabase_user('rta-wd-parent@test.local') as v_wd_parent \gset
select tests.create_supabase_user('rta-sib-student@test.local') as v_sib_student \gset
select tests.create_supabase_user('rta-sib-parent@test.local') as v_sib_parent \gset
select tests.create_supabase_user('rta-ab-student@test.local') as v_ab_student \gset
select tests.create_supabase_user('rta-re-student@test.local') as v_re_student \gset
select tests.create_supabase_user('rta-k-parent@test.local') as v_k_parent \gset
select tests.create_supabase_user('rta-multirole@test.local') as v_multirole \gset
select tests.create_supabase_user('rta-outsider@test.local') as v_outsider \gset

insert into families (id, label) values
  ('e6000000-0000-0000-0000-000000000031', 'RT Adv Family Enrolled'),
  ('e6000000-0000-0000-0000-000000000032', 'RT Adv Family Withdrawn'),
  ('e6000000-0000-0000-0000-000000000033', 'RT Adv Family Siblings'),
  ('e6000000-0000-0000-0000-000000000034', 'RT Adv Family A-then-B'),
  ('e6000000-0000-0000-0000-000000000035', 'RT Adv Family Re-enrolled'),
  ('e6000000-0000-0000-0000-000000000036', 'RT Adv Family KG');

-- v_multirole is a real second guardian of the enrolled student (-> participant of class A) and
-- holds a real teacher grant on class X (-> participant of class X).
insert into family_members (family_id, user_id, relationship) values
  ('e6000000-0000-0000-0000-000000000031', :'v_parent'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000031', :'v_multirole'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000032', :'v_wd_parent'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000033', :'v_sib_parent'::uuid, 'guardian'),
  ('e6000000-0000-0000-0000-000000000036', :'v_k_parent'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('e6000000-0000-0000-0000-000000000041', 'e6000000-0000-0000-0000-000000000031', 'Enrolled', 'Student', 'HS9', :'v_student'::uuid),
  ('e6000000-0000-0000-0000-000000000042', 'e6000000-0000-0000-0000-000000000032', 'Withdrawn', 'Student', 'HS9', :'v_wd_student'::uuid),
  ('e6000000-0000-0000-0000-000000000043', 'e6000000-0000-0000-0000-000000000033', 'Sibling', 'Leaving', 'HS9', :'v_sib_student'::uuid),
  ('e6000000-0000-0000-0000-000000000044', 'e6000000-0000-0000-0000-000000000033', 'Sibling', 'Staying', 'HS10', null),
  ('e6000000-0000-0000-0000-000000000045', 'e6000000-0000-0000-0000-000000000034', 'AthenB', 'Student', 'HS9', :'v_ab_student'::uuid),
  ('e6000000-0000-0000-0000-000000000046', 'e6000000-0000-0000-0000-000000000035', 'Reenrolled', 'Student', 'HS9', :'v_re_student'::uuid),
  ('e6000000-0000-0000-0000-000000000047', 'e6000000-0000-0000-0000-000000000036', 'Kinder', 'Child', 'KG', null);

insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e6000000-0000-0000-0000-000000000051', 'e6000000-0000-0000-0000-000000000041', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000052', 'e6000000-0000-0000-0000-000000000042', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000053', 'e6000000-0000-0000-0000-000000000043', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000054', 'e6000000-0000-0000-0000-000000000044', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000055', 'e6000000-0000-0000-0000-000000000045', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000056', 'e6000000-0000-0000-0000-000000000046', 'e6000000-0000-0000-0000-0000000000a1', 'e6000000-0000-0000-0000-000000000011', 'active'),
  ('e6000000-0000-0000-0000-000000000057', 'e6000000-0000-0000-0000-000000000047', 'e6000000-0000-0000-0000-0000000000c1', 'e6000000-0000-0000-0000-000000000011', 'active');

insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_teacher_a'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000a1'::uuid),
  (:'v_teacher_x'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid),
  (:'v_multirole'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid),
  (:'v_coord_1'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000011'::uuid),
  (:'v_coord_2'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000012'::uuid),
  (:'v_bvc'::uuid, 'bv_coordinator', 'org', null),
  (:'v_admin'::uuid, 'admin', 'org', null);

select id as v_a from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000a1'::uuid \gset
select id as v_b from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000b1'::uuid \gset
select id as v_k from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000c1'::uuid \gset
select id as v_x from conversations where kind = 'class' and scope_id = 'e6000000-0000-0000-0000-0000000000d1'::uuid \gset
select id as v_staff_1 from conversations where kind = 'session_staff' and scope_id = 'e6000000-0000-0000-0000-000000000011'::uuid \gset
select id as v_staff_2 from conversations where kind = 'session_staff' and scope_id = 'e6000000-0000-0000-0000-000000000012'::uuid \gset
select id as v_lead from conversations where kind = 'leadership' \gset

-- Transitions are driven by UPDATE, the way a real withdrawal happens (a direct insert of a
-- 'withdrawn' row never created a participant row, so it would prove nothing).
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000052';  -- whole family leaves A
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000053';  -- one sibling leaves A, one stays
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000055';  -- leaves A ...
insert into enrollments (student_id, class_id, session_id, status) values                       -- ... joins B
  ('e6000000-0000-0000-0000-000000000045', 'e6000000-0000-0000-0000-0000000000b1', 'e6000000-0000-0000-0000-000000000011', 'active');
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000056';  -- leaves A ...
update enrollments set status = 'active'    where id = 'e6000000-0000-0000-0000-000000000056';  -- ... and is re-enrolled

-- One signal per conversation, saved as postgres (the trigger fires for any insert).
delete from realtime.messages;
insert into messages (conversation_id, sender_user_id, body)
select c, :'v_admin'::uuid, 'fixture'
from unnest(array[:'v_a', :'v_b', :'v_k', :'v_x', :'v_staff_1', :'v_staff_2', :'v_lead']::uuid[]) c;

select is((select count(*) from realtime.messages)::int, 7,
  'fixture: one signal exists for each of the seven conversations');

-- ---------------------------------------------------------------------------------------------
-- GROUP 1: participants receive
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 1a: enrolled HS student receives on their own class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 1b: parent of an enrolled student receives on that class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000a1'::uuid);
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 1c: the class teacher receives on their class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_1'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000011'::uuid);
select is(public.rt_visible('chat:' || :'v_staff_1'), 1, 'CONTROL 1d: a session coordinator receives on their session-staff conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_bvc'::uuid, 'bv_coordinator', 'org');
select is(public.rt_visible('chat:' || :'v_lead'), 1, 'CONTROL 1e: the BV coordinator receives on the leadership conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org');
select is(public.rt_visible('chat:' || :'v_lead'), 1, 'CONTROL 1f: an admin receives on the leadership conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_k_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_k'), 1, 'CONTROL 1g: a parent of a KG-2 child receives on the KG-2 class');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 2: withdrawal (ADR-2026-09-19)
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_wd_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2a DENY: a withdrawn student cannot receive on the class they left');
select tests.clear_authentication();

select tests.authenticate_as(:'v_wd_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2b DENY: a withdrawn student''s parent cannot receive on that class');
select tests.clear_authentication();

select tests.authenticate_as(:'v_sib_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2c DENY: the withdrawn sibling cannot receive');
select tests.clear_authentication();

select tests.authenticate_as(:'v_sib_parent'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 2d: the parent with a sibling still enrolled in the class keeps receiving');
select tests.clear_authentication();

select tests.authenticate_as(:'v_ab_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2e DENY: withdrawn from A, active in B -> A is denied');
select is(public.rt_visible('chat:' || :'v_b'), 1, 'CONTROL 2f: withdrawn from A, active in B -> B receives');
select tests.clear_authentication();

select tests.authenticate_as(:'v_re_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 2g: a student re-enrolled after withdrawal receives again');
select tests.clear_authentication();

-- Revocation takes effect on the very next evaluation (join or token refresh re-runs the policy).
update enrollments set status = 'withdrawn' where id = 'e6000000-0000-0000-0000-000000000056';
select tests.authenticate_as(:'v_re_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2h DENY: withdrawn again -> the next evaluation denies');
select tests.clear_authentication();

-- Removal from staff revokes the same way (acceptance criterion 5). CONTROL 1c showed this
-- teacher receiving on class A while the grant existed.
delete from user_roles where user_id = :'v_teacher_a'::uuid;
select tests.authenticate_as(:'v_teacher_a'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000a1'::uuid);
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 2i DENY: a teacher removed from the class cannot receive, even with the old scope claim');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 3: wrong scope
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_teacher_x'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid);
select is(public.rt_visible('chat:' || :'v_x'), 1, 'CONTROL 3a: teacher of class X receives on X');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3b DENY: a teacher of another class cannot receive on class A');
select tests.clear_authentication();

-- A teacher who spoofs class A's scope claim is still denied: the policy reads no claim.
select tests.authenticate_as(:'v_teacher_x'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000a1'::uuid);
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3c DENY: a forged class-A scope claim does not open class A');
select tests.clear_authentication();

select tests.authenticate_as(:'v_coord_2'::uuid, 'coordinator', 'session', 'e6000000-0000-0000-0000-000000000012'::uuid);
select is(public.rt_visible('chat:' || :'v_staff_2'), 1, 'CONTROL 3d: coordinator of session 2 receives on session 2 staff');
select is(public.rt_visible('chat:' || :'v_staff_1'), 0, 'ATTACK 3e DENY: a coordinator of another session cannot receive on session 1 staff');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3f DENY: a coordinator of another session cannot receive on class A');
select tests.clear_authentication();

-- 3g proves non-membership only: this student is not enrolled in the KG-2 class. Whether an
-- enrolled KG-Gr 8 student with a login should be a participant at all is a membership rule
-- (sync_class_participants, ADR-0015), which this policy mirrors and does not decide.
select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_k'), 0, 'ATTACK 3g DENY: a student not enrolled in a KG-Gr 8 class cannot receive on its conversation');
select is(public.rt_visible('chat:' || :'v_staff_1'), 0, 'ATTACK 3h DENY: a student cannot receive on the session-staff conversation');
select is(public.rt_visible('chat:' || :'v_lead'), 0, 'ATTACK 3i DENY: a student cannot receive on the leadership conversation');
select tests.clear_authentication();

select tests.authenticate_as(:'v_outsider'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 3j DENY: an authenticated user with no membership anywhere cannot receive');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 4: multi-role user -- an active-role switch never widens what is received
-- (claims are set the way the auth hook sets them after switch_active_role)
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_multirole'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid);
select is(public.rt_visible('chat:' || :'v_x'), 1, 'CONTROL 4a: multi-role, active as teacher of X -> X receives');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 4b: multi-role, active as teacher of X -> A (via guardianship) receives');
select is(public.rt_visible('chat:' || :'v_b'), 0, 'ATTACK 4c DENY: multi-role, active as teacher -> B is denied');
select tests.clear_authentication();

select tests.authenticate_as(:'v_multirole'::uuid, 'parent');
select is(public.rt_visible('chat:' || :'v_x'), 1, 'CONTROL 4d: after switching to parent -> X unchanged');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 4e: after switching to parent -> A unchanged');
select is(public.rt_visible('chat:' || :'v_b'), 0, 'ATTACK 4f DENY: after switching to parent -> B still denied');

-- A member of both A and X, joined to A, is shown A's signal only.
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 4g: joined to A, exactly one row is visible');
select is(
  (select count(*) from realtime.messages where topic <> 'chat:' || :'v_a')::int, 0,
  'ATTACK 4h DENY: joined to A, no row of X (which they also belong to) or of any other conversation is visible'
);
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 5: malformed and foreign topics, as a genuine participant of A
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 5a: the well-formed topic receives');
select is(public.rt_visible(''), 0, 'ATTACK 5b DENY: no topic set (a direct read of the transport table) shows nothing');
select is(public.rt_visible('chat:'), 0, 'ATTACK 5c DENY: prefix only');
select is(public.rt_visible('chat:not-a-uuid'), 0, 'ATTACK 5d DENY: non-uuid topic, no cast error raised');
select is(public.rt_visible('chat:' || upper(:'v_a')), 0, 'ATTACK 5e DENY: uppercase uuid');
select is(public.rt_visible('chat:' || :'v_a' || ':typing'), 0, 'ATTACK 5f DENY: trailing suffix');
select is(public.rt_visible('room:' || :'v_a'), 0, 'ATTACK 5g DENY: non-chat prefix');
select is(public.rt_visible(:'v_a'), 0, 'ATTACK 5h DENY: bare uuid');
-- 5i is held by two layers: the parser rejects the newline (pinned on its own in 190) and no
-- stored row's topic equals the newline form. It goes red only if both are loosened.
select is(public.rt_visible('chat:' || :'v_a' || E'\n'), 0, 'ATTACK 5i DENY: trailing newline');

-- ---------------------------------------------------------------------------------------------
-- GROUP 6: clients are listen-only
-- ---------------------------------------------------------------------------------------------
select throws_ok(
  format('insert into realtime.messages (payload, event, topic, private, extension) values (%L::jsonb, %L, %L, true, %L)',
    '{"id":"forged"}', 'message_saved', 'chat:' || :'v_a', 'broadcast'),
  '42501', null,
  'ATTACK 6a DENY: a participant cannot insert into realtime.messages (no client publish)'
);
select set_config('realtime.topic', 'chat:' || :'v_a', true);
with u as (update realtime.messages set payload = '{"id":"tampered"}'::jsonb returning 1)
select is(
  (select count(*) from u)::int, 0,
  'ATTACK 6b DENY: a participant''s update of realtime.messages touches no row'
);
-- 6c is refused by the platform's grants (authenticated holds no delete on realtime.messages),
-- not by this migration; 6a and 6b are the ones that exercise the policy set.
select throws_ok(
  'delete from realtime.messages',
  '42501', null,
  'ATTACK 6c DENY: a participant cannot delete from realtime.messages'
);

-- realtime.send() is executable by every role and runs as the caller. It traps its own errors,
-- so a refused send returns normally with a warning (silenced here): the proof is that no row
-- was written, checked below as postgres.
set local client_min_messages to error;
select lives_ok(
  format('select realtime.send(%L::jsonb, %L, %L, true)', '{"id":"forged-send"}', 'message_saved', 'chat:' || :'v_a'),
  'ATTACK 6d: a participant calling realtime.send() directly gets no error ...'
);
set local client_min_messages to notice;
select tests.clear_authentication();

select is(
  (select count(*) from realtime.messages where payload->>'id' = 'forged-send')::int, 0,
  'ATTACK 6d DENY: ... and no forged signal was written'
);

-- The policy lives on the parent table; the daily partitions have row security off, so the
-- only thing between a client and their rows is the absence of a grant (platform default).
select ok(
  (select count(*) > 0
      and bool_and(not has_table_privilege('authenticated', inhrelid, 'select')
               and not has_table_privilege('anon', inhrelid, 'select'))
     from pg_inherits where inhparent = 'realtime.messages'::regclass),
  'ATTACK 6e DENY: no realtime.messages partition is directly readable by authenticated or anon'
);

-- ---------------------------------------------------------------------------------------------
-- GROUP 7: unauthenticated. `set role anon`, not clear_authentication(): the latter resets to
-- postgres, which bypasses RLS and would make any "0 rows" check meaningless.
-- ---------------------------------------------------------------------------------------------
set local role anon;
select is(public.rt_visible('chat:' || :'v_a'), 0, 'ATTACK 7a DENY: an unauthenticated client sees zero rows on a class topic');
reset role;

select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(public.rt_visible('chat:' || :'v_a'), 1, 'CONTROL 7b: the same topic still shows its row to a participant');
select tests.clear_authentication();

-- ---------------------------------------------------------------------------------------------
-- GROUP 8: live access equals history access (acceptance criterion 2). Each conversation holds
-- one saved message and one signal, so [signals visible on the channel, messages readable under
-- messages RLS] must be [1,1] or [0,0] for the same user and conversation, never mixed.
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student'::uuid, 'student');
select is(
  array[public.rt_visible('chat:' || :'v_a'), (select count(*)::int from messages where conversation_id = :'v_a'::uuid)],
  array[1, 1], 'PARITY 8a: an enrolled student both receives and reads class A');
select tests.clear_authentication();

select tests.authenticate_as(:'v_wd_student'::uuid, 'student');
select is(
  array[public.rt_visible('chat:' || :'v_a'), (select count(*)::int from messages where conversation_id = :'v_a'::uuid)],
  array[0, 0], 'PARITY 8b: a withdrawn student neither receives nor reads class A');
select tests.clear_authentication();

select tests.authenticate_as(:'v_teacher_x'::uuid, 'teacher', 'class', 'e6000000-0000-0000-0000-0000000000d1'::uuid);
select is(
  array[public.rt_visible('chat:' || :'v_x'), (select count(*)::int from messages where conversation_id = :'v_x'::uuid)],
  array[1, 1], 'PARITY 8c: the teacher of X both receives and reads class X');
select is(
  array[public.rt_visible('chat:' || :'v_a'), (select count(*)::int from messages where conversation_id = :'v_a'::uuid)],
  array[0, 0], 'PARITY 8d: the teacher of X neither receives nor reads class A');
select tests.clear_authentication();

select * from finish();
rollback;

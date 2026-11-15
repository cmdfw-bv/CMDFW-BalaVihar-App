-- Teacher -> chat-message-removal (issue #113, ADR-2026-11-14-chat-message-removal-move-aside).
-- Schema, sender_role stamping, and the remove_message happy path. The adversarial
-- role x scope ladder lives in 201.
begin;
select plan(30);

-- ---------------------------------------------------------------------------------------------
-- Fixture: one class chat with a teacher, a student and a parent participant.
-- ---------------------------------------------------------------------------------------------
insert into centers (id, name) values ('f2000000-0000-0000-0000-000000000001', 'MR Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
  values ('f2000000-0000-0000-0000-000000000011', 'f2000000-0000-0000-0000-000000000001', 'MR Session', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band)
  values ('f2000000-0000-0000-0000-000000000021', 'f2000000-0000-0000-0000-000000000011', 'MR Class HS', 'HS9-12');
insert into families (id, label) values ('f2000000-0000-0000-0000-000000000031', 'MR Family');

select tests.create_supabase_user('mr-student@test.local') as v_student \gset
select tests.create_supabase_user('mr-parent@test.local') as v_parent \gset
select tests.create_supabase_user('mr-teacher@test.local') as v_teacher \gset

insert into family_members (family_id, user_id, relationship)
  values ('f2000000-0000-0000-0000-000000000031', :'v_parent'::uuid, 'parent');
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('f2000000-0000-0000-0000-000000000041', 'f2000000-0000-0000-0000-000000000031', 'Mr', 'Student', 'HS9', :'v_student'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  ('f2000000-0000-0000-0000-000000000041', 'f2000000-0000-0000-0000-000000000021', 'f2000000-0000-0000-0000-000000000011', 'active');
insert into user_roles (user_id, role, scope_type, scope_id, is_active)
  values (:'v_teacher'::uuid, 'teacher', 'class', 'f2000000-0000-0000-0000-000000000021', true);

select id as v_conv from conversations
  where kind = 'class' and scope_id = 'f2000000-0000-0000-0000-000000000021'::uuid \gset

-- ---------------------------------------------------------------------------------------------
-- Objects
-- ---------------------------------------------------------------------------------------------
select col_is_null('public', 'messages', 'body', 'messages.body is nullable (null exactly when removed)');
select has_column('public', 'messages', 'sender_role', 'messages.sender_role exists');
select has_column('public', 'messages', 'removed_at', 'messages.removed_at exists');
select has_column('public', 'messages', 'removed_by_role', 'messages.removed_by_role exists');
select has_table('public', 'message_removals', 'message_removals exists');
select has_index('public', 'messages', 'messages_removed_idx', 'the partial removed index exists');
select is(
  (select prosecdef::text || '|' || array_to_string(proconfig, ',') from pg_proc
    where oid = 'public.remove_message(uuid)'::regprocedure),
  'true|search_path=""',
  'remove_message is security definer with an empty search_path'
);
select is(has_function_privilege('anon', 'public.remove_message(uuid)', 'execute'), false,
  'anon cannot execute remove_message');
select is(has_function_privilege('authenticated', 'public.remove_message(uuid)', 'execute'), true,
  'authenticated can execute remove_message');
select is(has_table_privilege('authenticated', 'public.message_removals', 'select'), false,
  'authenticated has no select on message_removals');

-- ---------------------------------------------------------------------------------------------
-- sender_role is stamped by the database, never supplied by the client
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student'::uuid, 'student', 'org', null);
insert into messages (conversation_id, sender_user_id, body, mention_targets)
  values (:'v_conv'::uuid, auth.uid(), 'student says hi', array[:'v_teacher']::text[]);
select tests.clear_authentication();
select tests.authenticate_as(:'v_parent'::uuid, 'parent', 'org', null);
insert into messages (conversation_id, sender_user_id, body, mention_targets)
  values (:'v_conv'::uuid, auth.uid(), 'parent says hi', array[]::text[]);
select tests.clear_authentication();
select tests.authenticate_as(:'v_student'::uuid, 'student', 'org', null);
select throws_ok(
  format('insert into messages (conversation_id, sender_user_id, body, mention_targets, sender_role) values (%L::uuid, auth.uid(), %L, array[]::text[], %L)',
    :'v_conv', 'forged', 'admin'),
  '42501', null,
  'sender_role_not_client_settable: a client cannot supply sender_role'
);
select tests.clear_authentication();

select id as v_m_student from messages where conversation_id = :'v_conv'::uuid and body = 'student says hi' \gset
select id as v_m_parent from messages where conversation_id = :'v_conv'::uuid and body = 'parent says hi' \gset

select is((select sender_role from messages where id = :'v_m_student'::uuid), 'student',
  'sender_role_stamped: a student''s message is stamped student');
select is((select sender_role from messages where id = :'v_m_parent'::uuid), 'parent',
  'sender_role_stamped: a parent''s message is stamped parent');

-- ---------------------------------------------------------------------------------------------
-- The class teacher removes a student's message
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'f2000000-0000-0000-0000-000000000021');
select (r).body is null as r1_body_null,
       (r).mention_targets = array[]::text[] as r1_mentions_empty,
       (r).removed_by_role as r1_removed_by_role,
       (r).removed_at is not null as r1_removed_at_set,
       (r).id as r1_id,
       r::text as r1_row
  from (select public.remove_message(:'v_m_student'::uuid) as r offset 0) x \gset
select tests.clear_authentication();

select is(:'r1_id'::uuid, :'v_m_student'::uuid, 'teacher_removes_student_message: the returned row is the message');
select is(:'r1_body_null'::boolean and :'r1_mentions_empty'::boolean and :'r1_removed_at_set'::boolean, true,
  'teacher_removes_student_message: returned row has body null, mentions empty, removed_at set');
select is(:'r1_removed_by_role'::text, 'teacher'::text, 'teacher_removes_student_message: removed_by_role = teacher');
select is(
  (select (body is null and mention_targets = array[]::text[] and removed_at is not null)::text
     from messages where id = :'v_m_student'::uuid),
  'true',
  'the stored message no longer carries the text or the mentions'
);

select is(
  (select count(*) from message_removals
    where message_id = :'v_m_student'::uuid
      and conversation_id = :'v_conv'::uuid
      and body = 'student says hi'
      and mention_targets = array[:'v_teacher']::text[]
      and removed_by_user_id = :'v_teacher'::uuid
      and removed_by_role = 'teacher'
      and removed_at is not null)::int,
  1,
  'side_table_holds_text: the original body and mentions moved aside with the remover'
);

select is(
  (select count(*) from audit_log where action = 'remove' and target_id = :'v_m_student'::uuid)::int, 1,
  'audit_remove_row: exactly one remove entry for the student message'
);
select is(
  (select count(*) from audit_log
    where action = 'remove' and target_id = :'v_m_student'::uuid
      and actor_user_id = :'v_teacher'::uuid and actor_role = 'teacher'
      and target_table = 'messages'
      and target_student_id = 'f2000000-0000-0000-0000-000000000041'::uuid)::int,
  1,
  'audit_remove_row: actor, role, table, message id and the sender''s student id'
);

select is(
  (select count(*) from realtime.messages
    where event = 'message_removed' and topic = 'chat:' || :'v_conv'
      and payload->>'id' = :'v_m_student')::int,
  1,
  'signal_sent: one message_removed signal on the conversation topic after the first call'
);
select is(
  (select array_agg(k order by k) from realtime.messages rm, jsonb_object_keys(rm.payload) k
    where rm.event = 'message_removed' and rm.topic = 'chat:' || :'v_conv'),
  array['id'],
  'signal_sent: the payload is the id only'
);

-- ---------------------------------------------------------------------------------------------
-- Idempotent second call
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'f2000000-0000-0000-0000-000000000021');
select r::text as r2_row from (select public.remove_message(:'v_m_student'::uuid) as r offset 0) x \gset
select tests.clear_authentication();

select is(:'r2_row'::text, :'r1_row'::text, 'idempotent_second_call: the second call returns the same row');
select is(
  (select count(*) from message_removals where message_id = :'v_m_student'::uuid)::int
    || '|' || (select count(*) from audit_log where action = 'remove' and target_id = :'v_m_student'::uuid)::int,
  '1|1',
  'idempotent_second_call: no second side-table row and no second audit entry'
);
select is(
  (select count(*) from realtime.messages
    where event = 'message_removed' and topic = 'chat:' || :'v_conv'
      and payload->>'id' = :'v_m_student')::int,
  1,
  'signal_sent: still one message_removed signal after the second call'
);

-- ---------------------------------------------------------------------------------------------
-- A parent's message: removed, audited with no student id
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'f2000000-0000-0000-0000-000000000021');
select ((r).body is null and (r).removed_by_role = 'teacher') as r3_ok
  from (select public.remove_message(:'v_m_parent'::uuid) as r offset 0) x \gset
select tests.clear_authentication();

select is(:'r3_ok'::boolean, true, 'the teacher removes a parent''s message');
select is(
  (select count(*) from audit_log
    where action = 'remove' and target_id = :'v_m_parent'::uuid
      and target_table = 'messages' and actor_role = 'teacher'
      and target_student_id is null)::int,
  1,
  'audit_remove_row: a parent message''s entry has target_student_id null'
);
select is(
  (select count(*) from audit_log al
    join message_removals mr on mr.message_id = al.target_id
   where al.action = 'remove'
     and (to_jsonb(al)::text like '%student says hi%' or to_jsonb(al)::text like '%parent says hi%'))::int,
  0,
  'no audit entry carries message text'
);

-- ---------------------------------------------------------------------------------------------
-- Integrity: a row cannot be half-removed
-- ---------------------------------------------------------------------------------------------
select tests.authenticate_as(:'v_student'::uuid, 'student', 'org', null);
insert into messages (conversation_id, sender_user_id, body, mention_targets)
  values (:'v_conv'::uuid, auth.uid(), 'still here', array[]::text[]);
select tests.clear_authentication();
select throws_ok(
  format('update messages set removed_at = now() where conversation_id = %L::uuid and body = %L', :'v_conv', 'still here'),
  '23514', null,
  'half_removed_rejected: removed_at cannot be set while body is still present'
);

-- ---------------------------------------------------------------------------------------------
-- Backfill: every pre-existing message whose sender is a participant got a role
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*) from messages m
    where m.sender_role is null
      and exists (select 1 from conversation_participants cp
                   where cp.conversation_id = m.conversation_id and cp.user_id = m.sender_user_id))::int,
  0,
  'backfill_resolves_participants: no participant-sent message is left without a sender_role'
);

select * from finish();
rollback;

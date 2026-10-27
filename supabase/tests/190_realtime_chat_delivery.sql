-- System -> realtime-chat-delivery (issue #6, ADR-2026-10-07): schema and signal.
-- The adversarial role x scope matrix for the channel policy lives in 191.
begin;
select plan(34);

insert into centers (id, name) values ('d6000000-0000-0000-0000-000000000001', 'RT Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
  values ('d6000000-0000-0000-0000-000000000011', 'd6000000-0000-0000-0000-000000000001', 'RT Session', '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band)
  values ('d6000000-0000-0000-0000-000000000021', 'd6000000-0000-0000-0000-000000000011', 'RT Class HS', 'HS9-12');
insert into families (id, label) values ('d6000000-0000-0000-0000-000000000031', 'RT Family');
select tests.create_supabase_user('rt-student@test.local') as v_student \gset
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('d6000000-0000-0000-0000-000000000041', 'd6000000-0000-0000-0000-000000000031', 'Rt', 'Student', 'HS9', :'v_student'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  ('d6000000-0000-0000-0000-000000000041', 'd6000000-0000-0000-0000-000000000021', 'd6000000-0000-0000-0000-000000000011', 'active');

select id as v_conv from conversations
  where kind = 'class' and scope_id = 'd6000000-0000-0000-0000-000000000021'::uuid \gset

-- ---------------------------------------------------------------------------------------------
-- Objects and privileges
-- ---------------------------------------------------------------------------------------------
select has_index('public', 'messages', 'messages_conversation_created_id_idx',
  'the catch-up index exists');
select is(
  (select pg_get_indexdef(indexrelid) from pg_index where indexrelid = 'public.messages_conversation_created_id_idx'::regclass),
  'CREATE INDEX messages_conversation_created_id_idx ON public.messages USING btree (conversation_id, created_at DESC, id DESC)',
  'the catch-up index is (conversation_id, created_at desc, id desc)'
);
select has_trigger('public', 'messages', 'messages_broadcast_saved', 'the signal trigger exists on messages');
select is(
  (select prosecdef from pg_proc where oid = 'public.broadcast_message_saved()'::regprocedure), true,
  'the trigger function is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.broadcast_message_saved()'::regprocedure),
  array['search_path=""'],
  'the trigger function pins an empty search_path'
);
select is(has_function_privilege('authenticated', 'public.broadcast_message_saved()', 'execute'), false,
  'authenticated cannot execute the trigger function');
select is(has_function_privilege('anon', 'public.broadcast_message_saved()', 'execute'), false,
  'anon cannot execute the trigger function');
select is(has_function_privilege('authenticated', 'public.chat_topic_conversation_id(text)', 'execute'), true,
  'authenticated can execute the topic parser (a policy expression runs as the caller)');
select is(has_function_privilege('anon', 'public.chat_topic_conversation_id(text)', 'execute'), false,
  'anon cannot execute the topic parser');

select is(has_table_privilege('authenticated', 'public.messages', 'insert'), false,
  'authenticated no longer holds table-wide insert on messages');
select is(has_column_privilege('authenticated', 'public.messages', 'id', 'insert'), false,
  'authenticated cannot supply messages.id');
select is(has_column_privilege('authenticated', 'public.messages', 'created_at', 'insert'), false,
  'authenticated cannot supply messages.created_at');
select is(
  (select array_agg(column_name::text order by column_name::text) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'messages' and grantee = 'authenticated' and privilege_type = 'INSERT'),
  array['body', 'conversation_id', 'mention_targets', 'sender_user_id'],
  'authenticated may insert exactly the four client-written columns'
);
select is(has_table_privilege('authenticated', 'public.messages', 'select'), true,
  'authenticated still holds select on messages');

select is(
  (select array_agg(cmd || ':' || roles::text order by policyname) from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'),
  array['SELECT:{authenticated}'],
  'realtime.messages has exactly one policy: select, for authenticated (listen-only clients)'
);

-- ---------------------------------------------------------------------------------------------
-- Topic parser: never raises
-- ---------------------------------------------------------------------------------------------
select is(public.chat_topic_conversation_id('chat:' || :'v_conv'), :'v_conv'::uuid,
  'a well-formed topic parses to its conversation id');
select is(public.chat_topic_conversation_id(''), null::uuid, 'empty topic -> null');
select is(public.chat_topic_conversation_id(null), null::uuid, 'null topic -> null');
select is(public.chat_topic_conversation_id('chat:'), null::uuid, 'prefix only -> null');
select is(public.chat_topic_conversation_id('chat:not-a-uuid'), null::uuid, 'non-uuid -> null, no cast error');
select is(public.chat_topic_conversation_id('chat:' || upper(:'v_conv')), null::uuid, 'uppercase uuid -> null');
select is(public.chat_topic_conversation_id('chat:' || :'v_conv' || ':extra'), null::uuid, 'trailing suffix -> null');
select is(public.chat_topic_conversation_id('chat:' || :'v_conv' || E'\n'), null::uuid, 'trailing newline -> null');
select is(public.chat_topic_conversation_id('room:' || :'v_conv'), null::uuid, 'different prefix -> null');
select is(public.chat_topic_conversation_id(:'v_conv'), null::uuid, 'bare uuid -> null');

-- ---------------------------------------------------------------------------------------------
-- Column grant and signal
-- ---------------------------------------------------------------------------------------------
select is(
  (select count(*) from realtime.messages where topic = 'chat:' || :'v_conv')::int, 0,
  'baseline: no signal exists for this conversation before any message is saved'
);

select tests.authenticate_as(:'v_student'::uuid, 'student');

select lives_ok(
  format('insert into messages (conversation_id, sender_user_id, body, mention_targets) values (%L::uuid, auth.uid(), %L, array[]::text[])',
    :'v_conv', 'hello'),
  'a participant can save a message with the four permitted columns'
);
select throws_ok(
  format('insert into messages (conversation_id, sender_user_id, body, mention_targets, created_at) values (%L::uuid, auth.uid(), %L, array[]::text[], now() - interval ''1 day'')',
    :'v_conv', 'backdated'),
  '42501', null,
  'a participant cannot supply created_at'
);
select throws_ok(
  format('insert into messages (id, conversation_id, sender_user_id, body, mention_targets) values (gen_random_uuid(), %L::uuid, auth.uid(), %L, array[]::text[])',
    :'v_conv', 'chosen id'),
  '42501', null,
  'a participant cannot supply id'
);

select tests.clear_authentication();

select is(
  (select count(*) from realtime.messages where topic = 'chat:' || :'v_conv')::int, 1,
  'exactly one signal was written: one for the saved message, none for the two refused inserts'
);
select is(
  (select event || '|' || private::text || '|' || extension from realtime.messages where topic = 'chat:' || :'v_conv'),
  'message_saved|true|broadcast',
  'the signal is a private broadcast with event message_saved'
);
select is(
  (select array_agg(k order by k) from realtime.messages rm, jsonb_object_keys(rm.payload) k where rm.topic = 'chat:' || :'v_conv'),
  array['created_at', 'id'],
  'the payload has exactly two keys: id and created_at (no body, sender or mentions)'
);
select is(
  (select count(*) from realtime.messages rm
     join messages m on m.id = (rm.payload->>'id')::uuid and m.created_at = (rm.payload->>'created_at')::timestamptz
    where rm.topic = 'chat:' || :'v_conv' and m.body = 'hello')::int,
  1,
  'the payload id and created_at are those of the saved message'
);
select is(
  (select count(*) from realtime.messages where payload::text like '%hello%')::int, 0,
  'the message body is nowhere in the transport store'
);

select * from finish();
rollback;

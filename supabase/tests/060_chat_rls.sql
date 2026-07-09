begin;
select plan(13);

insert into centers (id, name) values ('c7777777-0000-0000-0000-000000000001', 'Chat Center');
insert into sessions (id, center_id, name, start_date, end_date)
  values ('a7777777-0000-0000-0000-000000000001', 'c7777777-0000-0000-0000-000000000001', 'Chat Session', '2026-01-01', '2026-06-01');
insert into classes (id, session_id, name, grade_band)
  values ('c7777777-0000-0000-0000-000000000002', 'a7777777-0000-0000-0000-000000000001', 'Chat Class HS9', 'HS9-12');

insert into families (id, label) values ('f7777777-0000-0000-0000-000000000001', 'Chat Family');
select tests.create_supabase_user('chat-parent@test.local') as v_parent \gset
select tests.create_supabase_user('chat-student-1@test.local') as v_student_1 \gset
select tests.create_supabase_user('chat-student-2@test.local') as v_student_2 \gset

insert into family_members (family_id, user_id, relationship) values
  ('f7777777-0000-0000-0000-000000000001', :'v_parent'::uuid, 'guardian');

-- Both HS students have logins (per the students.user_id note); student_2 is unrelated (own family).
insert into families (id, label) values ('f7777777-0000-0000-0000-000000000002', 'Chat Family Two');
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('5f111111-0000-0000-0000-000000000001', 'f7777777-0000-0000-0000-000000000001', 'Chat', 'One', 'HS9', :'v_student_1'::uuid),
  ('5f222222-0000-0000-0000-000000000002', 'f7777777-0000-0000-0000-000000000002', 'Chat', 'Two', 'HS9', :'v_student_2'::uuid);

insert into enrollments (id, student_id, class_id, session_id, status)
  values ('e7777777-0000-0000-0000-000000000001', '5f111111-0000-0000-0000-000000000001', 'c7777777-0000-0000-0000-000000000002', 'a7777777-0000-0000-0000-000000000001', 'active');
-- student_2 is deliberately NOT enrolled in this class — proves membership isn't automatic org-wide.

-- Capture conversation ids while still running as postgres (superuser bypasses RLS), for use
-- by later assertions that need a conversation id a given fixture user is NOT a member of.
select id as v_class_conv from conversations
  where kind = 'class' and scope_id = 'c7777777-0000-0000-0000-000000000002'::uuid \gset
select id as v_session_conv from conversations
  where kind = 'session_staff' and scope_id = 'a7777777-0000-0000-0000-000000000001'::uuid \gset
select id as v_leadership_conv from conversations where kind = 'leadership' \gset

-- The class-conversation + student + parent participant rows should now exist via triggers.
select is(
  (select count(*) from conversations where kind = 'class' and scope_id = 'c7777777-0000-0000-0000-000000000002'::uuid)::int,
  1, 'the class conversation was auto-created by the classes-insert trigger'
);

-- sync_session_conversation: the sessions insert above should have auto-created a
-- session_staff conversation scoped to that session.
select is(
  (select count(*) from conversations where kind = 'session_staff' and scope_type = 'session'
    and scope_id = 'a7777777-0000-0000-0000-000000000001'::uuid)::int,
  1, 'the session_staff conversation was auto-created by the sessions-insert trigger'
);

-- The org-wide leadership conversation is a singleton, created once by the migration itself.
-- Checked as postgres (superuser bypasses RLS) since no fixture user is a member of it yet.
select is(
  (select count(*) from conversations where kind = 'leadership')::int,
  1, 'exactly one leadership conversation exists (org singleton)'
);

select tests.authenticate_as(:'v_student_1'::uuid, 'student');
select is((select count(*) from conversations)::int, 1, 'the enrolled HS student sees exactly their class conversation');

select lives_ok(
  $$insert into messages (conversation_id, sender_user_id, body, mention_targets)
    select id, auth.uid(), 'hello class', array[]::text[] from conversations where kind = 'class' limit 1$$,
  'the enrolled student can post in their own class conversation'
);

select tests.clear_authentication();
select tests.authenticate_as(:'v_parent'::uuid, 'parent');
select is((select count(*) from conversation_participants where user_id = :'v_parent'::uuid)::int, 1,
  'the guardian of the enrolled student was auto-added as a participant');

-- Negative: student_2 (unrelated, not enrolled in this class) has no path to this conversation at all.
select tests.clear_authentication();
select tests.authenticate_as(:'v_student_2'::uuid, 'student');
select is((select count(*) from conversations)::int, 0, 'an unenrolled student sees zero conversations — no P2P DM path exists');

select throws_ok(
  $$insert into conversations (kind, scope_type, scope_id) values ('class', 'class', gen_random_uuid())$$,
  '42501',
  null,
  'no client role — including student — can create a conversation directly (membership is trigger-only)'
);

-- sync_staff_participants: back to postgres (bypasses RLS) to drive user_roles inserts/deletes
-- directly — user_roles has no client-writable grant, so this is the only way to exercise it.
select tests.clear_authentication();

select tests.create_supabase_user('chat-teacher@test.local') as v_teacher \gset
insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_teacher'::uuid, 'teacher', 'class', 'c7777777-0000-0000-0000-000000000002'::uuid);
select is(
  (select count(*) from conversation_participants
    where conversation_id = :'v_class_conv'::uuid and user_id = :'v_teacher'::uuid and participant_role = 'teacher')::int,
  1, 'inserting a teacher user_roles row adds them as a participant of their class conversation'
);

select tests.create_supabase_user('chat-coordinator@test.local') as v_coordinator \gset
insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_coordinator'::uuid, 'coordinator', 'session', 'a7777777-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from conversation_participants
    where conversation_id = :'v_session_conv'::uuid and user_id = :'v_coordinator'::uuid and participant_role = 'coordinator')::int,
  1, 'inserting a coordinator user_roles row adds them as a participant of the session_staff conversation'
);

-- bv_coordinator/admin → leadership: cheap to add (one more fixture user, one more insert), so
-- covered alongside teacher/coordinator rather than skipped.
select tests.create_supabase_user('chat-admin@test.local') as v_admin \gset
insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_admin'::uuid, 'admin', 'org', null);
select is(
  (select count(*) from conversation_participants
    where conversation_id = :'v_leadership_conv'::uuid and user_id = :'v_admin'::uuid and participant_role = 'admin')::int,
  1, 'inserting an admin user_roles row adds them as a participant of the leadership conversation'
);

-- sync_staff_participants DELETE branch: removing the teacher's user_roles row must remove
-- them from the class conversation's participant list.
delete from user_roles
  where user_id = :'v_teacher'::uuid and role = 'teacher' and scope_type = 'class'
    and scope_id = 'c7777777-0000-0000-0000-000000000002'::uuid;
select is(
  (select count(*) from conversation_participants
    where conversation_id = :'v_class_conv'::uuid and user_id = :'v_teacher'::uuid)::int,
  0, 'deleting the teacher user_roles row removes them from the class conversation participant list'
);

-- Cross-conversation adversarial case: v_student_1 IS a legitimate member of the class
-- conversation, but must not be able to insert a message into the session_staff conversation —
-- a conversation they are NOT a participant of. This is the case that actually proves
-- messages_member_insert's with check blocks reaching outside one's own conversation, not just
-- that a total outsider sees zero conversations.
select tests.clear_authentication();
select tests.authenticate_as(:'v_student_1'::uuid, 'student');
select throws_ok(
  format(
    'insert into messages (conversation_id, sender_user_id, body, mention_targets) values (%L::uuid, auth.uid(), %L, array[]::text[])',
    :'v_session_conv',
    'reaching outside my conversation'
  ),
  '42501',
  null,
  'a legitimate member of the class conversation cannot insert into the session_staff conversation they are not a member of'
);

select tests.clear_authentication();
select * from finish();
rollback;

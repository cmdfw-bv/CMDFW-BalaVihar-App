begin;
select plan(6);

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

-- The class-conversation + student + parent participant rows should now exist via triggers.
select is(
  (select count(*) from conversations where kind = 'class' and scope_id = 'c7777777-0000-0000-0000-000000000002'::uuid)::int,
  1, 'the class conversation was auto-created by the classes-insert trigger'
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

select tests.clear_authentication();
select * from finish();
rollback;

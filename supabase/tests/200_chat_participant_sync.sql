-- Behaviour suite for class-chat membership (issue #119, ADR-2026-11-13-class-chat-membership-recount).
--
-- Part 1: the rule (is_hs_grade, class_chat_entitled), the recount, the read-only preview, privileges.
-- Part 2: every event that changes a class's membership calls the recount.
-- Part 3: the one-time repair statement.
--
-- All fixtures are ENROL-FIRST (enrollment before the guardian link / student login).
-- Fixture user ids live in temp table u(name, id) so $$-quoted assertions can reach them.
begin;
select plan(45);

create temp table u (name text primary key, id uuid not null);
insert into u
select n, tests.create_supabase_user('t200-' || n || '@test.local')
from unnest(array['tp','par','aunt','s9','s8','wdpar']) n;

-- =============================================================================================
-- PART 1 — the rule, the recount, the preview
-- =============================================================================================

-- is_hs_grade: exactly '9'-'12' and 'Gr9'-'Gr12'. Everything else is false (fail closed).
select is(public.is_hs_grade(v), true, format('is_hs_grade(%L) is true', v))
from unnest(array['9','10','11','12','Gr9','Gr10','Gr11','Gr12']) v;

select is(public.is_hs_grade(v), false, format('is_hs_grade(%L) is false', v))
from unnest(array[null,'','gr9',' 9','9 ','HS9','Gr 9','8','Gr8','13','PreK','KG','Shishu Vihaar']) v;

-- Fixture E: a combined '7, 8, 9' class; N: a class whose conversation will be removed.
insert into centers (id, name) values ('e2000000-0000-0000-0000-000000000001', '200 Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('e2000000-0000-0000-0000-000000000011', 'e2000000-0000-0000-0000-000000000001', '200 Session',
   '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('e2000000-0000-0000-0000-0000000000e1', 'e2000000-0000-0000-0000-000000000011', '200 E', '7, 8, 9'),
  ('e2000000-0000-0000-0000-0000000000f1', 'e2000000-0000-0000-0000-000000000011', '200 N', '7, 8, 9');

insert into families (id, label) values
  ('e2000000-0000-0000-0000-000000000021', '200 Ftp'),
  ('e2000000-0000-0000-0000-000000000022', '200 Fpar'),
  ('e2000000-0000-0000-0000-000000000023', '200 Fwd'),
  ('e2000000-0000-0000-0000-000000000024', '200 Fs8');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('e2000000-0000-0000-0000-000000000031', 'e2000000-0000-0000-0000-000000000021', 'Tp', 'Child', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000032', 'e2000000-0000-0000-0000-000000000022', 'Stu', 'Nine', 'Gr9'),
  ('e2000000-0000-0000-0000-000000000033', 'e2000000-0000-0000-0000-000000000024', 'Stu', 'Eight', '8'),
  ('e2000000-0000-0000-0000-000000000034', 'e2000000-0000-0000-0000-000000000023', 'Wd', 'Child', 'Gr7');
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e2000000-0000-0000-0000-000000000051', 'e2000000-0000-0000-0000-000000000031', 'e2000000-0000-0000-0000-0000000000e1', 'e2000000-0000-0000-0000-000000000011', 'active'),
  ('e2000000-0000-0000-0000-000000000052', 'e2000000-0000-0000-0000-000000000032', 'e2000000-0000-0000-0000-0000000000e1', 'e2000000-0000-0000-0000-000000000011', 'active'),
  ('e2000000-0000-0000-0000-000000000053', 'e2000000-0000-0000-0000-000000000033', 'e2000000-0000-0000-0000-0000000000e1', 'e2000000-0000-0000-0000-000000000011', 'active'),
  ('e2000000-0000-0000-0000-000000000054', 'e2000000-0000-0000-0000-000000000034', 'e2000000-0000-0000-0000-0000000000e1', 'e2000000-0000-0000-0000-000000000011', 'active');
update enrollments set status = 'withdrawn' where id = 'e2000000-0000-0000-0000-000000000054';

-- Link after enrollment. tp is E's teacher, a parent in E, and a coordinator of the session.
insert into user_roles (user_id, role, scope_type, scope_id)
select id, 'teacher'::app_role, 'class'::app_scope_type, 'e2000000-0000-0000-0000-0000000000e1'::uuid from u where name = 'tp'
union all
select id, 'coordinator'::app_role, 'session'::app_scope_type, 'e2000000-0000-0000-0000-000000000011'::uuid from u where name = 'tp';
insert into family_members (family_id, user_id, relationship)
select 'e2000000-0000-0000-0000-000000000021'::uuid, id, 'guardian' from u where name = 'tp'
union all select 'e2000000-0000-0000-0000-000000000022'::uuid, id, 'guardian' from u where name = 'par'
union all select 'e2000000-0000-0000-0000-000000000022'::uuid, id, 'aunt' from u where name = 'aunt'
union all select 'e2000000-0000-0000-0000-000000000023'::uuid, id, 'guardian' from u where name = 'wdpar';
update students set user_id = (select id from u where name = 's9') where id = 'e2000000-0000-0000-0000-000000000032';
update students set user_id = (select id from u where name = 's8') where id = 'e2000000-0000-0000-0000-000000000033';

create temp table cv as
select c.scope_id as class_id, c.id as conv_id from conversations c
where c.kind = 'class' and c.scope_id in ('e2000000-0000-0000-0000-0000000000e1', 'e2000000-0000-0000-0000-0000000000f1');

-- class_chat_entitled: teacher-parent -> teacher; parent with a Gr9 login child -> parent;
-- relationship 'aunt' -> parent; Gr9 student; Gr8 login absent; withdrawn-only family absent.
select set_eq(
  $$select user_id, participant_role from public.class_chat_entitled('e2000000-0000-0000-0000-0000000000e1')$$,
  $$select id, r from u join (values ('tp','teacher'), ('par','parent'), ('aunt','parent'), ('s9','student')) x(n, r) on x.n = u.name$$,
  'class_chat_entitled is exactly ADR-0015''s ladder with teacher > parent > student precedence'
);

-- Break E's stored membership deterministically: exactly the entitled rows, minus par, plus a
-- stray Gr8 student row.
delete from conversation_participants where conversation_id = (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1');
insert into conversation_participants (conversation_id, user_id, participant_role)
select (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1'), e.user_id, e.participant_role
from public.class_chat_entitled('e2000000-0000-0000-0000-0000000000e1') e
where e.user_id <> (select id from u where name = 'par')
union all
select (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1'), id, 'student' from u where name = 's8';

-- Preview: read-only by construction (stable), counts only.
select is(
  (select provolatile::text from pg_proc where proname = 'class_chat_membership_preview' and pronamespace = 'public'::regnamespace),
  's', 'class_chat_membership_preview is stable, so Postgres refuses any write inside it'
);
create temp table cp_count_before as select count(*) as n from conversation_participants;
select results_eq(
  $$select action, participant_role, n from public.class_chat_membership_preview()
    where class_id = 'e2000000-0000-0000-0000-0000000000e1' order by action, participant_role$$,
  $$values ('add'::text, 'parent'::text, 1::bigint), ('remove', 'student', 1)$$,
  'preview reports the broken class as counts only: add parent 1, remove student 1'
);
select is((select count(*) from conversation_participants), (select n from cp_count_before),
  'calling the preview changes no participant rows');

-- Recount reconciles the stored rows to the rule.
select public.recount_class_participants('e2000000-0000-0000-0000-0000000000e1');
select set_eq(
  $$select user_id, participant_role from conversation_participants
    where conversation_id = (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1')$$,
  $$select user_id, participant_role from public.class_chat_entitled('e2000000-0000-0000-0000-0000000000e1')$$,
  'recount adds the missing parent and removes the stray Gr8 student row'
);
select is_empty(
  $$select 1 from public.class_chat_membership_preview() where class_id = 'e2000000-0000-0000-0000-0000000000e1'$$,
  'after the recount the preview shows no change for the class'
);

-- Idempotence: ids included, so nothing was deleted and re-inserted.
create temp table snap as
select id, user_id, participant_role, notify_level, notification_default from conversation_participants
where conversation_id = (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1');
select public.recount_class_participants('e2000000-0000-0000-0000-0000000000e1');
select public.recount_class_participants('e2000000-0000-0000-0000-0000000000e1');
select set_eq(
  $$select id, user_id, participant_role, notify_level, notification_default from conversation_participants
    where conversation_id = (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1')$$,
  $$select * from snap$$,
  'recount is idempotent: running it twice on a correct class changes nothing, row ids included'
);

-- Relabel in place keeps notify_level and notification_default.
update conversation_participants
  set participant_role = 'parent', notify_level = 'mentions', notification_default = 'muted'
  where conversation_id = (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1')
    and user_id = (select id from u where name = 'tp');
select results_eq(
  $$select action, participant_role, n from public.class_chat_membership_preview()
    where class_id = 'e2000000-0000-0000-0000-0000000000e1'$$,
  $$values ('relabel'::text, 'teacher'::text, 1::bigint)$$,
  'preview reports a mislabelled teacher as relabel, under the new label'
);
select public.recount_class_participants('e2000000-0000-0000-0000-0000000000e1');
select results_eq(
  $$select id, participant_role, notify_level, notification_default from conversation_participants
    where conversation_id = (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000e1')
      and user_id = (select id from u where name = 'tp')$$,
  $$select id, 'teacher'::text, 'mentions'::text, 'muted'::text from snap where user_id = (select id from u where name = 'tp')$$,
  'relabel is in place: same row id, label teacher, notify_level and notification_default kept'
);

-- Review focus 4: a class recount never touches session_staff or leadership rows.
create temp table staff_snap as
select cp.id, cp.conversation_id, cp.participant_role, cp.notify_level from conversation_participants cp
join conversations c on c.id = cp.conversation_id
where c.kind <> 'class' and cp.user_id = (select id from u where name = 'tp');
select public.recount_class_participants('e2000000-0000-0000-0000-0000000000e1');
select set_eq(
  $$select cp.id, cp.conversation_id, cp.participant_role, cp.notify_level from conversation_participants cp
    join conversations c on c.id = cp.conversation_id
    where c.kind <> 'class' and cp.user_id = (select id from u where name = 'tp')$$,
  $$select * from staff_snap$$,
  'recount leaves the teacher''s session_staff row untouched'
);
select isnt_empty($$select 1 from staff_snap$$, 'the teacher really holds a session_staff row (the check above is not vacuous)');

-- A class with no conversation row: the recount returns quietly.
delete from conversations where id = (select conv_id from cv where class_id = 'e2000000-0000-0000-0000-0000000000f1');
select lives_ok(
  $$select public.recount_class_participants('e2000000-0000-0000-0000-0000000000f1')$$,
  'class with no conversation row: recount returns without error'
);

-- Privileges (ADR Decision 4): nothing outside the database may call these.
select ok(not has_function_privilege(r, f, 'execute'), format('%s cannot execute %s', r, f))
from unnest(array['public.is_hs_grade(text)', 'public.class_chat_entitled(uuid)',
                  'public.recount_class_participants(uuid)', 'public.class_chat_membership_preview()']) f
cross join unnest(array['anon', 'authenticated']) r;
select ok(has_function_privilege('postgres', f, 'execute'), format('postgres can execute %s', f))
from unnest(array['public.is_hs_grade(text)', 'public.class_chat_entitled(uuid)',
                  'public.recount_class_participants(uuid)', 'public.class_chat_membership_preview()']) f;

select * from finish();
rollback;

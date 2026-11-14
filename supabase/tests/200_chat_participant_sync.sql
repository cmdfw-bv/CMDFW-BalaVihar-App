-- Behaviour suite for class-chat membership (issue #119, ADR-2026-11-13-class-chat-membership-recount).
--
-- Part 1: the rule (is_hs_grade, class_chat_entitled), the recount, the read-only preview, privileges.
-- Part 2: every event that changes a class's membership calls the recount.
-- Part 3: the one-time repair statement.
--
-- All fixtures are ENROL-FIRST (enrollment before the guardian link / student login).
-- Fixture user ids live in temp table u(name, id) so $$-quoted assertions can reach them.
begin;
select plan(75);

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

-- =============================================================================================
-- PART 2 — every event that changes a class's membership calls the recount
-- =============================================================================================
insert into u
select n, tests.create_supabase_user('t200-' || n || '@test.local')
from unnest(array['g1','st9','st8','g3','g4','ru1','ru2','g6','g7','st7','g8','g9','g10',
                  'ga','sa','tpx','mr9','mr8','gm','tq','gp','g16']) n;

-- Label of p_user in p_class's conversation, or null when not a participant.
create function pg_temp.role_in(p_user text, p_class uuid) returns text
language sql stable as $$
  select cp.participant_role
  from conversation_participants cp
  join conversations c on c.id = cp.conversation_id and c.kind = 'class' and c.scope_id = p_class
  where cp.user_id = (select id from u where name = p_user);
$$;

-- S2 holds P, R, D; S3 holds Q, T.
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('e2000000-0000-0000-0000-000000000111', 'e2000000-0000-0000-0000-000000000001', '200 S2', '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('e2000000-0000-0000-0000-000000000112', 'e2000000-0000-0000-0000-000000000001', '200 S3', '2026-01-01', '2026-06-01', 6, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111', '200 P', '7, 8, 9'),
  ('e2000000-0000-0000-0000-0000000001c1', 'e2000000-0000-0000-0000-000000000111', '200 R', '7, 8, 9'),
  ('e2000000-0000-0000-0000-0000000001d1', 'e2000000-0000-0000-0000-000000000111', '200 D', '7, 8, 9'),
  ('e2000000-0000-0000-0000-0000000001b1', 'e2000000-0000-0000-0000-000000000112', '200 Q', '7, 8, 9'),
  ('e2000000-0000-0000-0000-0000000001e1', 'e2000000-0000-0000-0000-000000000112', '200 T', '7, 8, 9');

insert into families (id, label)
select ('e2000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid, '200 G' || i
from generate_series(1, 16) i;

-- Students: no logins yet (enrol-first).
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('e2000000-0000-0000-0000-000000000301', 'e2000000-0000-0000-0000-000000000201', 'C1', 'G1', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000302', 'e2000000-0000-0000-0000-000000000202', 'St9', 'G2', 'Gr9'),
  ('e2000000-0000-0000-0000-000000000303', 'e2000000-0000-0000-0000-000000000202', 'St8', 'G2', '8'),
  ('e2000000-0000-0000-0000-000000000304', 'e2000000-0000-0000-0000-000000000203', 'C3a', 'G3', 'Gr7'),
  ('e2000000-0000-0000-0000-000000000305', 'e2000000-0000-0000-0000-000000000203', 'C3b', 'G3', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000306', 'e2000000-0000-0000-0000-000000000204', 'C4a', 'G4', 'Gr7'),
  ('e2000000-0000-0000-0000-000000000307', 'e2000000-0000-0000-0000-000000000204', 'C4b', 'G4', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000308', 'e2000000-0000-0000-0000-000000000205', 'Rp', 'G5', 'Gr10'),
  ('e2000000-0000-0000-0000-000000000309', 'e2000000-0000-0000-0000-000000000206', 'C6', 'G6', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000310', 'e2000000-0000-0000-0000-000000000207', 'St7', 'G7', 'Gr9'),
  ('e2000000-0000-0000-0000-000000000311', 'e2000000-0000-0000-0000-000000000208', 'C8', 'G8', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000312', 'e2000000-0000-0000-0000-000000000210', 'C10', 'G10', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000313', 'e2000000-0000-0000-0000-000000000211', 'Sa', 'G11', 'Gr9'),
  ('e2000000-0000-0000-0000-000000000314', 'e2000000-0000-0000-0000-000000000212', 'C12', 'G12', 'Gr8'),
  ('e2000000-0000-0000-0000-000000000315', 'e2000000-0000-0000-0000-000000000215', 'Sp', 'G15', 'Gr9'),
  ('e2000000-0000-0000-0000-000000000316', 'e2000000-0000-0000-0000-000000000216', 'C16', 'G16', 'Gr8');

-- Enrol (P/R/D in S2, Q in S3).
insert into enrollments (id, student_id, class_id, session_id, status)
select ('e2000000-0000-0000-0000-0000000004' || substr(x.s, 35, 2))::uuid, x.s::uuid, x.c::uuid, x.ss::uuid, 'active'
from (values
  ('e2000000-0000-0000-0000-000000000301', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000302', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000303', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000304', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000306', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000307', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000308', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000309', 'e2000000-0000-0000-0000-0000000001c1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000310', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000311', 'e2000000-0000-0000-0000-0000000001c1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000312', 'e2000000-0000-0000-0000-0000000001b1', 'e2000000-0000-0000-0000-000000000112'),
  ('e2000000-0000-0000-0000-000000000313', 'e2000000-0000-0000-0000-0000000001c1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000314', 'e2000000-0000-0000-0000-0000000001c1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000315', 'e2000000-0000-0000-0000-0000000001a1', 'e2000000-0000-0000-0000-000000000111'),
  ('e2000000-0000-0000-0000-000000000316', 'e2000000-0000-0000-0000-0000000001b1', 'e2000000-0000-0000-0000-000000000112'),
  ('e2000000-0000-0000-0000-000000000305', 'e2000000-0000-0000-0000-0000000001b1', 'e2000000-0000-0000-0000-000000000112')
) x(s, c, ss);

-- Then link.
insert into family_members (family_id, user_id, relationship)
select x.f::uuid, (select id from u where name = x.n), 'guardian'
from (values
  ('e2000000-0000-0000-0000-000000000201', 'g1'),  ('e2000000-0000-0000-0000-000000000203', 'g3'),
  ('e2000000-0000-0000-0000-000000000204', 'g4'),  ('e2000000-0000-0000-0000-000000000206', 'g6'),
  ('e2000000-0000-0000-0000-000000000207', 'g7'),  ('e2000000-0000-0000-0000-000000000208', 'g8'),
  ('e2000000-0000-0000-0000-000000000209', 'g9'),  ('e2000000-0000-0000-0000-000000000210', 'g10'),
  ('e2000000-0000-0000-0000-000000000211', 'ga'),  ('e2000000-0000-0000-0000-000000000212', 'tpx'),
  ('e2000000-0000-0000-0000-000000000215', 'gp')
) x(f, n);
update students set user_id = (select id from u where name = 'st9') where id = 'e2000000-0000-0000-0000-000000000302';
update students set user_id = (select id from u where name = 'st8') where id = 'e2000000-0000-0000-0000-000000000303';
update students set user_id = (select id from u where name = 'st7') where id = 'e2000000-0000-0000-0000-000000000310';
update students set user_id = (select id from u where name = 'sa')  where id = 'e2000000-0000-0000-0000-000000000313';
insert into user_roles (user_id, role, scope_type, scope_id) values
  ((select id from u where name = 'tpx'), 'teacher', 'class', 'e2000000-0000-0000-0000-0000000001c1'),
  ((select id from u where name = 'tq'),  'teacher', 'class', 'e2000000-0000-0000-0000-0000000001b1'),
  ((select id from u where name = 'g3'),  'parent',  'org',   null);

-- AC#1-#4: linked after enrollment.
select is(pg_temp.role_in('g1', 'e2000000-0000-0000-0000-0000000001a1'), 'parent', 'AC#2 guardian linked after enrollment becomes a parent participant');
select is(pg_temp.role_in('st9', 'e2000000-0000-0000-0000-0000000001a1'), 'student', 'AC#3 Gr9 student whose login is set after enrollment becomes a student participant');
select is(pg_temp.role_in('st8', 'e2000000-0000-0000-0000-0000000001a1'), null, 'AC#4 Gr8 student whose login is set after enrollment is not a participant');

-- AC#2 edge cases: two classes in two sessions; two children in one class.
select is(pg_temp.role_in('g3', 'e2000000-0000-0000-0000-0000000001a1'), 'parent', 'guardian of children in two sessions joins class P');
select is(pg_temp.role_in('g3', 'e2000000-0000-0000-0000-0000000001b1'), 'parent', 'guardian of children in two sessions joins class Q');
select is(pg_temp.role_in('g3', 'e2000000-0000-0000-0000-0000000001c1'), null, 'guardian of children in two sessions does not join an unrelated class R');
select is(
  (select count(*)::int from conversation_participants cp join conversations c on c.id = cp.conversation_id
   where c.kind = 'class' and c.scope_id = 'e2000000-0000-0000-0000-0000000001a1' and cp.user_id = (select id from u where name = 'g4')),
  1, 'two children in the same class -> one participant row for their guardian');

-- AC#6 / AC#7: unlink, clear, repoint.
delete from family_members where user_id = (select id from u where name = 'g1');
select is(pg_temp.role_in('g1', 'e2000000-0000-0000-0000-0000000001a1'), null, 'AC#6 unlinked guardian is removed');
update students set user_id = null where id = 'e2000000-0000-0000-0000-000000000302';
select is(pg_temp.role_in('st9', 'e2000000-0000-0000-0000-0000000001a1'), null, 'AC#7 cleared student login is removed');
update students set user_id = (select id from u where name = 'ru1') where id = 'e2000000-0000-0000-0000-000000000308';
select is(pg_temp.role_in('ru1', 'e2000000-0000-0000-0000-0000000001a1'), 'student', 'Gr10 login set -> student participant (before repoint)');
update students set user_id = (select id from u where name = 'ru2') where id = 'e2000000-0000-0000-0000-000000000308';
select results_eq(
  $$select pg_temp.role_in('ru1', 'e2000000-0000-0000-0000-0000000001a1'), pg_temp.role_in('ru2', 'e2000000-0000-0000-0000-0000000001a1')$$,
  $$values (null::text, 'student'::text)$$,
  'AC#7 repointed student login: the old user leaves, the new user joins');

-- D-1: enrollment delete.
select is(pg_temp.role_in('g6', 'e2000000-0000-0000-0000-0000000001c1'), 'parent', 'guardian of a child in R is a participant (before the enrollment is deleted)');
delete from enrollments where id = 'e2000000-0000-0000-0000-000000000409';
select is(pg_temp.role_in('g6', 'e2000000-0000-0000-0000-0000000001c1'), null, 'D-1 deleting the only enrollment removes the family from R');

-- D-1: enrollment moves class P -> D in one statement.
update enrollments set class_id = 'e2000000-0000-0000-0000-0000000001d1' where id = 'e2000000-0000-0000-0000-000000000410';
select results_eq(
  $$select pg_temp.role_in('g7', 'e2000000-0000-0000-0000-0000000001a1'), pg_temp.role_in('st7', 'e2000000-0000-0000-0000-0000000001a1'),
           pg_temp.role_in('g7', 'e2000000-0000-0000-0000-0000000001d1'), pg_temp.role_in('st7', 'e2000000-0000-0000-0000-0000000001d1')$$,
  $$values (null::text, null::text, 'parent'::text, 'student'::text)$$,
  'D-1 enrollment class change: guardian and Gr9 student leave P and join D');

-- D-1: student moves family G8 -> G9.
select is(pg_temp.role_in('g8', 'e2000000-0000-0000-0000-0000000001c1'), 'parent', 'G8 guardian is in R (before the student moves family)');
update students set family_id = 'e2000000-0000-0000-0000-000000000209' where id = 'e2000000-0000-0000-0000-000000000311';
select results_eq(
  $$select pg_temp.role_in('g8', 'e2000000-0000-0000-0000-0000000001c1'), pg_temp.role_in('g9', 'e2000000-0000-0000-0000-0000000001c1')$$,
  $$values (null::text, 'parent'::text)$$,
  'D-1 student family change: the old family''s guardian leaves R, the new family''s joins');

-- Re-enrol after withdrawal (a new enrollment row).
update enrollments set status = 'withdrawn' where id = 'e2000000-0000-0000-0000-000000000412';
select is(pg_temp.role_in('g10', 'e2000000-0000-0000-0000-0000000001b1'), null, 'withdrawal of the only child removes the guardian from Q');
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e2000000-0000-0000-0000-000000000499', 'e2000000-0000-0000-0000-000000000312', 'e2000000-0000-0000-0000-0000000001b1', 'e2000000-0000-0000-0000-000000000112', 'active');
select is(pg_temp.role_in('g10', 'e2000000-0000-0000-0000-0000000001b1'), 'parent', 're-enrolment restores the guardian to Q');

-- Auth cascades.
select is(pg_temp.role_in('ga', 'e2000000-0000-0000-0000-0000000001c1'), 'parent', 'guardian ga is in R (before their Auth user is deleted)');
select is(pg_temp.role_in('sa', 'e2000000-0000-0000-0000-0000000001c1'), 'student', 'student sa is in R (before their Auth user is deleted)');
delete from auth.users where id = (select id from u where name = 'ga');
select is((select count(*)::int from conversation_participants where user_id = (select id from u where name = 'ga')), 0,
  'deleting a guardian''s Auth user leaves no participant row');
delete from auth.users where id = (select id from u where name = 'sa');
select results_eq(
  $$select (select user_id from students where id = 'e2000000-0000-0000-0000-000000000313'),
           (select count(*)::int from conversation_participants where user_id = (select id from u where name = 'sa'))$$,
  $$values (null::uuid, 0)$$,
  'deleting a student''s Auth user nulls students.user_id and leaves no participant row');

-- Review focus 1: Auth delete of a user who is both teacher and parent of R.
select is(pg_temp.role_in('tpx', 'e2000000-0000-0000-0000-0000000001c1'), 'teacher', 'tpx is R''s teacher (and a parent there)');
select lives_ok($$delete from auth.users where id = (select id from u where name = 'tpx')$$,
  'deleting the Auth user of a teacher-parent succeeds (no recount re-inserts a vanishing user)');
select is((select count(*)::int from conversation_participants where user_id = (select id from u where name = 'tpx')), 0,
  'no participant row remains for the deleted teacher-parent');

-- Review focus 2: one multi-row enrollments insert (seed / CSV phase 2 shape).
insert into families (id, label) values
  ('e2000000-0000-0000-0000-000000000231', '200 G-mr'), ('e2000000-0000-0000-0000-000000000232', '200 G-gm');
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  ('e2000000-0000-0000-0000-000000000331', 'e2000000-0000-0000-0000-000000000231', 'Mr', 'Nine', 'Gr9', (select id from u where name = 'mr9')),
  ('e2000000-0000-0000-0000-000000000332', 'e2000000-0000-0000-0000-000000000231', 'Mr', 'Eight', 'Gr8', (select id from u where name = 'mr8')),
  ('e2000000-0000-0000-0000-000000000333', 'e2000000-0000-0000-0000-000000000232', 'Mr', 'Child', 'Gr7', null);
insert into family_members (family_id, user_id, relationship) values
  ('e2000000-0000-0000-0000-000000000232', (select id from u where name = 'gm'), 'guardian');
insert into enrollments (student_id, class_id, session_id, status) values
  ('e2000000-0000-0000-0000-000000000331', 'e2000000-0000-0000-0000-0000000001e1', 'e2000000-0000-0000-0000-000000000112', 'active'),
  ('e2000000-0000-0000-0000-000000000332', 'e2000000-0000-0000-0000-0000000001e1', 'e2000000-0000-0000-0000-000000000112', 'active'),
  ('e2000000-0000-0000-0000-000000000333', 'e2000000-0000-0000-0000-0000000001e1', 'e2000000-0000-0000-0000-000000000112', 'active');
select set_eq(
  $$select cp.user_id, cp.participant_role from conversation_participants cp
    join conversations c on c.id = cp.conversation_id and c.kind = 'class' and c.scope_id = 'e2000000-0000-0000-0000-0000000001e1'$$,
  $$select id, r from u join (values ('mr9', 'student'), ('gm', 'parent')) x(n, r) on x.n = u.name$$,
  'one multi-row enrollments insert yields exactly the Gr9 student and the guardian');

-- Review focus 3: an active-role switch changes no participant row.
create temp table switch_snap as
select id, conversation_id, user_id, participant_role, notify_level, notification_default from conversation_participants;
update user_roles set is_active = not is_active
where user_id in (select id from u where name in ('tq', 'g3'));
select set_eq(
  $$select id, conversation_id, user_id, participant_role, notify_level, notification_default from conversation_participants$$,
  $$select * from switch_snap$$,
  'flipping user_roles.is_active (active-role switch) changes no participant row');

-- Review focus 5: student login repointed to a user who is already a parent participant.
select is(pg_temp.role_in('gp', 'e2000000-0000-0000-0000-0000000001a1'), 'parent', 'gp is a parent participant of P');
update students set user_id = (select id from u where name = 'gp') where id = 'e2000000-0000-0000-0000-000000000315';
select results_eq(
  $$select count(*)::int, min(cp.participant_role) from conversation_participants cp
    join conversations c on c.id = cp.conversation_id and c.kind = 'class' and c.scope_id = 'e2000000-0000-0000-0000-0000000001a1'
    where cp.user_id = (select id from u where name = 'gp')$$,
  $$values (1, 'parent'::text)$$,
  'a student login set to an existing parent participant: one row, label parent, no duplicate-key error');

-- Written as service_role (the CSV import's role): the revokes do not stop the triggers.
select id as v_g16 from u where name = 'g16' \gset
set local role service_role;
insert into family_members (family_id, user_id, relationship)
values ('e2000000-0000-0000-0000-000000000216', :'v_g16'::uuid, 'guardian');
reset role;
select is(pg_temp.role_in('g16', 'e2000000-0000-0000-0000-0000000001b1'), 'parent', 'a guardian linked by service_role becomes a parent participant');

select * from finish();
rollback;

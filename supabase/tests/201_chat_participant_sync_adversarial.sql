-- Adversarial membership matrix for class chat (issue #119, ADR-2026-11-13-class-chat-membership-recount,
-- spec AC#10). §11.3: role × scope × grade × ground-count.
--
-- EVERY fixture is written ENROL-FIRST: the enrollment row exists before the guardian's
-- family_members row is inserted and before the student's user_id is set. That is the order the
-- CSV import (ADR-0022 phase 2 -> phase 3) and the seed both use, and the order 060 never tested.
--
-- Access is probed as the user: claims + `authenticated` role, then count the one message posted
-- in the conversation. 1 = can read the chat, 0 = cannot. Never asserted after
-- tests.clear_authentication(), which leaves the session a superuser that bypasses RLS.
--
-- No vacuous DENYs: every removal DENY (withdrawal, unlink, clear, regrade 9->8) follows a GRANT
-- for the same user in this file, so the 0 proves a removal, not a user who was never added.
-- The never-granted DENYs (Gr 7, Gr 8, class-B parent, withdrawn family) are each paired with a
-- GRANT for a user in the same conversation, so the probe is shown to return 1 when it should.
begin;
select plan(22);

-- Reads `messages` in one conversation as p_user under RLS, then returns to the superuser.
-- Dynamic SQL so the count is planned after the role switch.
create function public.t201_reads(p_user uuid, p_conv uuid) returns integer
language plpgsql volatile
as $$
declare
  v_n integer;
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user::text, 'role', 'authenticated', 'active_role', 'parent')::text, true);
  perform set_config('role', 'authenticated', true);
  execute 'select count(*)::int from public.messages where conversation_id = $1' into v_n using p_conv;
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Fixture: one session, class A (the pilot's combined '7, 8, 9' shape) and class B.
-- ---------------------------------------------------------------------------------------------
insert into centers (id, name) values ('e2010000-0000-0000-0000-000000000001', '201 Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('e2010000-0000-0000-0000-000000000011', 'e2010000-0000-0000-0000-000000000001', '201 Session',
   '2026-01-01', '2026-06-01', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', '201 A', '7, 8, 9'),
  ('e2010000-0000-0000-0000-0000000000b1', 'e2010000-0000-0000-0000-000000000011', '201 B', '7, 8, 9');

select tests.create_supabase_user('t201-teacher-parent@test.local') as v_teacher_parent \gset
select tests.create_supabase_user('t201-two-home@test.local') as v_two_home \gset
select tests.create_supabase_user('t201-sib-parent@test.local') as v_sib_parent \gset
select tests.create_supabase_user('t201-wd-parent@test.local') as v_wd_parent \gset
select tests.create_supabase_user('t201-parent-b@test.local') as v_parent_b \gset
select tests.create_supabase_user('t201-parent-unlink@test.local') as v_parent_unlink \gset
select tests.create_supabase_user('t201-stu9@test.local') as v_stu9 \gset
select tests.create_supabase_user('t201-stu8@test.local') as v_stu8 \gset
select tests.create_supabase_user('t201-stu7@test.local') as v_stu7 \gset
select tests.create_supabase_user('t201-stu-regrade@test.local') as v_stu_regrade \gset
select tests.create_supabase_user('t201-stu-clear@test.local') as v_stu_clear \gset

insert into families (id, label) values
  ('e2010000-0000-0000-0000-000000000021', '201 F1 teacher-parent'),
  ('e2010000-0000-0000-0000-000000000022', '201 F2 two-home (1)'),
  ('e2010000-0000-0000-0000-000000000023', '201 F3 two-home (2)'),
  ('e2010000-0000-0000-0000-000000000024', '201 F4 siblings'),
  ('e2010000-0000-0000-0000-000000000025', '201 F5 withdrawn'),
  ('e2010000-0000-0000-0000-000000000026', '201 F6 class B'),
  ('e2010000-0000-0000-0000-000000000027', '201 F7 unlink'),
  ('e2010000-0000-0000-0000-000000000029', '201 F9 student logins (no guardian linked)');

-- Students carry no login yet (CSV phase 2 shape).
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('e2010000-0000-0000-0000-000000000031', 'e2010000-0000-0000-0000-000000000021', 'F1', 'Child', 'Gr8'),
  ('e2010000-0000-0000-0000-000000000032', 'e2010000-0000-0000-0000-000000000022', 'F2', 'Child', 'Gr7'),
  ('e2010000-0000-0000-0000-000000000033', 'e2010000-0000-0000-0000-000000000023', 'F3', 'Child', '8'),
  ('e2010000-0000-0000-0000-000000000034', 'e2010000-0000-0000-0000-000000000024', 'F4', 'Leaving', 'Gr7'),
  ('e2010000-0000-0000-0000-000000000035', 'e2010000-0000-0000-0000-000000000024', 'F4', 'Staying', 'Gr8'),
  ('e2010000-0000-0000-0000-000000000036', 'e2010000-0000-0000-0000-000000000025', 'F5', 'Child', 'Gr8'),
  ('e2010000-0000-0000-0000-000000000037', 'e2010000-0000-0000-0000-000000000026', 'F6', 'Child', 'Gr8'),
  ('e2010000-0000-0000-0000-000000000038', 'e2010000-0000-0000-0000-000000000027', 'F7', 'Child', 'Gr7'),
  ('e2010000-0000-0000-0000-000000000041', 'e2010000-0000-0000-0000-000000000029', 'Stu', 'Nine', 'Gr9'),
  ('e2010000-0000-0000-0000-000000000042', 'e2010000-0000-0000-0000-000000000029', 'Stu', 'Eight', '8'),
  ('e2010000-0000-0000-0000-000000000043', 'e2010000-0000-0000-0000-000000000029', 'Stu', 'Seven', 'Gr7'),
  ('e2010000-0000-0000-0000-000000000044', 'e2010000-0000-0000-0000-000000000029', 'Stu', 'Regrade', '9'),
  ('e2010000-0000-0000-0000-000000000045', 'e2010000-0000-0000-0000-000000000029', 'Stu', 'Clear', 'Gr9');

-- 1. ENROL (all active; F6's child in B, everyone else in A).
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e2010000-0000-0000-0000-000000000051', 'e2010000-0000-0000-0000-000000000031', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000052', 'e2010000-0000-0000-0000-000000000032', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000053', 'e2010000-0000-0000-0000-000000000033', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000054', 'e2010000-0000-0000-0000-000000000034', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000055', 'e2010000-0000-0000-0000-000000000035', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000056', 'e2010000-0000-0000-0000-000000000036', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000057', 'e2010000-0000-0000-0000-000000000037', 'e2010000-0000-0000-0000-0000000000b1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000058', 'e2010000-0000-0000-0000-000000000038', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000061', 'e2010000-0000-0000-0000-000000000041', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000062', 'e2010000-0000-0000-0000-000000000042', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000063', 'e2010000-0000-0000-0000-000000000043', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000064', 'e2010000-0000-0000-0000-000000000044', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active'),
  ('e2010000-0000-0000-0000-000000000065', 'e2010000-0000-0000-0000-000000000045', 'e2010000-0000-0000-0000-0000000000a1', 'e2010000-0000-0000-0000-000000000011', 'active');

-- F5's only child withdraws before the guardian is ever linked.
update enrollments set status = 'withdrawn' where id = 'e2010000-0000-0000-0000-000000000056';

-- 2. THEN LINK (CSV phase 3 shape): teacher grant, guardians, student logins.
insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_teacher_parent'::uuid, 'teacher', 'class', 'e2010000-0000-0000-0000-0000000000a1'::uuid);

insert into family_members (family_id, user_id, relationship) values
  ('e2010000-0000-0000-0000-000000000021', :'v_teacher_parent'::uuid, 'guardian'),
  ('e2010000-0000-0000-0000-000000000022', :'v_two_home'::uuid, 'guardian'),
  ('e2010000-0000-0000-0000-000000000023', :'v_two_home'::uuid, 'guardian'),
  ('e2010000-0000-0000-0000-000000000024', :'v_sib_parent'::uuid, 'guardian'),
  ('e2010000-0000-0000-0000-000000000025', :'v_wd_parent'::uuid, 'guardian'),
  ('e2010000-0000-0000-0000-000000000026', :'v_parent_b'::uuid, 'guardian'),
  ('e2010000-0000-0000-0000-000000000027', :'v_parent_unlink'::uuid, 'guardian');

update students set user_id = :'v_stu9'::uuid        where id = 'e2010000-0000-0000-0000-000000000041';
update students set user_id = :'v_stu8'::uuid        where id = 'e2010000-0000-0000-0000-000000000042';
update students set user_id = :'v_stu7'::uuid        where id = 'e2010000-0000-0000-0000-000000000043';
update students set user_id = :'v_stu_regrade'::uuid where id = 'e2010000-0000-0000-0000-000000000044';
update students set user_id = :'v_stu_clear'::uuid   where id = 'e2010000-0000-0000-0000-000000000045';

select id as v_a from conversations where kind = 'class' and scope_id = 'e2010000-0000-0000-0000-0000000000a1'::uuid \gset
select id as v_b from conversations where kind = 'class' and scope_id = 'e2010000-0000-0000-0000-0000000000b1'::uuid \gset

-- One message in each class conversation (superuser insert; the probe only reads).
insert into messages (conversation_id, sender_user_id, body) values
  (:'v_a'::uuid, :'v_teacher_parent'::uuid, '201 message in A'),
  (:'v_b'::uuid, :'v_teacher_parent'::uuid, '201 message in B');

-- ---------------------------------------------------------------------------------------------
-- GROUP 1: linked after enrollment — the defect (AC#1-#4, #9)
-- ---------------------------------------------------------------------------------------------
select is(public.t201_reads(:'v_teacher_parent'::uuid, :'v_a'::uuid), 1, 'GRANT parent linked after enrollment reads A (F1, teacher-parent)');
select is(public.t201_reads(:'v_two_home'::uuid, :'v_a'::uuid), 1, 'GRANT parent linked after enrollment reads A (F2/F3, two-household guardian)');
select is(public.t201_reads(:'v_sib_parent'::uuid, :'v_a'::uuid), 1, 'GRANT parent linked after enrollment reads A (F4, two siblings)');
select is(public.t201_reads(:'v_parent_unlink'::uuid, :'v_a'::uuid), 1, 'GRANT parent linked after enrollment reads A (F7, later unlinked)');
select is(public.t201_reads(:'v_stu9'::uuid, :'v_a'::uuid), 1, 'GRANT Gr9 student linked after enrollment reads A');
select is(public.t201_reads(:'v_stu_regrade'::uuid, :'v_a'::uuid), 1, 'GRANT grade-''9'' student (seed spelling) linked after enrollment reads A');
select is(public.t201_reads(:'v_stu_clear'::uuid, :'v_a'::uuid), 1, 'GRANT Gr9 student (later cleared) linked after enrollment reads A');
select is(public.t201_reads(:'v_parent_b'::uuid, :'v_b'::uuid), 1, 'GRANT parent of class B reads B (control for the class-B DENY)');

select is(public.t201_reads(:'v_stu8'::uuid, :'v_a'::uuid), 0, 'DENY Gr8 student in the combined class');
select is(public.t201_reads(:'v_stu7'::uuid, :'v_a'::uuid), 0, 'DENY Gr7 student in the combined class');
select is(public.t201_reads(:'v_parent_b'::uuid, :'v_a'::uuid), 0, 'DENY parent of class B reads A');
select is(public.t201_reads(:'v_wd_parent'::uuid, :'v_a'::uuid), 0, 'DENY family whose only child withdrew');

-- ---------------------------------------------------------------------------------------------
-- GROUP 2: grounds that must survive a removal event (sibling guard, multi-ground)
-- ---------------------------------------------------------------------------------------------
update enrollments set status = 'withdrawn' where id = 'e2010000-0000-0000-0000-000000000054';  -- F4 S1 leaves
select is(public.t201_reads(:'v_sib_parent'::uuid, :'v_a'::uuid), 1, 'GRANT sibling guard: parent keeps A after one child withdraws');

-- notify_level is the participant's own choice; a recount must never reset it.
update conversation_participants set notify_level = 'muted'
  where conversation_id = :'v_a'::uuid and user_id = :'v_teacher_parent'::uuid;

update enrollments set status = 'withdrawn' where id = 'e2010000-0000-0000-0000-000000000051';  -- F1 child leaves
select is(public.t201_reads(:'v_teacher_parent'::uuid, :'v_a'::uuid), 1, 'GRANT teacher-parent keeps A after own child withdraws');

update enrollments set status = 'active' where id = 'e2010000-0000-0000-0000-000000000051';     -- F1 child back
delete from user_roles
  where user_id = :'v_teacher_parent'::uuid and role = 'teacher' and scope_type = 'class'
    and scope_id = 'e2010000-0000-0000-0000-0000000000a1'::uuid;
select is(public.t201_reads(:'v_teacher_parent'::uuid, :'v_a'::uuid), 1, 'GRANT teacher-parent keeps A after losing the teacher role, as parent');
select is(
  (select participant_role from conversation_participants where conversation_id = :'v_a'::uuid and user_id = :'v_teacher_parent'::uuid),
  'parent', 'teacher-parent who lost the teacher role is relabelled parent in place');
select is(
  (select notify_level from conversation_participants where conversation_id = :'v_a'::uuid and user_id = :'v_teacher_parent'::uuid),
  'muted', 'notify_level survives a recount');

delete from family_members
  where family_id = 'e2010000-0000-0000-0000-000000000022' and user_id = :'v_two_home'::uuid;
select is(public.t201_reads(:'v_two_home'::uuid, :'v_a'::uuid), 1, 'GRANT two-household guardian keeps A after unlinking from one');

-- ---------------------------------------------------------------------------------------------
-- GROUP 3: removals (each user was GRANTed in GROUP 1)
-- ---------------------------------------------------------------------------------------------
update students set grade_level = '8' where id = 'e2010000-0000-0000-0000-000000000044';
select is(public.t201_reads(:'v_stu_regrade'::uuid, :'v_a'::uuid), 0, 'DENY regrade 9->8 removes');
update students set grade_level = '9' where id = 'e2010000-0000-0000-0000-000000000044';
select is(public.t201_reads(:'v_stu_regrade'::uuid, :'v_a'::uuid), 1, 'GRANT regrade 8->9 restores');

delete from family_members
  where family_id = 'e2010000-0000-0000-0000-000000000027' and user_id = :'v_parent_unlink'::uuid;
select is(public.t201_reads(:'v_parent_unlink'::uuid, :'v_a'::uuid), 0, 'DENY unlinked guardian');

update students set user_id = null where id = 'e2010000-0000-0000-0000-000000000045';
select is(public.t201_reads(:'v_stu_clear'::uuid, :'v_a'::uuid), 0, 'DENY cleared student login');

select * from finish();
rollback;

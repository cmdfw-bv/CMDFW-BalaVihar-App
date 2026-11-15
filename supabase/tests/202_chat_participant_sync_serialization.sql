-- Class-chat membership: recount serialization (#134) and staff-role moves (#135).
-- Issue #119, ADR-2026-11-13-class-chat-membership-recount.
--
-- #134: two transactions that each change one class's membership must not both recount from a
-- stale snapshot (a withdrawal racing a guardian link left a withdrawn-only family in the chat).
-- The guarantee is that every recount takes a per-class transaction-scoped advisory lock before
-- it reads, so a concurrent recount of the same class waits for the other to commit. A race
-- cannot be staged inside one pgTAP transaction, so this file asserts the lock is held — keyed to
-- exactly that class, and not to an untouched one. The two-session reproduction is recorded in
-- the issue.
--
-- #135: user_roles fired on insert/delete only, so moving a teacher (or coordinator) to another
-- scope by UPDATE left the old membership in place. An update is now delete-old + insert-new;
-- an is_active-only update (the auth hook's active-role switch) still fires nothing (200 covers it).
begin;
select plan(10);

-- Is the recount lock for this class held by this backend? Mirrors the key in
-- recount_class_participants: one bigint key, shown in pg_locks as classid (high) / objid (low).
create function pg_temp.recount_lock_held(p_class uuid) returns boolean
language sql volatile
as $$
  select exists (
    select 1 from pg_locks l,
      lateral (select hashtextextended('class_chat_recount:' || p_class::text, 0) as k) key
    where l.locktype = 'advisory' and l.pid = pg_backend_pid() and l.objsubid = 1
      and l.classid = ((key.k >> 32) & 4294967295)::oid
      and l.objid = (key.k & 4294967295)::oid
  );
$$;

create temp table u (name text primary key, id uuid not null);
insert into u
select n, tests.create_supabase_user('t202-' || n || '@test.local')
from unnest(array['par','teach','tpar','coord']) n;

create function pg_temp.role_in(p_user text, p_kind text, p_scope uuid) returns text
language sql stable
as $$
  select cp.participant_role from conversation_participants cp
  join conversations c on c.id = cp.conversation_id and c.kind = p_kind and c.scope_id = p_scope
  where cp.user_id = (select id from u where name = p_user);
$$;

insert into centers (id, name) values ('e2020000-0000-0000-0000-000000000001', '202 Center');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('e2020000-0000-0000-0000-000000000011', 'e2020000-0000-0000-0000-000000000001', '202 S1',
   '2026-01-01', '2026-06-01', 0, '09:00', '10:30'),
  ('e2020000-0000-0000-0000-000000000012', 'e2020000-0000-0000-0000-000000000001', '202 S2',
   '2026-01-01', '2026-06-01', 0, '11:00', '12:30');
insert into classes (id, session_id, name, grade_band) values
  ('e2020000-0000-0000-0000-0000000000a1', 'e2020000-0000-0000-0000-000000000011', '202 A', '7, 8, 9'),
  ('e2020000-0000-0000-0000-0000000000b1', 'e2020000-0000-0000-0000-000000000011', '202 B', '7, 8, 9'),
  ('e2020000-0000-0000-0000-0000000000c1', 'e2020000-0000-0000-0000-000000000011', '202 C', '7, 8, 9');

-- =============================================================================================
-- #134 — every recount takes the per-class lock
-- =============================================================================================

-- Class C is never touched by a membership event in this file: its lock must stay free (control).
select is(pg_temp.recount_lock_held('e2020000-0000-0000-0000-0000000000c1'), false,
  'no recount lock on a class with no membership event (control: the probe can say false)');

-- Direct call path.
select public.recount_class_participants('e2020000-0000-0000-0000-0000000000b1');
select is(pg_temp.recount_lock_held('e2020000-0000-0000-0000-0000000000b1'), true,
  'recount_class_participants(B) holds B''s recount lock until the transaction ends');

-- Trigger path: the exact #134 shape — a guardian linked to a family enrolled in A.
insert into families (id, label) values
  ('e2020000-0000-0000-0000-000000000021', '202 F'),
  ('e2020000-0000-0000-0000-000000000022', '202 Ftpar');
insert into students (id, family_id, first_name, last_name, grade_level) values
  ('e2020000-0000-0000-0000-000000000031', 'e2020000-0000-0000-0000-000000000021', 'R', 'Child', 'Gr7'),
  ('e2020000-0000-0000-0000-000000000032', 'e2020000-0000-0000-0000-000000000022', 'T', 'Child', 'Gr8');
insert into enrollments (id, student_id, class_id, session_id, status) values
  ('e2020000-0000-0000-0000-000000000041', 'e2020000-0000-0000-0000-000000000031', 'e2020000-0000-0000-0000-0000000000a1', 'e2020000-0000-0000-0000-000000000011', 'active'),
  ('e2020000-0000-0000-0000-000000000042', 'e2020000-0000-0000-0000-000000000032', 'e2020000-0000-0000-0000-0000000000a1', 'e2020000-0000-0000-0000-000000000011', 'active');
insert into family_members (family_id, user_id, relationship)
select 'e2020000-0000-0000-0000-000000000021'::uuid, id, 'guardian' from u where name = 'par'
union all select 'e2020000-0000-0000-0000-000000000022'::uuid, id, 'guardian' from u where name = 'tpar';
select is(pg_temp.recount_lock_held('e2020000-0000-0000-0000-0000000000a1'), true,
  'a family_members link (trigger path) holds the enrolled class''s recount lock');
select is(pg_temp.recount_lock_held('e2020000-0000-0000-0000-0000000000c1'), false,
  'and the lock is per class: C is still free');

-- =============================================================================================
-- #135 — staff role moved by UPDATE
-- =============================================================================================
insert into user_roles (user_id, role, scope_type, scope_id)
select id, 'teacher'::app_role, 'class'::app_scope_type, 'e2020000-0000-0000-0000-0000000000a1'::uuid from u where name in ('teach', 'tpar')
union all
select id, 'coordinator'::app_role, 'session'::app_scope_type, 'e2020000-0000-0000-0000-000000000011'::uuid from u where name = 'coord';

select is(pg_temp.role_in('teach', 'class', 'e2020000-0000-0000-0000-0000000000a1'), 'teacher',
  'precondition: the teacher is a teacher participant of A (the move below is not vacuous)');

update user_roles set scope_id = 'e2020000-0000-0000-0000-0000000000b1'
where user_id = (select id from u where name = 'teach') and role = 'teacher';
select is(pg_temp.role_in('teach', 'class', 'e2020000-0000-0000-0000-0000000000a1'), null,
  'teacher moved A -> B by UPDATE is removed from A');
select is(pg_temp.role_in('teach', 'class', 'e2020000-0000-0000-0000-0000000000b1'), 'teacher',
  'teacher moved A -> B by UPDATE is added to B');

-- A teacher who is also an active parent in A keeps A as a parent after moving to B.
update user_roles set scope_id = 'e2020000-0000-0000-0000-0000000000b1'
where user_id = (select id from u where name = 'tpar') and role = 'teacher';
select is(pg_temp.role_in('tpar', 'class', 'e2020000-0000-0000-0000-0000000000a1'), 'parent',
  'teacher-parent moved A -> B stays in A, relabelled parent');

-- Coordinator moved S1 -> S2: the session_staff branch has the same gap.
update user_roles set scope_id = 'e2020000-0000-0000-0000-000000000012'
where user_id = (select id from u where name = 'coord') and role = 'coordinator';
select is(pg_temp.role_in('coord', 'session_staff', 'e2020000-0000-0000-0000-000000000011'), null,
  'coordinator moved S1 -> S2 by UPDATE is removed from S1''s staff chat');
select is(pg_temp.role_in('coord', 'session_staff', 'e2020000-0000-0000-0000-000000000012'), 'coordinator',
  'coordinator moved S1 -> S2 by UPDATE is added to S2''s staff chat');

select * from finish();
rollback;

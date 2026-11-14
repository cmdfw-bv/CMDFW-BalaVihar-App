-- Class-chat membership recount (issue #119, ADR-2026-11-13-class-chat-membership-recount).
--
-- Who belongs to a class conversation is decided by ONE rule, class_chat_entitled(class_id):
--   teacher  user_roles(role 'teacher', scope class)             -- is_active ignored (it marks the
--                                                                    selected role, not the grant)
--   parent   any family_members row of a family with a child holding an ACTIVE enrollment in the class
--            (any relationship — ratified)
--   student  students.user_id of a student with an ACTIVE enrollment in the class AND is_hs_grade
-- Label precedence teacher > parent > student. recount_class_participants(class_id) reconciles the
-- stored rows to that rule: delete the unentitled, relabel in place (notify_level and
-- notification_default untouched), insert the missing. Every event that can change a class's
-- membership calls it, so membership no longer depends on the order in which logins and
-- enrollments arrive (ADR-0022 leaves the CSV import linking logins after enrollment).
--
-- This migration changes NO existing rows; it changes what future writes do. The one-time repair
-- of existing rows is the next migration (20261113130000), applied on staging only after the
-- read-only preview has been read (spec "Staging repair").
--
-- Replaces the bodies of sync_class_participants() and sync_staff_participants() from
-- 20260709043451_chat_sync_triggers.sql (that file is never edited). The session_staff and
-- leadership branches of sync_staff_participants() are unchanged.

-- ---------------------------------------------------------------------------------------------
-- The grade band (ADR-0015: students join class chat from Gr 9). Accepts both spellings in use
-- until #93 reconciles them: '9'..'12' (seed) and 'Gr9'..'Gr12' (CRM import). Anything else —
-- null, blank, other case or spacing, 'HS9', PreK, KG — is false (fail closed).
-- ---------------------------------------------------------------------------------------------
create or replace function public.is_hs_grade(p_grade text)
returns boolean
language sql
immutable
security definer
set search_path = public
as $$
  select coalesce(p_grade in ('9', '10', '11', '12', 'Gr9', 'Gr10', 'Gr11', 'Gr12'), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- The entitled set for one class conversation. One row per user, label by precedence.
-- Joined to auth.users so a user whose Auth row is being deleted (cascade in flight) is never
-- re-inserted by a recount fired from that cascade.
-- ---------------------------------------------------------------------------------------------
create or replace function public.class_chat_entitled(p_class_id uuid)
returns table (user_id uuid, participant_role text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (g.user_id) g.user_id, g.participant_role
  from (
    select ur.user_id, 'teacher'::text as participant_role, 1 as rank
    from user_roles ur
    where ur.role = 'teacher' and ur.scope_type = 'class' and ur.scope_id = p_class_id

    union all

    select fm.user_id, 'parent'::text, 2
    from family_members fm
    where exists (
      select 1
      from students s
      join enrollments e on e.student_id = s.id
      where s.family_id = fm.family_id
        and e.class_id = p_class_id
        and e.status = 'active'
    )

    union all

    select s.user_id, 'student'::text, 3
    from students s
    join enrollments e on e.student_id = s.id
    where e.class_id = p_class_id
      and e.status = 'active'
      and s.user_id is not null
      and public.is_hs_grade(s.grade_level)
  ) g
  join auth.users au on au.id = g.user_id
  order by g.user_id, g.rank;
$$;

-- ---------------------------------------------------------------------------------------------
-- Reconcile one class conversation to the rule. Idempotent. Returns quietly if the class has no
-- conversation row. Touches only that one kind = 'class' conversation.
--
-- Serialized per class (#134): the first statement takes a transaction-scoped advisory lock keyed
-- to the class. Without it, two transactions that each change one class's membership (e.g. a
-- withdrawal racing a guardian link) both recount from their own snapshot, and the later commit
-- re-adds people the earlier one removed. With it, the second recount waits until the first
-- commits; this function is volatile, so under READ COMMITTED each statement after the lock takes
-- a fresh snapshot that includes that commit. The enrollments/family_members/students triggers
-- recount several classes in class_id order, so two such transactions do not take the same pair
-- of locks in opposite order. (The admin-only user_roles move recounts old then new; a deadlock
-- there is detected by Postgres and aborts one transaction (40P01) — it cannot corrupt membership.)
-- ---------------------------------------------------------------------------------------------
create or replace function public.recount_class_participants(p_class_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('class_chat_recount:' || p_class_id::text, 0));

  select c.id into v_conversation_id
  from conversations c
  where c.kind = 'class' and c.scope_type = 'class' and c.scope_id = p_class_id;

  if v_conversation_id is null then
    return;
  end if;

  delete from conversation_participants cp
  where cp.conversation_id = v_conversation_id
    and not exists (
      select 1 from public.class_chat_entitled(p_class_id) e where e.user_id = cp.user_id
    );

  update conversation_participants cp
  set participant_role = e.participant_role
  from public.class_chat_entitled(p_class_id) e
  where cp.conversation_id = v_conversation_id
    and cp.user_id = e.user_id
    and cp.participant_role <> e.participant_role;

  insert into conversation_participants (conversation_id, user_id, participant_role)
  select v_conversation_id, e.user_id, e.participant_role
  from public.class_chat_entitled(p_class_id) e
  on conflict (conversation_id, user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Read-only preview for the staging repair (plan P-3). COUNTS ONLY — no user ids, no names
-- (minors' data minimization). `stable`, so Postgres refuses any insert/update/delete inside it.
-- action: 'add' | 'remove' | 'relabel'; for 'relabel', participant_role is the NEW label;
-- for 'remove', the stored label. Only non-zero counts are returned.
-- ---------------------------------------------------------------------------------------------
create or replace function public.class_chat_membership_preview()
returns table (class_id uuid, action text, participant_role text, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  with conv as (
    select c.id as conversation_id, c.scope_id as class_id
    from conversations c
    where c.kind = 'class' and c.scope_type = 'class'
  ),
  entitled as (
    select conv.conversation_id, conv.class_id, e.user_id, e.participant_role
    from conv
    cross join lateral public.class_chat_entitled(conv.class_id) e
  ),
  stored as (
    select conv.conversation_id, conv.class_id, cp.user_id, cp.participant_role
    from conv
    join conversation_participants cp on cp.conversation_id = conv.conversation_id
  ),
  diff as (
    select en.class_id, 'add'::text as action, en.participant_role
    from entitled en
    where not exists (
      select 1 from stored st where st.conversation_id = en.conversation_id and st.user_id = en.user_id
    )
    union all
    select st.class_id, 'remove'::text, st.participant_role
    from stored st
    where not exists (
      select 1 from entitled en where en.conversation_id = st.conversation_id and en.user_id = st.user_id
    )
    union all
    select en.class_id, 'relabel'::text, en.participant_role
    from entitled en
    join stored st on st.conversation_id = en.conversation_id and st.user_id = en.user_id
    where st.participant_role <> en.participant_role
  )
  select d.class_id, d.action, d.participant_role, count(*)::bigint
  from diff d
  group by d.class_id, d.action, d.participant_role;
$$;

revoke execute on function public.is_hs_grade(text) from public, anon, authenticated;
revoke execute on function public.class_chat_entitled(uuid) from public, anon, authenticated;
revoke execute on function public.recount_class_participants(uuid) from public, anon, authenticated;
revoke execute on function public.class_chat_membership_preview() from public, anon, authenticated;

-- =============================================================================================
-- Events -> recount. Row-level AFTER triggers, in the writing transaction. Each recounts every
-- class whose membership the row can affect; widening is impossible because the recount only
-- ever writes class_chat_entitled.
-- =============================================================================================

-- enrollments: insert / update / delete. Body replaced; the hand-written withdrawal delete is gone
-- (it removed people still entitled on another ground — ADR Decision 2). Recounts new.class_id,
-- and old.class_id on delete or when the enrollment moved class (D-1).
create or replace function public.sync_class_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.class_id is distinct from new.class_id then
    -- Both classes, in class_id order (lock ordering — see recount_class_participants).
    perform public.recount_class_participants(least(old.class_id, new.class_id));
    perform public.recount_class_participants(greatest(old.class_id, new.class_id));
  elsif tg_op in ('INSERT', 'UPDATE') then
    perform public.recount_class_participants(new.class_id);
  else
    perform public.recount_class_participants(old.class_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists enrollments_sync_participants on public.enrollments;
create trigger enrollments_sync_participants
after insert or update or delete on public.enrollments
for each row execute function public.sync_class_participants();

-- family_members: insert / update / delete. Recounts every class where a student of the old or new
-- family holds an enrollment of ANY status (ratified item 5: a withdrawn-only class still needs
-- its stale rows removed).
--
-- Repeats to a fixpoint (#134 re-audit). The class list is read BEFORE any recount lock is taken,
-- so an enrollment that moves class and commits while this trigger waits on a lock is missed by
-- the first pass. Each further pass is a new statement, so it reads with a fresh snapshot that
-- includes whatever committed during the wait, and recounts any class it has not done yet. The set
-- of classes is finite, so the loop ends.
create or replace function public.sync_family_member_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_done uuid[] := '{}';
  v_found boolean;
begin
  loop
    v_found := false;
    for v_class_id in
      select distinct e.class_id
      from enrollments e
      join students s on s.id = e.student_id
      where s.family_id in (
        case when tg_op in ('UPDATE', 'DELETE') then old.family_id end,
        case when tg_op in ('INSERT', 'UPDATE') then new.family_id end
      )
        and e.class_id <> all (v_done)
      order by e.class_id
    loop
      perform public.recount_class_participants(v_class_id);
      v_done := v_done || v_class_id;
      v_found := true;
    end loop;
    exit when not v_found;
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists family_members_sync_participants on public.family_members;
create trigger family_members_sync_participants
after insert or update or delete on public.family_members
for each row execute function public.sync_family_member_participants();

-- students: the login (user_id), the grade, or the family changes. Fires on the referential
-- action too (auth.users delete -> user_id set null). Recounts every class where that student
-- holds an enrollment of any status. A family change also moves that family's guardians: the
-- recount of the student's own classes covers both the old and the new family. Repeats to a
-- fixpoint for the same reason as sync_family_member_participants (#134 re-audit).
create or replace function public.sync_student_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class_id uuid;
  v_done uuid[] := '{}';
  v_found boolean;
begin
  loop
    v_found := false;
    for v_class_id in
      select distinct e.class_id from enrollments e
      where e.student_id = new.id and e.class_id <> all (v_done)
      order by e.class_id
    loop
      perform public.recount_class_participants(v_class_id);
      v_done := v_done || v_class_id;
      v_found := true;
    end loop;
    exit when not v_found;
  end loop;
  return new;
end;
$$;

drop trigger if exists students_sync_participants on public.students;
create trigger students_sync_participants
after update of user_id, grade_level, family_id on public.students
for each row
when (old.user_id is distinct from new.user_id
   or old.grade_level is distinct from new.grade_level
   or old.family_id is distinct from new.family_id)
execute function public.sync_student_participants();

-- user_roles: the class-teacher branches change to the recount (a teacher who is also an active
-- parent there stays, relabelled parent). session_staff and leadership branches keep the
-- 20260709043451 behaviour. An UPDATE that moves a role (#135: role, scope or user changed) is the
-- old row's DELETE branch followed by the new row's INSERT branch; it fires from its own trigger
-- below, which ignores is_active-only updates (the auth hook's active-role switch).
create or replace function public.sync_staff_participants() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if tg_op in ('DELETE', 'UPDATE') then
    if old.scope_type = 'class' and old.role = 'teacher' then
      perform public.recount_class_participants(old.scope_id);
    elsif old.scope_type = 'session' and old.role = 'coordinator' then
      select id into v_conversation_id from conversations where kind='session_staff' and scope_type='session' and scope_id = old.scope_id;
    elsif old.scope_type = 'org' and old.role in ('bv_coordinator','admin') then
      select id into v_conversation_id from conversations where kind='leadership' and scope_type='org';
    end if;

    if v_conversation_id is not null then
      delete from conversation_participants where conversation_id = v_conversation_id and user_id = old.user_id;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    v_conversation_id := null;
  end if;

  if new.scope_type = 'class' and new.role = 'teacher' then
    perform public.recount_class_participants(new.scope_id);
  elsif new.scope_type = 'session' and new.role = 'coordinator' then
    select id into v_conversation_id from conversations where kind='session_staff' and scope_type='session' and scope_id = new.scope_id;
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, 'coordinator')
      on conflict (conversation_id, user_id) do nothing;
    end if;
  elsif new.scope_type = 'org' and new.role in ('bv_coordinator','admin') then
    select id into v_conversation_id from conversations where kind='leadership' and scope_type='org';
    if v_conversation_id is not null then
      insert into conversation_participants (conversation_id, user_id, participant_role)
      values (v_conversation_id, new.user_id, new.role)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- #135: the insert/delete trigger (20260709043451) never saw an UPDATE, so moving a role to another
-- scope left the old membership. A separate trigger, because a WHEN clause cannot reference OLD
-- on INSERT. is_active is deliberately not in the column list: the auth hook flips it on every
-- active-role switch, which must change no participant row.
drop trigger if exists user_roles_sync_participants_on_move on public.user_roles;
create trigger user_roles_sync_participants_on_move
after update of user_id, role, scope_type, scope_id on public.user_roles
for each row
when (old.user_id is distinct from new.user_id
   or old.role is distinct from new.role
   or old.scope_type is distinct from new.scope_type
   or old.scope_id is distinct from new.scope_id)
execute function public.sync_staff_participants();

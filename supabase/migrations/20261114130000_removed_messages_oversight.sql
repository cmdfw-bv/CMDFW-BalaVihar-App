-- Teacher -> chat-message-removal (issue #113, ADR-2026-11-14-chat-message-removal-move-aside).
-- Migration B: the oversight review list and Coordinator visibility of message audit entries.
-- Spec: .docs/specs/teacher/chat-message-removal.md, "Design -> Data & RLS impact".

-- ---------------------------------------------------------------------------------------------
-- 1. Keyset order for the review list: (removed_at desc, message_id desc).
-- ---------------------------------------------------------------------------------------------
create index message_removals_review_idx
  on public.message_removals (removed_at desc, message_id desc);

-- ---------------------------------------------------------------------------------------------
-- 2. get_removed_messages_for_oversight.
--
-- Only coordinator (session-scoped) and bv_coordinator/admin (org-wide) may call it. As in
-- remove_message, the JWT claim must be backed by the caller's live, active user_roles grant, and
-- every test fails closed (coalesce(..., false)); anything else raises 42501.
--
-- Pages on (p_before_removed_at, p_before_id) so ties on removed_at page cleanly (controller
-- ruling 2026-11-14; the spec's single p_before cannot page through ties). p_limit is capped at 50.
--
-- Labels, not names (human decision 2026-11-14): the database holds names only for students.
-- One audit_log 'read' row is written per returned message, in the same loop that returns it
-- (ADR-0019 shape). audit_log never holds message text.
-- ---------------------------------------------------------------------------------------------
create or replace function public.get_removed_messages_for_oversight(
  p_before_removed_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 20
)
returns table (
  message_id uuid,
  class_name text,
  sender_label text,
  sender_role text,
  created_at timestamptz,
  body text,
  remover_label text,
  removed_by_role text,
  removed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := nullif(auth.jwt()->>'active_role', '');
  v_scope_type text := nullif(auth.jwt()->>'scope_type', '');
  v_scope_id uuid;
  v_authorized boolean := false;
  v_limit int := greatest(least(coalesce(p_limit, 20), 50), 0);
  v_student_id uuid;
  r record;
begin
  -- A malformed scope_id claim must refuse, not surface a cast error.
  begin
    v_scope_id := nullif(auth.jwt()->>'scope_id', '')::uuid;
  exception when invalid_text_representation then
    v_scope_id := null;
  end;

  if v_uid is null or v_role is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_role = 'coordinator' then
    v_authorized := coalesce(
      v_scope_type = 'session'
      and v_scope_id is not null
      and exists (
        select 1 from public.user_roles ur
         where ur.user_id = v_uid and ur.is_active
           and ur.role = 'coordinator' and ur.scope_type = 'session' and ur.scope_id = v_scope_id
      ),
      false);
  elsif v_role in ('bv_coordinator','admin') then
    -- Org-scoped: the hook issues no scope_id for an org grant.
    v_authorized := coalesce(
      exists (
        select 1 from public.user_roles ur
         where ur.user_id = v_uid and ur.is_active
           and ur.role::text = v_role and ur.scope_type = 'org'
      ),
      false);
  end if;

  if not v_authorized then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  for r in
    select mr.message_id as r_message_id,
           cl.id as r_class_id,
           cl.name as r_class_name,
           m.sender_user_id as r_sender_user_id,
           m.sender_role as r_sender_role,
           m.created_at as r_created_at,
           mr.body as r_body,
           mr.removed_by_role as r_removed_by_role,
           mr.removed_at as r_removed_at
      from public.message_removals mr
      join public.messages m on m.id = mr.message_id
      join public.conversations cv on cv.id = mr.conversation_id and cv.kind = 'class'
      join public.classes cl on cl.id = cv.scope_id
     where (v_role <> 'coordinator' or cl.session_id = v_scope_id)
       and (
         p_before_removed_at is null
         or mr.removed_at < p_before_removed_at
         or (p_before_id is not null
             and mr.removed_at = p_before_removed_at
             and mr.message_id < p_before_id)
       )
     order by mr.removed_at desc, mr.message_id desc
     limit v_limit
  loop
    v_student_id := null;
    sender_label := null;

    if r.r_sender_role = 'student' then
      -- Same mapping as remove_message: prefer the student record enrolled in this class.
      select s.id, s.first_name || ' ' || left(s.last_name, 1) || '.'
        into v_student_id, sender_label
        from public.students s
       where s.user_id = r.r_sender_user_id
       order by exists (
                  select 1 from public.enrollments e
                   where e.student_id = s.id and e.class_id = r.r_class_id
                ) desc,
                s.created_at
       limit 1;
      sender_label := coalesce(sender_label, 'Student');
    elsif r.r_sender_role = 'parent' then
      -- The parent's family with an enrollment in this class (active first, then by label).
      select 'Parent · ' || f.label
        into sender_label
        from public.family_members fm
        join public.families f on f.id = fm.family_id
        join public.students s on s.family_id = f.id
        join public.enrollments e on e.student_id = s.id and e.class_id = r.r_class_id
       where fm.user_id = r.r_sender_user_id
       order by (e.status = 'active') desc, f.label, f.id
       limit 1;
      sender_label := coalesce(sender_label, 'Parent');
    elsif r.r_sender_role is null then
      sender_label := 'Unknown sender';
    else
      sender_label := r.r_sender_role;
    end if;

    message_id := r.r_message_id;
    class_name := r.r_class_name;
    sender_role := r.r_sender_role;
    created_at := r.r_created_at;
    body := r.r_body;
    removed_by_role := r.r_removed_by_role;
    removed_at := r.r_removed_at;
    remover_label := case r.r_removed_by_role
                       when 'teacher' then 'the ' || r.r_class_name || ' teacher'
                       when 'coordinator' then 'a coordinator'
                       when 'bv_coordinator' then 'an admin'
                       when 'admin' then 'an admin'
                       else r.r_removed_by_role
                     end;

    insert into public.audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (v_uid, v_role, 'read', 'messages', r.r_message_id, v_student_id);

    return next;
  end loop;
  return;
end;
$$;

revoke all on function public.get_removed_messages_for_oversight(timestamptz, uuid, int) from public, anon;
grant execute on function public.get_removed_messages_for_oversight(timestamptz, uuid, int) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. message_in_session: is this message in a class chat whose class belongs to p_session_id?
--
-- The policy below cannot query messages/conversations inline: a policy subquery runs under the
-- caller's RLS, and messages_member_select / conversations_member_select show a Coordinator only
-- conversations they participate in. Coordinators are participants of session_staff chats, not
-- class chats, so an inline exists() is always false for them (proved red by 202_ test 36).
-- Same shape as public.class_in_session (20261002120000): a definer reference-data check that
-- returns a boolean, reads no message content, and leaks nothing beyond "is id X in session Y".
-- ---------------------------------------------------------------------------------------------
create or replace function public.message_in_session(p_message_id uuid, p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.messages m
      join public.conversations cv on cv.id = m.conversation_id and cv.kind = 'class'
      join public.classes c on c.id = cv.scope_id
     where m.id = p_message_id
       and c.session_id = p_session_id
  );
$$;

revoke all on function public.message_in_session(uuid, uuid) from public, anon;
grant execute on function public.message_in_session(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. audit_log_coordinator_read gains a messages clause, so a Coordinator sees removal and review
-- entries for messages in their session's class chats (parent and teacher messages carry no
-- target_student_id, so no older clause covers them). The three existing clauses are copied
-- verbatim from 20260729092000. Bare auth.jwt(), never (select auth.jwt()) (#105).
-- ---------------------------------------------------------------------------------------------
drop policy if exists audit_log_coordinator_read on audit_log;
create policy audit_log_coordinator_read on audit_log for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and (
    (
      audit_log.target_student_id is not null
      and exists (
        select 1 from enrollments e
        where e.student_id = audit_log.target_student_id
          and e.session_id = (auth.jwt()->>'scope_id')::uuid
      )
    )
    or (
      audit_log.target_table = 'classes'
      and exists (
        select 1 from classes c
        where c.id = audit_log.target_id
          and c.session_id = (auth.jwt()->>'scope_id')::uuid
      )
    )
    or (
      audit_log.target_table in ('attendance','sessions')
      and audit_log.target_student_id is null
      and audit_log.target_id = (auth.jwt()->>'scope_id')::uuid
    )
    or (
      audit_log.target_table = 'messages'
      and public.message_in_session(audit_log.target_id, (auth.jwt()->>'scope_id')::uuid)
    )
  )
);

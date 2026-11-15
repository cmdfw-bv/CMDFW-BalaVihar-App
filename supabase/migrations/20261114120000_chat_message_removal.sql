-- Teacher -> chat-message-removal (issue #113, ADR-2026-11-14-chat-message-removal-move-aside,
-- Ratified 2026-11-14). Removal hides the text for everyone and moves it aside for evidence.
--
-- messages_member_select and messages_member_insert are deliberately UNCHANGED (the #105 cloud
-- timeout lesson). Clients still get no update or delete on messages, and no grant at all on
-- message_removals. The only way to remove a message is public.remove_message().

-- ---------------------------------------------------------------------------------------------
-- 1. Columns. body is null exactly when the message is removed (null, not '', because '' is a
-- value a client could send). The six-role list matches conversation_participants.participant_role.
-- ---------------------------------------------------------------------------------------------
alter table public.messages alter column body drop not null;

alter table public.messages
  add column sender_role text
    constraint messages_sender_role_check
    check (sender_role in ('student','parent','teacher','coordinator','bv_coordinator','admin')),
  add column removed_at timestamptz,
  add column removed_by_role text
    constraint messages_removed_by_role_check
    check (removed_by_role in ('student','parent','teacher','coordinator','bv_coordinator','admin'));

alter table public.messages
  add constraint messages_removed_body_ck check ((removed_at is null) = (body is not null));

-- None of the three new columns is in the client insert column grant (20261008120000), so a
-- client cannot supply them. Select stays table-wide, so clients read them through the
-- unchanged messages_member_select.

-- ---------------------------------------------------------------------------------------------
-- 2. sender_role is stamped at send time from the sender's participant role (ADR Decision 2).
-- Always overwrite: never trust an incoming value, even from a privileged writer.
-- ---------------------------------------------------------------------------------------------
create or replace function public.messages_stamp_sender_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_role := (
    select cp.participant_role
      from public.conversation_participants cp
     where cp.conversation_id = new.conversation_id
       and cp.user_id = new.sender_user_id
  );
  return new;
end;
$$;

revoke all on function public.messages_stamp_sender_role() from public, anon, authenticated;

create trigger messages_stamp_sender_role
  before insert on public.messages
  for each row execute function public.messages_stamp_sender_role();

-- ---------------------------------------------------------------------------------------------
-- 3. Backfill. Current participants first; then any class-scoped user_roles grant the sender holds
-- for the conversation's class. Not filtered on is_active: per #119 (20261113120000) is_active marks
-- the role the user has *selected*, not whether the grant exists, so a sender whose selected role
-- is elsewhere still resolves. (remove_message and the review function keep their is_active checks
-- on purpose: those ask what the caller is acting as now.) Anything else stays null, and a null
-- sender_role is removable only by bv_coordinator/admin (fail-closed, /design call). Only pre-pilot
-- staging rows exist.
-- ---------------------------------------------------------------------------------------------
update public.messages m
   set sender_role = cp.participant_role
  from public.conversation_participants cp
 where m.sender_role is null
   and cp.conversation_id = m.conversation_id
   and cp.user_id = m.sender_user_id;

-- Resolve only when exactly one role matches, so an ambiguous sender stays null.
update public.messages m
   set sender_role = r.role
  from (
    select m2.id as message_id, min(ur.role::text) as role
      from public.messages m2
      join public.conversations c
        on c.id = m2.conversation_id and c.kind = 'class' and c.scope_type = 'class'
      join public.user_roles ur
        on ur.user_id = m2.sender_user_id
       and ur.role::text in ('teacher','student','parent')
       and ur.scope_type = 'class'
       and ur.scope_id = c.scope_id
     where m2.sender_role is null
     group by m2.id
    having count(distinct ur.role) = 1
  ) r
 where m.id = r.message_id
   and m.sender_role is null;

-- ---------------------------------------------------------------------------------------------
-- 4. The moved-aside text. RLS on, no policies, no client grants: only definer code reads it.
-- on delete cascade, so the pilot-close chat purge takes it too.
-- ---------------------------------------------------------------------------------------------
create table public.message_removals (
  message_id uuid primary key references public.messages(id) on delete cascade,
  conversation_id uuid not null,
  body text not null,
  mention_targets text[] not null,
  removed_by_user_id uuid not null,
  removed_by_role text not null,
  removed_at timestamptz not null
);

alter table public.message_removals enable row level security;
revoke all on public.message_removals from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. audit_log gains the 'remove' action (ADR Decision 5). Removal entries never hold text.
-- ---------------------------------------------------------------------------------------------
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log
  add constraint audit_log_action_check check (action in ('read','denied','remove'));

-- ---------------------------------------------------------------------------------------------
-- 6. Catch-up (fetchRemovedSince) and the oversight review list.
-- ---------------------------------------------------------------------------------------------
create index messages_removed_idx
  on public.messages (conversation_id, removed_at)
  where removed_at is not null;

-- ---------------------------------------------------------------------------------------------
-- 7. remove_message (ADR Decisions 1, 3, 4, 5, 7).
--
-- Authorization reads the ACTIVE role and its scope, not participation, and fails closed on
-- every path: each test is coalesce(..., false), and anything not explicitly allowed raises 42501.
-- The JWT claim must also be backed by the caller's live, currently active user_roles grant, so a
-- revoked assignment or a pending role switch refuses even on a stale token.
--
-- Order: lock -> authorize -> idempotency. Authorization runs BEFORE the already-removed check
-- so a caller who may not remove a message cannot learn whether it was removed. An unknown id
-- raises the same 42501 as a refusal, so ids cannot be probed.
--
-- A refusal raises, which rolls back the call; no 'denied' audit row survives a raise, so none
-- is written.
-- ---------------------------------------------------------------------------------------------
create or replace function public.remove_message(p_message_id uuid)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := nullif(auth.jwt()->>'active_role', '');
  v_scope_type text := nullif(auth.jwt()->>'scope_type', '');
  v_scope_id uuid;
  v_msg public.messages%rowtype;
  v_kind text;
  v_class_id uuid;
  v_session_id uuid;
  v_authorized boolean := false;
  v_removed_at timestamptz := now();
  v_body text;
  v_mentions text[];
  v_student_id uuid;
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

  select m.* into v_msg
    from public.messages m
   where m.id = p_message_id
     for update;

  if not found then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select c.kind, c.scope_id into v_kind, v_class_id
    from public.conversations c
   where c.id = v_msg.conversation_id;

  if coalesce(v_kind <> 'class', true) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select cl.session_id into v_session_id
    from public.classes cl
   where cl.id = v_class_id;

  -- Nobody removes their own message.
  if coalesce(v_msg.sender_user_id = v_uid, true) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_role = 'teacher' then
    v_authorized := coalesce(
      v_scope_type = 'class'
      and v_scope_id = v_class_id
      and v_msg.sender_role in ('student','parent')
      and exists (
        select 1 from public.user_roles ur
         where ur.user_id = v_uid and ur.is_active
           and ur.role = 'teacher' and ur.scope_type = 'class' and ur.scope_id = v_class_id
      ),
      false);
  elsif v_role = 'coordinator' then
    v_authorized := coalesce(
      v_scope_type = 'session'
      and v_scope_id = v_session_id
      and v_msg.sender_role in ('student','parent','teacher')
      and exists (
        select 1 from public.user_roles ur
         where ur.user_id = v_uid and ur.is_active
           and ur.role = 'coordinator' and ur.scope_type = 'session' and ur.scope_id = v_session_id
      ),
      false);
  elsif v_role in ('bv_coordinator','admin') then
    -- Org-scoped: the hook issues no scope_id for an org grant (mirrors get_class_roster_for_staff).
    -- A null sender_role (unresolved backfill) is removable only here.
    v_authorized := coalesce(
      (v_msg.sender_role is null
        or v_msg.sender_role in ('student','parent','teacher','coordinator'))
      and exists (
        select 1 from public.user_roles ur
         where ur.user_id = v_uid and ur.is_active
           and ur.role::text = v_role and ur.scope_type = 'org'
      ),
      false);
  end if;

  if not v_authorized then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Idempotent: an already-removed message comes back unchanged, with no writes.
  if v_msg.removed_at is not null then
    return v_msg;
  end if;

  v_body := v_msg.body;
  v_mentions := v_msg.mention_targets;

  update public.messages m
     set body = null,
         mention_targets = array[]::text[],
         removed_at = v_removed_at,
         removed_by_role = v_role
   where m.id = p_message_id
     and m.removed_at is null
  returning m.* into v_msg;

  if not found then
    select m.* into v_msg from public.messages m where m.id = p_message_id;
    return v_msg;
  end if;

  insert into public.message_removals
    (message_id, conversation_id, body, mention_targets, removed_by_user_id, removed_by_role, removed_at)
  values
    (v_msg.id, v_msg.conversation_id, v_body, v_mentions, v_uid, v_role, v_removed_at);

  if v_msg.sender_role = 'student' then
    -- students.user_id links a student login to its record; prefer the record enrolled in this class.
    select s.id into v_student_id
      from public.students s
     where s.user_id = v_msg.sender_user_id
     order by exists (
                select 1 from public.enrollments e
                 where e.student_id = s.id and e.class_id = v_class_id
              ) desc,
              s.created_at
     limit 1;
  end if;

  insert into public.audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
  values (v_uid, v_role, 'remove', 'messages', v_msg.id, v_student_id);

  perform realtime.send(
    jsonb_build_object('id', v_msg.id),
    'message_removed',
    'chat:' || v_msg.conversation_id::text,
    true
  );

  return v_msg;
end;
$$;

revoke all on function public.remove_message(uuid) from public, anon;
grant execute on function public.remove_message(uuid) to authenticated;

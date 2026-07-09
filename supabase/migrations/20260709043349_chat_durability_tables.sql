create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('class','session_staff','leadership')),
  scope_type text not null check (scope_type in ('class','session','org')),
  scope_id uuid,
  created_at timestamptz not null default now(),
  constraint conversations_org_scope_null_id check (
    (scope_type = 'org' and scope_id is null) or (scope_type <> 'org' and scope_id is not null)
  ),
  unique (kind, scope_type, scope_id)
);
create unique index if not exists conversations_org_singleton on conversations (kind) where scope_type = 'org';

create table if not exists conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_role text not null check (participant_role in ('student','parent','teacher','coordinator','bv_coordinator','admin')),
  notify_level text not null default 'all' check (notify_level in ('all','mentions','muted')),
  notification_default text not null default 'all' check (notification_default in ('all','mentions','muted')),
  created_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete set null,
  body text not null,
  mention_targets text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

alter table conversations enable row level security;
alter table conversation_participants enable row level security;
alter table messages enable row level security;

grant select on conversations to authenticated;
grant select on conversation_participants to authenticated;
grant select, insert on messages to authenticated;

-- Deviation from the plan brief: conversation_participants_member_select originally
-- checked membership via a subquery against conversation_participants itself:
--   exists (select 1 from conversation_participants cp2 where cp2.conversation_id = conversation_participants.conversation_id and cp2.user_id = auth.uid())
-- That self-reference makes Postgres re-apply conversation_participants' own RLS policy
-- while evaluating the policy, which re-triggers the same subquery forever --
-- "infinite recursion detected in policy for relation conversation_participants" (confirmed
-- via `npx supabase test db` on 060_chat_rls.sql). This is the same class of bug already
-- documented and fixed for family_members in 20260709032818_core_operational_rls_policies.sql
-- (public.is_family_member). Fix (same documented pattern): move the self-referencing check
-- into a SECURITY DEFINER function owned by the migration role, which queries
-- conversation_participants directly and bypasses RLS entirely while executing, so the
-- recursive self-application never happens.
create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_conversation_participant(uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid) to authenticated;

create policy conversations_member_select on conversations for select
using (exists (
  select 1 from conversation_participants cp
  where cp.conversation_id = conversations.id and cp.user_id = auth.uid()
));

create policy conversation_participants_member_select on conversation_participants for select
using (public.is_conversation_participant(conversation_participants.conversation_id));

create policy messages_member_select on messages for select
using (exists (
  select 1 from conversation_participants cp
  where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
));

create policy messages_member_insert on messages for insert
with check (
  sender_user_id = auth.uid()
  and exists (
    select 1 from conversation_participants cp
    where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()
  )
);
-- Deliberately no insert/update/delete policy on conversations or conversation_participants
-- for any client role: membership is trigger-maintained only (next migration), which is what
-- makes "no open student-to-student DM" structural rather than policy-dependent.

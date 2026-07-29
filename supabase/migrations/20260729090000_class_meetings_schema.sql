-- ADR-0035: class_meetings (expected-meeting-date calendar).
--
-- ADR-0036: this migration originally added `sessions.meeting_weekday`. That column duplicated
-- `sessions.day_of_week`, which ADR-0031 had already migrated, seeded for all 8 sessions of the
-- doc 1 §9a catalog, and pgTAP-covered (160_session_weekly_schedule.sql) — same type, same
-- 0=Sunday convention, same meaning. Two columns for one fact diverge silently: this branch's
-- seed set F3 to weekday 2 (Tuesday) against a Sunday catalog, which would have generated
-- Tuesday meetings while teachers marked attendance on Sundays, reporting every class in the
-- session as 0% compliant. `sessions.day_of_week` is the single source of truth.

create table if not exists class_meetings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  meeting_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled')),
  created_at timestamptz not null default now(),
  unique (class_id, meeting_date)
);
alter table class_meetings enable row level security;

-- Read posture mirrors classes'/sessions' existing organizational-metadata policies (no PII) —
-- Teacher/Coordinator/BV Coordinator/Admin only; Parent/Student have no documented need to see
-- the meeting calendar this pass (resolved at /plan, not specified in the design's RLS matrix).
grant select on class_meetings to authenticated;
revoke insert, update, delete on class_meetings from authenticated, anon;

create policy class_meetings_teacher_select on class_meetings for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and class_meetings.class_id = (auth.jwt()->>'scope_id')::uuid
);
create policy class_meetings_coordinator_select on class_meetings for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and exists (
    select 1 from classes c where c.id = class_meetings.class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
  )
);
create policy class_meetings_org_select on class_meetings for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- No client write grant — only generate_class_meetings_for_session (below) and the future
-- CSV skip-dates import (service-role) ever write to this table.

create table if not exists class_updates (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  meeting_date date not null,
  posted_by uuid not null references auth.users(id),
  posted_at timestamptz not null default now(),
  unique (class_id, meeting_date)
);
alter table class_updates enable row level security;

-- ADR-0030: zero policies for any role this pass (same posture user_roles' write side had
-- before user-role-approval existed) — Coordinator's read goes through get_session_compliance_for_staff
-- (Task 13, SECURITY DEFINER, bypasses RLS by design), never a direct grant. Teacher's write
-- RPC, once refined, is the only thing that will ever need a policy or grant here.
grant select on class_updates to authenticated;
revoke insert, update, delete on class_updates from authenticated, anon;

create or replace function generate_class_meetings_for_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
  v_session sessions%rowtype;
  v_d date;
begin
  select * into v_session from sessions where id = p_session_id;

  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := (v_scope_id = p_session_id);
  end if;

  if not v_authorized or v_session.id is null then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'sessions', p_session_id, null);
    return;
  end if;

  for v_d in
    select generate_series(v_session.start_date, v_session.end_date, interval '1 day')::date
  loop
    if extract(dow from v_d) = v_session.day_of_week then
      insert into class_meetings (class_id, meeting_date)
      select c.id, v_d from classes c where c.session_id = p_session_id
      on conflict (class_id, meeting_date) do nothing;
    end if;
  end loop;
end;
$$;

revoke all on function generate_class_meetings_for_session(uuid) from public;
grant execute on function generate_class_meetings_for_session(uuid) to authenticated;

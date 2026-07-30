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

-- ADR-0036: this migration originally created its own `class_updates` here — a minimal
-- (class_id, meeting_date, posted_by, posted_at) shape with zero RLS policies, per ADR-0034's
-- "minimum shape needed to unblock Coordinator's read".
--
-- Issue #21 landed first (PR #48) with a table of the same name driven by real product
-- requirements: body, homework, a `comments` child table (ADR-0032's privacy model), retention
-- fields and length caps, plus 7 RLS policies. ADR-0034 anticipated exactly this — "unless its
-- write requirements turn out to need a schema shape this ADR didn't anticipate" — and ADR-0036
-- resolves it: **that table is canonical and lives in 20260724120400; this file no longer
-- defines it.**
--
-- Leaving both definitions in place would not have failed loudly. Both used
-- `create table if not exists`, so the earlier timestamp simply wins and the later one is a
-- silent no-op — `db-and-rls` stays green while `get_session_compliance_for_staff` (plpgsql, so
-- its body is not checked against the catalog at creation time) raises
-- `column cu.meeting_date does not exist` at runtime, the first time a Coordinator opens the
-- dashboard. The `meeting_date` this RPC needs is added to the canonical table by
-- 20260729091000 instead.

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

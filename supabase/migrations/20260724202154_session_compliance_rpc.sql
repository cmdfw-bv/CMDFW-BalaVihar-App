-- ADR-0030 + ADR-0031: get_session_compliance_for_staff — the only data-access path for
-- features/coordinator/compliance-dashboard/ (compliance-dashboard.plan.md). Replaces N
-- per-class get_class_attendance_for_staff calls with one session-wide aggregate.
create or replace function get_session_compliance_for_staff(
  p_session_id uuid,
  p_window_size int default 4
)
returns table (
  class_id uuid,
  class_name text,
  enrolled_count int,
  window_start date,
  window_end date,
  attendance_rate numeric,
  update_rate numeric
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_role text := auth.jwt()->>'active_role';
  v_scope_id uuid := nullif(auth.jwt()->>'scope_id','')::uuid;
  v_authorized boolean := false;
begin
  if v_role in ('bv_coordinator','admin') then
    v_authorized := true;
  elsif v_role = 'coordinator' then
    v_authorized := (v_scope_id = p_session_id);
  end if;

  if not v_authorized then
    insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
    values (auth.uid(), v_role, 'denied', 'sessions', p_session_id, null);
    return;
  end if;

  insert into audit_log (actor_user_id, actor_role, action, target_table, target_id, target_student_id)
  values (auth.uid(), v_role, 'read', 'attendance', p_session_id, null);

  return query
  with win as (
    select cm.class_id, cm.meeting_date
    from (
      select cm.*, row_number() over (partition by cm.class_id order by cm.meeting_date desc) as rn
      from class_meetings cm
      join classes c on c.id = cm.class_id
      where c.session_id = p_session_id and cm.status = 'scheduled' and cm.meeting_date <= current_date
    ) cm
    where rn <= p_window_size
  ),
  per_date as (
    select
      w.class_id,
      w.meeting_date,
      (select count(*) from enrollments e
         where e.class_id = w.class_id and e.status = 'active' and e.enrolled_at <= w.meeting_date) as expected_count,
      exists (select 1 from class_updates cu
                where cu.class_id = w.class_id and cu.meeting_date = w.meeting_date) as update_posted
    from win w
  ),
  per_date_full as (
    select
      pd.*,
      (pd.expected_count > 0 and pd.expected_count = (
         select count(*) from attendance a
         join enrollments e on e.id = a.enrollment_id
         where e.class_id = pd.class_id and a.class_meeting_date = pd.meeting_date
           and e.status = 'active' and e.enrolled_at <= pd.meeting_date
       )) as attendance_submitted
    from per_date pd
  )
  select
    c.id as class_id,
    c.name as class_name,
    (select count(*) from enrollments e where e.class_id = c.id and e.status = 'active')::int as enrolled_count,
    (select min(meeting_date) from win where class_id = c.id) as window_start,
    (select max(meeting_date) from win where class_id = c.id) as window_end,
    case when count(pdf.meeting_date) filter (where pdf.expected_count > 0) = 0 then null
         else round(100.0 * count(*) filter (where pdf.attendance_submitted)
                     / count(*) filter (where pdf.expected_count > 0), 1)
    end as attendance_rate,
    case when count(pdf.meeting_date) = 0 then null
         else round(100.0 * count(*) filter (where pdf.update_posted) / count(*), 1)
    end as update_rate
  from classes c
  left join per_date_full pdf on pdf.class_id = c.id
  where c.session_id = p_session_id
  group by c.id, c.name;
end;
$$;

revoke all on function get_session_compliance_for_staff(uuid, int) from public;
grant execute on function get_session_compliance_for_staff(uuid, int) to authenticated;

-- Extends audit_log's Coordinator read policy (Task 5, resolved deferred mechanic #3) to cover
-- this RPC's audit shape: target_table in ('attendance','sessions'), target_id = the session
-- itself, target_student_id null (no per-student granularity for a session-wide RPC, AC8).
-- Without this clause the SECURITY DEFINER insert still succeeds (it bypasses RLS), but a
-- Coordinator querying audit_log directly could never see their own compliance-dashboard rows.
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
  )
);

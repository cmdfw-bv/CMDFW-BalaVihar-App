-- Helper: is auth.uid() a member of the given family?
--
-- Deviation from the plan brief: family_members_own_select (below) originally
-- checked membership via a subquery against family_members itself:
--   exists (select 1 from family_members fm2 where fm2.family_id = family_members.family_id and fm2.user_id = auth.uid())
-- That self-reference makes Postgres re-apply family_members' own RLS policy
-- while evaluating the policy, which re-triggers the same subquery forever --
-- "infinite recursion detected in policy for relation family_members". This
-- surfaced on every table whose policy joins through family_members (centers,
-- sessions, classes, families, enrollments, attendance), not just direct
-- family_members reads, since any join through the table applies its RLS.
-- Fix (Supabase's documented pattern for this exact case): move the
-- self-referencing check into a SECURITY DEFINER function. Owned by the
-- migration role (table owner), it queries family_members directly and
-- bypasses RLS entirely while executing, so the recursive self-application
-- never happens. Only family_members_own_select needed to change; everything
-- that joins family_members from other tables' policies now resolves through
-- this non-recursive policy correctly.
create or replace function public.is_family_member(p_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from family_members fm
    where fm.family_id = p_family_id and fm.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_family_member(uuid) from public, anon;
grant execute on function public.is_family_member(uuid) to authenticated;

-- centers
create policy centers_parent_select on centers for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where se.center_id = centers.id and fm.user_id = auth.uid()
  )
);
create policy centers_student_select on centers for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where se.center_id = centers.id and s.user_id = auth.uid()
  )
);
create policy centers_teacher_select on centers for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (
    select 1 from sessions se join classes c on c.session_id = se.id
    where se.center_id = centers.id and c.id = (auth.jwt()->>'scope_id')::uuid
  )
);
create policy centers_coordinator_select on centers for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and exists (
    select 1 from sessions se where se.center_id = centers.id and se.id = (auth.jwt()->>'scope_id')::uuid
  )
);
create policy centers_org_select on centers for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- sessions
create policy sessions_parent_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where c.session_id = sessions.id and fm.user_id = auth.uid()
  )
);
create policy sessions_student_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where c.session_id = sessions.id and s.user_id = auth.uid()
  )
);
create policy sessions_teacher_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from classes c where c.session_id = sessions.id and c.id = (auth.jwt()->>'scope_id')::uuid)
);
create policy sessions_coordinator_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and sessions.id = (auth.jwt()->>'scope_id')::uuid
);
create policy sessions_org_select on sessions for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- classes
create policy classes_parent_select on classes for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = classes.id and fm.user_id = auth.uid()
  )
);
create policy classes_student_select on classes for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    where e.class_id = classes.id and s.user_id = auth.uid()
  )
);
create policy classes_teacher_select on classes for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and classes.id = (auth.jwt()->>'scope_id')::uuid
);
create policy classes_coordinator_select on classes for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and classes.session_id = (auth.jwt()->>'scope_id')::uuid
);
create policy classes_org_select on classes for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- families / family_members (resolved deferred mechanic #1)
create policy families_own_select on families for select
using (
  auth.jwt()->>'active_role' in ('parent','student')
  and exists (select 1 from family_members fm where fm.family_id = families.id and fm.user_id = auth.uid())
);
create policy families_org_select on families for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

create policy family_members_own_select on family_members for select
using (
  auth.jwt()->>'active_role' in ('parent','student')
  and public.is_family_member(family_members.family_id)
);
create policy family_members_org_select on family_members for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- students (Parent/Student direct only — Teacher/Coordinator/BV/Admin get zero rows here by design, ADR-0019)
create policy students_parent_select on students for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (select 1 from family_members fm where fm.family_id = students.family_id and fm.user_id = auth.uid())
);
create policy students_student_select on students for select
using (
  auth.jwt()->>'active_role' = 'student'
  and students.user_id = auth.uid()
);

-- enrollments
create policy enrollments_parent_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from students s join family_members fm on fm.family_id = s.family_id
    where s.id = enrollments.student_id and fm.user_id = auth.uid()
  )
);
create policy enrollments_student_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (select 1 from students s where s.id = enrollments.student_id and s.user_id = auth.uid())
);
create policy enrollments_teacher_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and enrollments.class_id = (auth.jwt()->>'scope_id')::uuid
);
create policy enrollments_coordinator_select on enrollments for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and enrollments.session_id = (auth.jwt()->>'scope_id')::uuid
);
create policy enrollments_org_select on enrollments for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- attendance: Parent/Student read direct; Teacher writes (own class); no staff SELECT (RPC only, Task 5)
create policy attendance_parent_select on attendance for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from enrollments e join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.id = attendance.enrollment_id and fm.user_id = auth.uid()
  )
);
create policy attendance_student_select on attendance for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from enrollments e join students s on s.id = e.student_id
    where e.id = attendance.enrollment_id and s.user_id = auth.uid()
  )
);
create policy attendance_teacher_insert on attendance for insert
with check (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from enrollments e where e.id = attendance.enrollment_id and e.class_id = (auth.jwt()->>'scope_id')::uuid)
);
create policy attendance_teacher_update on attendance for update
using (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from enrollments e where e.id = attendance.enrollment_id and e.class_id = (auth.jwt()->>'scope_id')::uuid)
)
with check (
  auth.jwt()->>'active_role' = 'teacher'
  and exists (select 1 from enrollments e where e.id = attendance.enrollment_id and e.class_id = (auth.jwt()->>'scope_id')::uuid)
);

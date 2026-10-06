-- #105: the Teacher feed times out on cloud (Postgres 57014) reading class_updates.
--
-- Root cause: class_updates' student/parent/coordinator SELECT policies did inline
-- `exists (select … from enrollments/students/family_members/classes …)`. Each of those tables
-- has its OWN RLS, so evaluating the class_updates policy triggered a nested RLS cascade, and the
-- bare `auth.jwt()/auth.uid()` calls were re-parsed per row. On the free-tier DB a trivial read
-- (tens of rows) ran ~50s and was cancelled. (EXPLAIN of the read: 43 sub-plans, 276
-- current_setting re-parses.)
--
-- Fix — behavior-preserving, proven unchanged by the existing adversarial pgTAP (171):
--   1. SECURITY DEFINER membership helpers that bypass the nested RLS. They check the CALLER's
--      OWN membership (via auth.uid()), so granting execute to `authenticated` leaks nothing — a
--      caller can only ever learn about their own enrollment.
--   2. Rewrite the class_updates SELECT policies to call the helpers, and wrap auth.jwt()/auth.uid()
--      in `(select …)` so they evaluate once (InitPlan) instead of per row.
-- No access-model change: each helper encodes the exact predicate its policy used before.

-- --- membership helpers (bypass the nested RLS cascade; caller-scoped, so no info leak) ---------

-- Is the CALLER a student enrolled in p_class_id? (was: class_updates_student_select's exists)
create or replace function public.is_student_of_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    where e.class_id = p_class_id and s.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_student_of_class(uuid) from public, anon;
grant execute on function public.is_student_of_class(uuid) to authenticated;

-- Is the CALLER a guardian of an enrolled student in p_class_id? (was: class_updates_parent_select)
create or replace function public.is_guardian_of_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = p_class_id and fm.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_guardian_of_class(uuid) from public, anon;
grant execute on function public.is_guardian_of_class(uuid) to authenticated;

-- Does p_class_id belong to p_session_id? (was: class_updates_coordinator_select's exists on
-- classes.) Reference-data check only — no user data, no leak.
create or replace function public.class_in_session(p_class_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from classes c where c.id = p_class_id and c.session_id = p_session_id
  );
$$;
revoke execute on function public.class_in_session(uuid, uuid) from public, anon;
grant execute on function public.class_in_session(uuid, uuid) to authenticated;

-- --- rewrite the class_updates SELECT policies (same predicates, no cascade, token read once) ----

drop policy if exists class_updates_teacher_select on class_updates;
create policy class_updates_teacher_select on class_updates for select
using (
  (select auth.jwt())->>'active_role' = 'teacher'
  and class_updates.class_id = ((select auth.jwt())->>'scope_id')::uuid
);

drop policy if exists class_updates_student_select on class_updates;
create policy class_updates_student_select on class_updates for select
using (
  (select auth.jwt())->>'active_role' = 'student'
  and public.is_student_of_class(class_updates.class_id)
);

drop policy if exists class_updates_parent_select on class_updates;
create policy class_updates_parent_select on class_updates for select
using (
  (select auth.jwt())->>'active_role' = 'parent'
  and public.is_guardian_of_class(class_updates.class_id)
);

drop policy if exists class_updates_coordinator_select on class_updates;
create policy class_updates_coordinator_select on class_updates for select
using (
  (select auth.jwt())->>'active_role' = 'coordinator'
  and public.class_in_session(class_updates.class_id, ((select auth.jwt())->>'scope_id')::uuid)
);

drop policy if exists class_updates_org_select on class_updates;
create policy class_updates_org_select on class_updates for select
using ((select auth.jwt())->>'active_role' in ('bv_coordinator','admin'));

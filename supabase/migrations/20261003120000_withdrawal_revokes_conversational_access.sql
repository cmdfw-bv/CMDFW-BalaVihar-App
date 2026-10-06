-- ADR-2026-09-19 (issue #96): a mid-year withdrawal revokes conversational access outright.
-- Supersedes ADR-0037's time-bounded read. No schema change -- nine existing objects are
-- redefined so each keys on enrollments.status = 'active'.
--
-- ROLLOVER IS NOT DECIDED HERE. Year-end rollover is also an active -> not-active transition,
-- so read literally these predicates would drop every family's prior-year threads at rollover.
-- ADR-2026-09-19 Decision 8 scopes this to mid-year withdrawal only and hands rollover to #82,
-- unarchitected. Do not read the behavior below as a rollover decision.
--
-- auth.jwt() stays in its bare form: wrapping it as (select auth.jwt()) is a codebase-wide
-- convention change that belongs to #105 and /architect, not to nine policies here.
--
-- comments_teacher_insert is deliberately NOT restated. Its private branch calls
-- is_parent_of_class, so the new predicate reaches it through the helper.

-- 1a: four enrollment-derived read policies gain the status filter.

drop policy if exists class_updates_student_select on class_updates;
create policy class_updates_student_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'student'
  and exists (
    select 1 from enrollments e join students s on s.id = e.student_id
    where e.class_id = class_updates.class_id and s.user_id = auth.uid()
      and e.status = 'active'
  )
);

drop policy if exists class_updates_parent_select on class_updates;
create policy class_updates_parent_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = class_updates.class_id and fm.user_id = auth.uid()
      and e.status = 'active'
  )
);

drop policy if exists comments_student_public_select on comments;
create policy comments_student_public_select on comments for select
using (
  auth.jwt()->>'active_role' = 'student'
  and comments.is_private = false
  and exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    where cu.id = comments.class_update_id and s.user_id = auth.uid()
      and e.status = 'active'
  )
);

drop policy if exists comments_parent_public_select on comments;
create policy comments_parent_public_select on comments for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and comments.is_private = false
  and exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where cu.id = comments.class_update_id and fm.user_id = auth.uid()
      and e.status = 'active'
  )
);

-- 1b: the private-thread policy is identity-derived (target_parent_id = auth.uid()) and had no
-- enrollments join to filter, so it is rewritten to gain one. Without this a withdrawn family
-- would keep a private thread hanging off a class update they can no longer see.
drop policy if exists comments_target_parent_select on comments;
create policy comments_target_parent_select on comments for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and comments.is_private = true
  and comments.target_parent_id = auth.uid()
  and exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where cu.id = comments.class_update_id
      and fm.user_id = auth.uid()
      and e.status = 'active'
  )
);

-- 2: the two family-side insert policies and the Teacher's private-reply helper.

drop policy if exists comments_student_insert on comments;
create policy comments_student_insert on comments for insert
with check (
  auth.jwt()->>'active_role' = 'student'
  and comments.author_user_id = auth.uid()
  and comments.author_role = 'student'
  and comments.is_private = false
  and comments.target_parent_id is null
  and exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    where cu.id = comments.class_update_id and s.user_id = auth.uid()
      and e.status = 'active'
  )
);

drop policy if exists comments_parent_insert on comments;
create policy comments_parent_insert on comments for insert
with check (
  auth.jwt()->>'active_role' = 'parent'
  and comments.author_user_id = auth.uid()
  and comments.author_role = 'parent'
  and (
    (comments.is_private = false and comments.target_parent_id is null)
    or (comments.is_private = true and comments.target_parent_id = auth.uid())
  )
  and exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where cu.id = comments.class_update_id and fm.user_id = auth.uid()
      and e.status = 'active'
  )
);

-- The status filter is added ALONGSIDE the auth.jwt() role/scope gate from issue #52, not in
-- place of it. Called by comments_teacher_insert on every private insert, so this blocks a
-- reply into an existing thread as well as a new one.
create or replace function public.is_parent_of_class(p_user_id uuid, p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = p_class_id and fm.user_id = p_user_id
      and e.status = 'active'
  )
  and (
    (auth.jwt()->>'active_role' = 'teacher' and (auth.jwt()->>'scope_id')::uuid = p_class_id)
    or (auth.jwt()->>'active_role' = 'coordinator' and exists (
      select 1 from classes c where c.id = p_class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
    ))
    or auth.jwt()->>'active_role' in ('bv_coordinator', 'admin')
  );
$$;
revoke execute on function public.is_parent_of_class(uuid, uuid) from public, anon;
grant execute on function public.is_parent_of_class(uuid, uuid) to authenticated;

-- 4: the one relaxation. `and e.status = 'active'` is REMOVED, so a withdrawn family's thread
-- keeps its real label on the Teacher's card. Returns families.label only, never a
-- student-derived value, and the caller gate is unchanged -- "currently enrolled parent of my
-- class" widens to "ever enrolled parent of my class", which enrollments_*_select already shows.
create or replace function public.resolve_parent_family_label(p_parent_user_id uuid, p_class_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select f.label
  from family_members fm
  join families f on f.id = fm.family_id
  join students s on s.family_id = fm.family_id
  join enrollments e on e.student_id = s.id
  where fm.user_id = p_parent_user_id
    and e.class_id = p_class_id
    and (
      (auth.jwt()->>'active_role' = 'teacher' and (auth.jwt()->>'scope_id')::uuid = p_class_id)
      or (auth.jwt()->>'active_role' = 'coordinator' and exists (
        select 1 from classes c where c.id = p_class_id and c.session_id = (auth.jwt()->>'scope_id')::uuid
      ))
      or auth.jwt()->>'active_role' in ('bv_coordinator', 'admin')
    )
  limit 1;
$$;
revoke all on function public.resolve_parent_family_label(uuid, uuid) from public, anon;
grant execute on function public.resolve_parent_family_label(uuid, uuid) to authenticated;

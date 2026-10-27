-- #105 (part 2): the feed query embeds classes(name, sessions(name, centers(name))), so the
-- centers/sessions/classes SELECT policies are evaluated alongside class_updates — and they carried
-- the same nested-RLS cascade (exists over enrollments→students→family_members / sessions→classes)
-- plus bare auth.jwt()/auth.uid(). Part 1 (20261002120000) fixed class_updates; the feed still
-- timed out because the embed drags these three tables in. This applies the identical,
-- behavior-preserving fix to their 15 SELECT policies, guarded by 010_operational_core_rls.
--
-- Same approach: SECURITY DEFINER membership helpers that bypass the nested RLS and check the
-- CALLER's own membership (caller-scoped → no info leak), + auth.jwt()/auth.uid() wrapped in
-- (select …). Predicates are identical to the originals in 20260709032818.

-- --- membership helpers (caller-scoped via auth.uid(); bypass the cascade) ----------------------

-- Caller is a guardian of an enrolled student in any class of p_session_id.
create or replace function public.is_guardian_in_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where c.session_id = p_session_id and fm.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_guardian_in_session(uuid) from public, anon;
grant execute on function public.is_guardian_in_session(uuid) to authenticated;

-- Caller is a student enrolled in any class of p_session_id.
create or replace function public.is_student_in_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where c.session_id = p_session_id and s.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_student_in_session(uuid) from public, anon;
grant execute on function public.is_student_in_session(uuid) to authenticated;

-- Caller is a guardian of an enrolled student in any class of any session in p_center_id.
create or replace function public.is_guardian_in_center(p_center_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where se.center_id = p_center_id and fm.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_guardian_in_center(uuid) from public, anon;
grant execute on function public.is_guardian_in_center(uuid) to authenticated;

-- Caller is a student enrolled in any class of any session in p_center_id.
create or replace function public.is_student_in_center(p_center_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where se.center_id = p_center_id and s.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_student_in_center(uuid) from public, anon;
grant execute on function public.is_student_in_center(uuid) to authenticated;

-- Reference-data containment (no user data; no leak): is p_class_id under p_center_id?
create or replace function public.class_in_center(p_class_id uuid, p_center_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from sessions se join classes c on c.session_id = se.id
    where se.center_id = p_center_id and c.id = p_class_id
  );
$$;
revoke execute on function public.class_in_center(uuid, uuid) from public, anon;
grant execute on function public.class_in_center(uuid, uuid) to authenticated;

-- Reference-data containment: is p_session_id under p_center_id?
create or replace function public.session_in_center(p_session_id uuid, p_center_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from sessions se where se.id = p_session_id and se.center_id = p_center_id
  );
$$;
revoke execute on function public.session_in_center(uuid, uuid) from public, anon;
grant execute on function public.session_in_center(uuid, uuid) to authenticated;

-- --- centers SELECT (same predicates, no cascade) -----------------------------------------------

drop policy if exists centers_parent_select on centers;
create policy centers_parent_select on centers for select
using ((select auth.jwt())->>'active_role' = 'parent' and public.is_guardian_in_center(centers.id));

drop policy if exists centers_student_select on centers;
create policy centers_student_select on centers for select
using ((select auth.jwt())->>'active_role' = 'student' and public.is_student_in_center(centers.id));

drop policy if exists centers_teacher_select on centers;
create policy centers_teacher_select on centers for select
using (
  (select auth.jwt())->>'active_role' = 'teacher'
  and public.class_in_center(((select auth.jwt())->>'scope_id')::uuid, centers.id)
);

drop policy if exists centers_coordinator_select on centers;
create policy centers_coordinator_select on centers for select
using (
  (select auth.jwt())->>'active_role' = 'coordinator'
  and public.session_in_center(((select auth.jwt())->>'scope_id')::uuid, centers.id)
);

drop policy if exists centers_org_select on centers;
create policy centers_org_select on centers for select
using ((select auth.jwt())->>'active_role' in ('bv_coordinator','admin'));

-- --- sessions SELECT ----------------------------------------------------------------------------

drop policy if exists sessions_parent_select on sessions;
create policy sessions_parent_select on sessions for select
using ((select auth.jwt())->>'active_role' = 'parent' and public.is_guardian_in_session(sessions.id));

drop policy if exists sessions_student_select on sessions;
create policy sessions_student_select on sessions for select
using ((select auth.jwt())->>'active_role' = 'student' and public.is_student_in_session(sessions.id));

drop policy if exists sessions_teacher_select on sessions;
create policy sessions_teacher_select on sessions for select
using (
  (select auth.jwt())->>'active_role' = 'teacher'
  and public.class_in_session(((select auth.jwt())->>'scope_id')::uuid, sessions.id)
);

drop policy if exists sessions_coordinator_select on sessions;
create policy sessions_coordinator_select on sessions for select
using (
  (select auth.jwt())->>'active_role' = 'coordinator'
  and sessions.id = ((select auth.jwt())->>'scope_id')::uuid
);

drop policy if exists sessions_org_select on sessions;
create policy sessions_org_select on sessions for select
using ((select auth.jwt())->>'active_role' in ('bv_coordinator','admin'));

-- --- classes SELECT -----------------------------------------------------------------------------

drop policy if exists classes_parent_select on classes;
create policy classes_parent_select on classes for select
using ((select auth.jwt())->>'active_role' = 'parent' and public.is_guardian_of_class(classes.id));

drop policy if exists classes_student_select on classes;
create policy classes_student_select on classes for select
using ((select auth.jwt())->>'active_role' = 'student' and public.is_student_of_class(classes.id));

drop policy if exists classes_teacher_select on classes;
create policy classes_teacher_select on classes for select
using (
  (select auth.jwt())->>'active_role' = 'teacher'
  and classes.id = ((select auth.jwt())->>'scope_id')::uuid
);

drop policy if exists classes_coordinator_select on classes;
create policy classes_coordinator_select on classes for select
using (
  (select auth.jwt())->>'active_role' = 'coordinator'
  and classes.session_id = ((select auth.jwt())->>'scope_id')::uuid
);

drop policy if exists classes_org_select on classes;
create policy classes_org_select on classes for select
using ((select auth.jwt())->>'active_role' in ('bv_coordinator','admin'));

-- --- comments SELECT (the feed also fetches comment counts) --------------------------------------
-- Same cascade in the parent/student public branches (exists over class_updates→enrollments→
-- students→family_members). Two caller-scoped helpers bypass it; the other branches only read
-- class_updates (now fast via part 1) so they just get the wrapped-token form. Predicates identical
-- to 20260724120426; guarded by 170/171.

create or replace function public.is_student_of_comment(p_class_update_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    where cu.id = p_class_update_id and s.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_student_of_comment(uuid) from public, anon;
grant execute on function public.is_student_of_comment(uuid) to authenticated;

create or replace function public.is_guardian_of_comment(p_class_update_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where cu.id = p_class_update_id and fm.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.is_guardian_of_comment(uuid) from public, anon;
grant execute on function public.is_guardian_of_comment(uuid) to authenticated;

-- public branch
drop policy if exists comments_teacher_public_select on comments;
create policy comments_teacher_public_select on comments for select
using (
  (select auth.jwt())->>'active_role' = 'teacher'
  and comments.is_private = false
  and exists (
    select 1 from class_updates cu
    where cu.id = comments.class_update_id and cu.class_id = ((select auth.jwt())->>'scope_id')::uuid
  )
);

drop policy if exists comments_student_public_select on comments;
create policy comments_student_public_select on comments for select
using (
  (select auth.jwt())->>'active_role' = 'student'
  and comments.is_private = false
  and public.is_student_of_comment(comments.class_update_id)
);

drop policy if exists comments_parent_public_select on comments;
create policy comments_parent_public_select on comments for select
using (
  (select auth.jwt())->>'active_role' = 'parent'
  and comments.is_private = false
  and public.is_guardian_of_comment(comments.class_update_id)
);

-- private branch (identity-derived — already cheap; just wrap the token reads)
drop policy if exists comments_target_parent_select on comments;
create policy comments_target_parent_select on comments for select
using (
  (select auth.jwt())->>'active_role' = 'parent'
  and comments.is_private = true
  and comments.target_parent_id = (select auth.uid())
);

drop policy if exists comments_poster_teacher_private_select on comments;
create policy comments_poster_teacher_private_select on comments for select
using (
  (select auth.jwt())->>'active_role' = 'teacher'
  and comments.is_private = true
  and exists (
    select 1 from class_updates cu
    where cu.id = comments.class_update_id and cu.posted_by = (select auth.uid())
  )
);

-- oversight
drop policy if exists comments_coordinator_select on comments;
create policy comments_coordinator_select on comments for select
using (
  (select auth.jwt())->>'active_role' = 'coordinator'
  and exists (select 1 from class_updates cu where cu.id = comments.class_update_id)
);

drop policy if exists comments_org_select on comments;
create policy comments_org_select on comments for select
using ((select auth.jwt())->>'active_role' in ('bv_coordinator','admin'));

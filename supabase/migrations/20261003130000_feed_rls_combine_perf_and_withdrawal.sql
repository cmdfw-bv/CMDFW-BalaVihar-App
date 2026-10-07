-- #105 (feed RLS perf) + #96/#112 (withdrawal revokes conversational access) -- final combined state.
--
-- Two in-flight changes touched the SAME class_updates/comments read policies and helpers:
--   * #105 (20261002120000 + 20261002130000) replaced the inline nested
--     exists(... enrollments -> students -> family_members ...) subqueries in the feed-read
--     policies with SECURITY DEFINER membership helpers (caller-scoped via auth.uid(), so no
--     info leak), taking the feed query from 575 subplans to 0. It ALSO wrapped
--     auth.jwt()/auth.uid() as (select auth.jwt())/(select auth.uid()).
--   * #96/#112 (20261003120000, ADR-2026-09-19) made the same conversational policies
--     withdrawal-aware: a mid-year withdrawal (enrollments.status != 'active') revokes the
--     student's and their parents' read/write of class_updates + comments, including the private
--     thread. #112 was written against the pre-#105 inline form (bare auth.jwt()).
--
-- This migration runs AFTER both and supersedes them, producing one final set that is BOTH fast
-- (helper-based, 0 subplans) AND withdrawal-aware.
--
-- TWO DECISIONS BAKED IN HERE:
--  1. The (select auth.jwt())/(select auth.uid()) wrapping from #105 is DROPPED entirely. EXPLAIN
--     showed it added nothing measurable (the plan is identical with or without it once the nested
--     RLS cascade is gone), and the bare form is the codebase convention (#112's note). Every
--     policy/function below uses the BARE auth.jwt()->>'...' / auth.uid() form.
--  2. #112's status='active' predicate is merged into the helper-based fast form -- but ONLY on
--     the conversational policies #112 touched. The reference-data policies (classes/sessions/
--     centers) are left exactly as #105 had them; #112 never touched them, so a withdrawn
--     family's visibility of reference rows is unchanged.
--
-- Because some #105 helpers are shared between conversational and reference-data policies, they
-- are split so the status filter lands only where #112 intended:
--   STATUS-AGNOSTIC (reference data -- NO status filter; behavior unchanged from #105):
--     is_student_of_class, is_guardian_of_class          (used by classes_student/parent_select)
--     is_guardian_in_session, is_student_in_session       (sessions_*)
--     is_guardian_in_center, is_student_in_center         (centers_*)
--     class_in_session, class_in_center, session_in_center (reference-data containment)
--   STATUS-FILTERED (conversational -- '... and e.status = ''active''''):
--     is_active_student_of_class, is_active_guardian_of_class  NEW; used by the class_updates
--         student/parent reads (same bodies as the agnostic pair + the status filter)
--     is_student_of_comment, is_guardian_of_comment            used ONLY by comments policies
--         (all conversational), so the status filter is added directly to them
--     is_parent_of_class                                       #112 form (status='active')
--   RELAXED (NO status filter -- deliberate, ADR-2026-09-19 Decision 4):
--     resolve_parent_family_label  -- a withdrawn family's existing private thread keeps its real
--         label for the Teacher; the caller gate is unchanged.
--
-- Guarded by the adversarial pgTAP suites 170 + 171 (171 GROUP 9 proves the withdrawal behavior)
-- and 010_operational_core_rls. No assertion in those suites changes.

-- ======================================================================================
-- MEMBERSHIP HELPERS
-- ======================================================================================

-- --- status-AGNOSTIC: class membership (reference data -- classes_student/parent_select) --------

-- Caller is a student enrolled (any status) in p_class_id.
create or replace function public.is_student_of_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    where e.class_id = p_class_id and s.user_id = auth.uid()
  );
$$;
revoke execute on function public.is_student_of_class(uuid) from public, anon;
grant execute on function public.is_student_of_class(uuid) to authenticated;

-- Caller is a guardian of an enrolled (any status) student in p_class_id.
create or replace function public.is_guardian_of_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = p_class_id and fm.user_id = auth.uid()
  );
$$;
revoke execute on function public.is_guardian_of_class(uuid) from public, anon;
grant execute on function public.is_guardian_of_class(uuid) to authenticated;

-- --- status-FILTERED: class membership (conversational -- class_updates student/parent reads) ---
-- Same bodies as the agnostic pair, plus `and e.status = 'active'`. Separate functions so the
-- withdrawal predicate does NOT bleed into the reference-data (classes) policies.

create or replace function public.is_active_student_of_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    where e.class_id = p_class_id and s.user_id = auth.uid()
      and e.status = 'active'
  );
$$;
revoke execute on function public.is_active_student_of_class(uuid) from public, anon;
grant execute on function public.is_active_student_of_class(uuid) to authenticated;

create or replace function public.is_active_guardian_of_class(p_class_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from enrollments e
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where e.class_id = p_class_id and fm.user_id = auth.uid()
      and e.status = 'active'
  );
$$;
revoke execute on function public.is_active_guardian_of_class(uuid) from public, anon;
grant execute on function public.is_active_guardian_of_class(uuid) to authenticated;

-- --- status-AGNOSTIC: session / center membership (reference data -- sessions_*/centers_*) ------

create or replace function public.is_guardian_in_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where c.session_id = p_session_id and fm.user_id = auth.uid()
  );
$$;
revoke execute on function public.is_guardian_in_session(uuid) from public, anon;
grant execute on function public.is_guardian_in_session(uuid) to authenticated;

create or replace function public.is_student_in_session(p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from classes c
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where c.session_id = p_session_id and s.user_id = auth.uid()
  );
$$;
revoke execute on function public.is_student_in_session(uuid) from public, anon;
grant execute on function public.is_student_in_session(uuid) to authenticated;

create or replace function public.is_guardian_in_center(p_center_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    join family_members fm on fm.family_id = s.family_id
    where se.center_id = p_center_id and fm.user_id = auth.uid()
  );
$$;
revoke execute on function public.is_guardian_in_center(uuid) from public, anon;
grant execute on function public.is_guardian_in_center(uuid) to authenticated;

create or replace function public.is_student_in_center(p_center_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from sessions se
    join classes c on c.session_id = se.id
    join enrollments e on e.class_id = c.id
    join students s on s.id = e.student_id
    where se.center_id = p_center_id and s.user_id = auth.uid()
  );
$$;
revoke execute on function public.is_student_in_center(uuid) from public, anon;
grant execute on function public.is_student_in_center(uuid) to authenticated;

-- --- status-AGNOSTIC: reference-data containment (no user data; no leak) -------------------------

create or replace function public.class_in_session(p_class_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from classes c where c.id = p_class_id and c.session_id = p_session_id
  );
$$;
revoke execute on function public.class_in_session(uuid, uuid) from public, anon;
grant execute on function public.class_in_session(uuid, uuid) to authenticated;

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

create or replace function public.session_in_center(p_session_id uuid, p_center_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from sessions se where se.id = p_session_id and se.center_id = p_center_id
  );
$$;
revoke execute on function public.session_in_center(uuid, uuid) from public, anon;
grant execute on function public.session_in_center(uuid, uuid) to authenticated;

-- --- status-FILTERED: comment membership (conversational -- ALL comments callers) ---------------
-- Used ONLY by comments policies, every one of which is conversational, so the status filter is
-- added directly (no agnostic variant needed). is_guardian_of_comment serves BOTH the public
-- parent read AND the private-thread read, so a withdrawn parent loses their private thread too.

create or replace function public.is_student_of_comment(p_class_update_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from class_updates cu
    join enrollments e on e.class_id = cu.class_id
    join students s on s.id = e.student_id
    where cu.id = p_class_update_id and s.user_id = auth.uid()
      and e.status = 'active'
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
    where cu.id = p_class_update_id and fm.user_id = auth.uid()
      and e.status = 'active'
  );
$$;
revoke execute on function public.is_guardian_of_comment(uuid) from public, anon;
grant execute on function public.is_guardian_of_comment(uuid) to authenticated;

-- --- status-FILTERED: is_parent_of_class (#112 form) --------------------------------------------
-- Enrollment join gains `and e.status = 'active'`. Called by comments_teacher_insert on every
-- private insert (new thread OR reply), so a Teacher cannot open/continue a private thread with a
-- withdrawn parent. The auth.jwt() caller gate (role/scope) from #52 is preserved alongside it.
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

-- --- RELAXED: resolve_parent_family_label (#112 form -- NO status filter, Decision 4) -----------
-- The ONE deliberate relaxation: the enrollment join carries no status filter, so a withdrawn
-- family's existing private thread keeps its real families.label on the Teacher's card instead of
-- the anonymous fallback. Returns families.label only (never a student value); the caller gate is
-- unchanged, and enrollments_*_select already shows this caller the withdrawn row.
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

-- ======================================================================================
-- class_updates SELECT  (student/parent reads: status-filtered helpers; rest unchanged from #105)
-- ======================================================================================

drop policy if exists class_updates_teacher_select on class_updates;
create policy class_updates_teacher_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and class_updates.class_id = (auth.jwt()->>'scope_id')::uuid
);

drop policy if exists class_updates_student_select on class_updates;
create policy class_updates_student_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'student'
  and public.is_active_student_of_class(class_updates.class_id)
);

drop policy if exists class_updates_parent_select on class_updates;
create policy class_updates_parent_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and public.is_active_guardian_of_class(class_updates.class_id)
);

drop policy if exists class_updates_coordinator_select on class_updates;
create policy class_updates_coordinator_select on class_updates for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and public.class_in_session(class_updates.class_id, (auth.jwt()->>'scope_id')::uuid)
);

drop policy if exists class_updates_org_select on class_updates;
create policy class_updates_org_select on class_updates for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- ======================================================================================
-- centers SELECT  (reference data -- unchanged behavior from #105, bare form)
-- ======================================================================================

drop policy if exists centers_parent_select on centers;
create policy centers_parent_select on centers for select
using (auth.jwt()->>'active_role' = 'parent' and public.is_guardian_in_center(centers.id));

drop policy if exists centers_student_select on centers;
create policy centers_student_select on centers for select
using (auth.jwt()->>'active_role' = 'student' and public.is_student_in_center(centers.id));

drop policy if exists centers_teacher_select on centers;
create policy centers_teacher_select on centers for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and public.class_in_center((auth.jwt()->>'scope_id')::uuid, centers.id)
);

drop policy if exists centers_coordinator_select on centers;
create policy centers_coordinator_select on centers for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and public.session_in_center((auth.jwt()->>'scope_id')::uuid, centers.id)
);

drop policy if exists centers_org_select on centers;
create policy centers_org_select on centers for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- ======================================================================================
-- sessions SELECT  (reference data -- unchanged behavior from #105, bare form)
-- ======================================================================================

drop policy if exists sessions_parent_select on sessions;
create policy sessions_parent_select on sessions for select
using (auth.jwt()->>'active_role' = 'parent' and public.is_guardian_in_session(sessions.id));

drop policy if exists sessions_student_select on sessions;
create policy sessions_student_select on sessions for select
using (auth.jwt()->>'active_role' = 'student' and public.is_student_in_session(sessions.id));

drop policy if exists sessions_teacher_select on sessions;
create policy sessions_teacher_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and public.class_in_session((auth.jwt()->>'scope_id')::uuid, sessions.id)
);

drop policy if exists sessions_coordinator_select on sessions;
create policy sessions_coordinator_select on sessions for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and sessions.id = (auth.jwt()->>'scope_id')::uuid
);

drop policy if exists sessions_org_select on sessions;
create policy sessions_org_select on sessions for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- ======================================================================================
-- classes SELECT  (reference data -- status-AGNOSTIC helpers; unchanged behavior from #105)
-- ======================================================================================

drop policy if exists classes_parent_select on classes;
create policy classes_parent_select on classes for select
using (auth.jwt()->>'active_role' = 'parent' and public.is_guardian_of_class(classes.id));

drop policy if exists classes_student_select on classes;
create policy classes_student_select on classes for select
using (auth.jwt()->>'active_role' = 'student' and public.is_student_of_class(classes.id));

drop policy if exists classes_teacher_select on classes;
create policy classes_teacher_select on classes for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and classes.id = (auth.jwt()->>'scope_id')::uuid
);

drop policy if exists classes_coordinator_select on classes;
create policy classes_coordinator_select on classes for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and classes.session_id = (auth.jwt()->>'scope_id')::uuid
);

drop policy if exists classes_org_select on classes;
create policy classes_org_select on classes for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- ======================================================================================
-- comments SELECT  (conversational -- student/parent public + private thread are status-filtered
-- via the comment helpers; teacher/coordinator/org oversight unchanged from #105, bare form)
-- ======================================================================================

drop policy if exists comments_teacher_public_select on comments;
create policy comments_teacher_public_select on comments for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and comments.is_private = false
  and exists (
    select 1 from class_updates cu
    where cu.id = comments.class_update_id and cu.class_id = (auth.jwt()->>'scope_id')::uuid
  )
);

drop policy if exists comments_student_public_select on comments;
create policy comments_student_public_select on comments for select
using (
  auth.jwt()->>'active_role' = 'student'
  and comments.is_private = false
  and public.is_student_of_comment(comments.class_update_id)
);

drop policy if exists comments_parent_public_select on comments;
create policy comments_parent_public_select on comments for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and comments.is_private = false
  and public.is_guardian_of_comment(comments.class_update_id)
);

-- Private thread: identity-derived (target_parent_id = auth.uid()) AND now enrollment+status-gated
-- via is_guardian_of_comment (#112 Decision 1b -- a withdrawn parent loses their private thread
-- too). The helper is status-filtered, so this reuses it rather than re-inlining the join.
drop policy if exists comments_target_parent_select on comments;
create policy comments_target_parent_select on comments for select
using (
  auth.jwt()->>'active_role' = 'parent'
  and comments.is_private = true
  and comments.target_parent_id = auth.uid()
  and public.is_guardian_of_comment(comments.class_update_id)
);

drop policy if exists comments_poster_teacher_private_select on comments;
create policy comments_poster_teacher_private_select on comments for select
using (
  auth.jwt()->>'active_role' = 'teacher'
  and comments.is_private = true
  and exists (
    select 1 from class_updates cu
    where cu.id = comments.class_update_id and cu.posted_by = auth.uid()
  )
);

drop policy if exists comments_coordinator_select on comments;
create policy comments_coordinator_select on comments for select
using (
  auth.jwt()->>'active_role' = 'coordinator'
  and exists (select 1 from class_updates cu where cu.id = comments.class_update_id)
);

drop policy if exists comments_org_select on comments;
create policy comments_org_select on comments for select
using (auth.jwt()->>'active_role' in ('bv_coordinator','admin'));

-- ======================================================================================
-- comments INSERT  (#112 final form -- bare auth.jwt(), inline exists with status='active'.
-- Inline exists is fine here: inserts are single-row, so there is no feed-scale cascade.
-- All of #112's other checks preserved: author_user_id = auth.uid(), author_role, is_private /
-- target_parent_id rules. comments_teacher_insert is intentionally NOT restated -- its private
-- branch reaches the withdrawal predicate through is_parent_of_class above.)
-- ======================================================================================

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

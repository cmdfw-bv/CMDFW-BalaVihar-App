-- Extends resolve_my_scope_labels() (issue #76) so a student role's scope label shows their
-- Center · Session · Class instead of the capitalized scope_type fallback "Org". Students are
-- seeded (and granted in production by role-sweep.ts) scope_type='org'/scope_id=null -- their
-- "self" scope resolves via students.user_id, not scope_id (#61/#67), exactly like parents
-- resolve via family_members. Per ADR-0014 §4 a single-role user's static context chip names
-- the bound scope (Center · Session · Grade/Class); before this, only staff (class/session/
-- center scope) and parents (their children's names, 20260715030000) resolved a real label,
-- so a student fell through to the "Org" fallback -- which reads as org-wide access a student
-- does not have (the same misleading-label reason that migration cited for parents).
--
-- The label comes from the student's ACTIVE enrollment (status-only -- there is no date-window
-- check against sessions.end_date; a stale 'active' row from a finished session is mitigated by
-- ordering, not filtered out). A student with NO active enrollment -- withdrawn, or not in the
-- latest registration -- resolves to null. Making that null render gracefully is deliberately NOT
-- this migration's job: whether such a student should retain portal access at all is an open
-- architectural question, not decided here (it runs against the precedent that reference/
-- operational reads like classes_parent_select/classes_student_select stay unfiltered for a
-- withdrawn family). WHO may log in -- registration-driven access + the annual reset, all roles
-- -- is a separate access-lifecycle concern tracked for a future ADR (see #82) -- out of scope
-- here; /architect owns the eventual call, this migration takes no position on it.
--
-- A returning student can legitimately hold TWO active enrollments (last year's + this year's):
-- enrollments_one_active_per_session only constrains WITHIN a session, and the reset that retires
-- old rows is deferred to #82. `order by se.start_date desc, cl.name, cl.id` picks this year's
-- (newest) class -- test case 20 exercises this. The `limit 1` is load-bearing rather than
-- defensive: students.user_id has no uniqueness constraint (follow-up #81), so this branch is the
-- first consumer that must deterministically pick one of N possible rows.
--
-- The role='student' branch sits ahead of the scope_type branches on purpose (mirroring parent):
-- a student row resolves by its enrollment, never by a scope_id -- which is what makes the
-- forged-claim inertness proven in cases 17-18 structural rather than incidental.
--
-- Unlike the parent branch, this reads no minor's PII: only Center/Session/Class reference-data
-- names plus the caller's own enrollment linkage, via the same active-role-agnostic SECURITY
-- DEFINER / auth.uid() mechanism (ADR-0027). Cross-identity isolation is proven in
-- supabase/tests/150_scope_label_resolution_rpc.sql: case 19 authenticates as a SECOND student and
-- asserts they see only their own class; cases 17-18 cover forged-claim inertness.
create or replace function public.resolve_my_scope_labels()
returns table (user_roles_id uuid, scope_label text)
language sql
stable
security definer
set search_path = public
as $$
  select
    ur.id as user_roles_id,
    case
      when ur.role = 'parent' then (
        select string_agg(s.first_name, ', ' order by s.first_name)
        from family_members fm
        join students s on s.family_id = fm.family_id
        where fm.user_id = ur.user_id
      )
      when ur.role = 'student' then (
        select ce.name || ' · ' || se.name || ' · ' || cl.name
        from students st
        join enrollments en on en.student_id = st.id and en.status = 'active'
        join classes cl on cl.id = en.class_id
        join sessions se on se.id = cl.session_id  -- session from the class, not en.session_id (the class is authoritative)
        join centers ce on ce.id = se.center_id
        where st.user_id = ur.user_id
        order by se.start_date desc, cl.name, cl.id
        limit 1  -- load-bearing, not defensive: students.user_id is not unique (follow-up #81)
      )
      when ur.scope_type = 'class' then (
        select ce.name || ' · ' || se.name || ' · ' || cl.name
        from classes cl
        join sessions se on se.id = cl.session_id
        join centers ce on ce.id = se.center_id
        where cl.id = ur.scope_id
      )
      when ur.scope_type = 'session' then (
        select ce.name || ' · ' || se.name
        from sessions se
        join centers ce on ce.id = se.center_id
        where se.id = ur.scope_id
      )
      when ur.scope_type = 'center' then (
        select ce.name from centers ce where ce.id = ur.scope_id
      )
      else null
    end as scope_label
  from user_roles ur
  where ur.user_id = auth.uid();
$$;

revoke all on function public.resolve_my_scope_labels() from public;
grant execute on function public.resolve_my_scope_labels() to authenticated;

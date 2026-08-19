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
-- The label comes from the student's CURRENT (active) enrollment only. A student with NO current
-- active enrollment -- withdrawn, or not in the latest registration -- resolves to null. Making
-- that null render gracefully is deliberately NOT this migration's job: such a student should not
-- have portal access at all. WHO may log in (registration-driven access + the annual academic-year
-- reset, all roles) is a separate access-lifecycle concern tracked for a future ADR (see #58) --
-- out of scope here. A student is registered in exactly one session, so a single active enrollment
-- is expected; if a stale cross-session active row ever slips through (also a lifecycle gap),
-- `order by se.start_date desc, cl.name, cl.id` keeps the label single-valued and on the NEWEST
-- session rather than returning last year's class or erroring.
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
        join sessions se on se.id = cl.session_id
        join centers ce on ce.id = se.center_id
        where st.user_id = ur.user_id
        order by se.start_date desc, cl.name, cl.id
        limit 1
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

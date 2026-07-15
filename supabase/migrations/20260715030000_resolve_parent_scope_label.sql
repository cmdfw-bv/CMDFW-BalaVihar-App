-- Extends resolve_my_scope_labels() (issue #35 follow-up) so a parent role's scope label shows
-- the actual children's names instead of the capitalized scope_type fallback "Org". Parents are
-- seeded scope_type='org'/scope_id=null (seed.sql: "parent has no scope_id concept; stored as
-- org/null, resolved via family_members at read time") -- this migration is what actually does
-- that resolution. A parent has NO org-wide access (RLS scopes them to their own children via
-- family_members); showing "Org" in the header/switcher read as org-wide access, which is
-- actively misleading.
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

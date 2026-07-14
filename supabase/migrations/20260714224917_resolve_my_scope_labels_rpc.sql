-- Resolves scope_id to a friendly Center/Session/Class name for every user_roles row the
-- caller owns (issue #35). SECURITY DEFINER, keyed on auth.uid() rather than the JWT's
-- active_role/scope_type/scope_id claims: the existing per-active-role RLS on
-- classes/sessions/centers only lets a role read its own scope while that role is
-- currently active, but the role-switcher's bottom sheet must show a label for every held
-- role simultaneously, including inactive ones. Matches the is_family_member /
-- switch_active_role precedent (core_operational_rls_policies.sql,
-- switch_active_role_rpc.sql) for this exact "bypass RLS, but only for the caller's own
-- rows" shape.
create or replace function public.resolve_my_scope_labels()
returns table (user_roles_id uuid, scope_label text)
language sql
stable
security definer
set search_path = public
as $$
  select
    ur.id as user_roles_id,
    case ur.scope_type
      when 'class' then (
        select ce.name || ' · ' || se.name || ' · ' || cl.name
        from classes cl
        join sessions se on se.id = cl.session_id
        join centers ce on ce.id = se.center_id
        where cl.id = ur.scope_id
      )
      when 'session' then (
        select ce.name || ' · ' || se.name
        from sessions se
        join centers ce on ce.id = se.center_id
        where se.id = ur.scope_id
      )
      when 'center' then (
        select ce.name from centers ce where ce.id = ur.scope_id
      )
      else null
    end as scope_label
  from user_roles ur
  where ur.user_id = auth.uid();
$$;

revoke all on function public.resolve_my_scope_labels() from public;
grant execute on function public.resolve_my_scope_labels() to authenticated;

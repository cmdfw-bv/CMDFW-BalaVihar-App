create or replace function switch_active_role(p_user_roles_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  select user_id into v_owner from user_roles where id = p_user_roles_id;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    return; -- no-op: no error, no existence leak, per ADR-0022
  end if;

  update user_roles set is_active = false where user_id = auth.uid() and is_active;
  update user_roles set is_active = true where id = p_user_roles_id;
end;
$$;

revoke all on function switch_active_role(uuid) from public;
grant execute on function switch_active_role(uuid) to authenticated;

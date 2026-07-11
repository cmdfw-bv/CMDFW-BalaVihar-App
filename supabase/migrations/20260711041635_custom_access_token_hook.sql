create or replace function custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_user_id uuid := (event->>'user_id')::uuid;
  v_active user_roles%rowtype;
  claims jsonb := event->'claims';
begin
  -- Ensure: if the caller holds >=1 grant and none is active, auto-activate
  -- one deterministically (narrowest scope first: class > session > center >
  -- org; center has no role mapped today per ADR-0023 but is included so the
  -- CASE never falls through unhandled; tie-broken by created_at ascending).
  if not exists (select 1 from user_roles where user_id = v_user_id and is_active) then
    update user_roles
    set is_active = true
    where id = (
      select id from user_roles
      where user_id = v_user_id
      order by
        case scope_type
          when 'class' then 1
          when 'session' then 2
          when 'center' then 3
          when 'org' then 4
        end,
        created_at asc
      limit 1
    );
  end if;

  -- Read: at most one active row is now guaranteed (partial unique index),
  -- or zero if the caller holds no user_roles grant at all.
  select * into v_active from user_roles where user_id = v_user_id and is_active;

  if not found then
    -- Zero-role user: claims pass through unmodified, no active_role key.
    -- Every existing RLS policy already default-denies on a missing claim.
    return jsonb_set(event, '{claims}', claims);
  end if;

  claims := jsonb_set(claims, '{active_role}', to_jsonb(v_active.role::text));
  claims := jsonb_set(claims, '{scope_type}', to_jsonb(v_active.scope_type::text));
  claims := case
    when v_active.scope_id is not null then jsonb_set(claims, '{scope_id}', to_jsonb(v_active.scope_id::text))
    else claims - 'scope_id'
  end;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

revoke all on function custom_access_token_hook(jsonb) from public;
grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Grant-identity uniqueness (design decision #4) — enables idempotent-no-op duplicate
-- grants (AC#4) via an atomic insert rather than a race-prone app-level check-then-insert.
-- coalesce(...) is required (not a plain scope_id column) because org-scoped rows always
-- have scope_id = NULL (user_roles_org_scope_null_id check constraint), and plain UNIQUE
-- treats every NULL as distinct.
create unique index if not exists user_roles_grant_identity_idx
  on user_roles (user_id, role, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- PostgREST's client-library upsert(onConflict:) only accepts a literal column list — it
-- cannot target the coalesce(...) expression index above. This RPC is the mechanical
-- translation of the design spec's literal `insert ... on conflict (...) do nothing
-- returning id` (Phase 4) into something callable via supabase-js's .rpc(), since that SQL
-- can't be expressed through .upsert(). Called only by the manual grant path (user-role-grant.ts);
-- the sweep (role-sweep.ts) does its own select-then-insert, matching db-ops.ts's existing
-- pattern for the other partial-unique-index tables (families, students).
create or replace function insert_user_role_grant(
  p_user_id uuid,
  p_role app_role,
  p_scope_type app_scope_type,
  p_scope_id uuid,
  p_is_active boolean
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into user_roles (user_id, role, scope_type, scope_id, is_active)
  values (p_user_id, p_role, p_scope_type, p_scope_id, p_is_active)
  on conflict (user_id, role, scope_type, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid))
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function insert_user_role_grant(uuid, app_role, app_scope_type, uuid, boolean) from public;

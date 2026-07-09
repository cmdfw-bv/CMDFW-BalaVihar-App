-- pgTAP for adversarial RLS testing (§11.3)
create extension if not exists pgtap with schema extensions;

-- Test-only schema. Not in supabase/config.toml's api.schemas, so never exposed
-- via the Data API. Execute is additionally revoked from public/anon/authenticated
-- below as defense-in-depth (these functions can fabricate JWT claims / auth.users
-- rows); the migration/test-runner role (postgres) is the owner of these functions
-- and always retains full privileges regardless of that revoke.
create schema if not exists tests;

-- Schema-level USAGE is not granted to public/anon (a new schema grants none
-- by default, unlike a function's implicit PUBLIC execute grant). `authenticated`
-- needs USAGE + EXECUTE on tests.clear_authentication() only: authenticate_as's
-- set_config('role', 'authenticated', true) flips the rest of the transaction's
-- current_user to `authenticated` (verified live), so the smoke test's own
-- clear_authentication() call runs as `authenticated`, not postgres.
grant usage on schema tests to authenticated;

create or replace function tests.authenticate_as(
  p_user_id uuid,
  p_role text,
  p_scope_type text default null,
  p_scope_id uuid default null
) returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated',
    'active_role', p_role,
    'scope_type', p_scope_type,
    'scope_id', p_scope_id::text
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

create or replace function tests.clear_authentication() returns void
language plpgsql
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  execute 'reset role';
end;
$$;

create or replace function tests.create_supabase_user(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    p_email, '$2a$10$test.fixture.password.hash.only',
    now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );
  return v_id;
end;
$$;

-- Defense-in-depth: revoke the implicit PUBLIC execute grant plus the
-- application roles. The owner (postgres, the migration/test-runner role)
-- retains execute regardless of these revokes.
--
-- tests.clear_authentication() keeps EXECUTE for `authenticated`: it does not
-- fabricate claims or rows (it only clears request.jwt.claims / resets role),
-- and authenticate_as's set_config('role', 'authenticated', true) flips the
-- *current_user* of the rest of the transaction to `authenticated` (verified
-- live) -- so the test suite's own call to clear_authentication() runs as
-- `authenticated`, not postgres, and needs this grant to succeed. Revoking
-- execute from `public` removes the *implicit* PUBLIC grant that
-- `authenticated` was otherwise relying on, so it's re-granted explicitly and
-- narrowly, function-by-function, below. `anon` never gets it back, so
-- unauthenticated access is still fully blocked; a caller who already holds a
-- valid authenticated JWT can only clear/downgrade their own session this way,
-- not escalate it.
revoke execute on function tests.authenticate_as(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function tests.clear_authentication() from public, anon, authenticated;
revoke execute on function tests.create_supabase_user(text) from public, anon, authenticated;
grant execute on function tests.clear_authentication() to authenticated;

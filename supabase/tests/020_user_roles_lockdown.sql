begin;
select plan(3);

-- Note: Original plan specified 4 assertions including one that switches to supabase_auth_admin
-- role to confirm it can read user_roles. This 4th assertion is dropped here because the test
-- harness runs as 'postgres', which is not a member of supabase_auth_admin and cannot
-- SET ROLE to it (permission denied). This is a structural limitation of the local Supabase
-- stack, not a bug in the RLS. The grant to supabase_auth_admin and its RLS policy are
-- believed correct by inspection, but require integration-level coverage in the real auth hook.

select tests.create_supabase_user('multirole-fixture@test.local') as v_user \gset

insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());

-- Negative: authenticated (any simulated role) gets only their own row, never another's,
-- never an error. (user_roles_self_select, added by client-auth-session-and-nav, narrows the
-- prior zero-client-read posture to one row's own grants — see 140_user_roles_self_select.sql
-- for the dedicated cross-user isolation coverage.)
select tests.authenticate_as(:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from user_roles)::int, 1, 'teacher gets exactly their own row from user_roles directly, not zero');

select tests.clear_authentication();
select tests.authenticate_as(:'v_user'::uuid, 'admin', 'org', null);
select is((select count(*) from user_roles)::int, 1, 'admin (active_role claim) still only sees their own row, keyed on user_id not active_role');

-- Negative: no client role can write it.
select throws_ok(
  $$insert into user_roles (user_id, role, scope_type, scope_id) values (gen_random_uuid(), 'admin', 'org', null)$$,
  '42501',
  null,
  'authenticated cannot insert into user_roles'
);

select * from finish();
rollback;

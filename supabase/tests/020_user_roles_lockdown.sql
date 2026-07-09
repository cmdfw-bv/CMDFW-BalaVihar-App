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

-- Negative: authenticated (any simulated role) gets zero rows, never an error.
select tests.authenticate_as(:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from user_roles)::int, 0, 'teacher gets zero rows from user_roles directly');

select tests.clear_authentication();
select tests.authenticate_as(:'v_user'::uuid, 'admin', 'org', null);
select is((select count(*) from user_roles)::int, 0, 'admin gets zero rows from user_roles directly (no client policy at all, per §5.5)');

-- Negative: no client role can write it.
select throws_ok(
  $$insert into user_roles (user_id, role, scope_type, scope_id) values (gen_random_uuid(), 'admin', 'org', null)$$,
  '42501',
  null,
  'authenticated cannot insert into user_roles'
);

select * from finish();
rollback;

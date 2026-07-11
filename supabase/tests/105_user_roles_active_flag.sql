begin;
select plan(3);

-- Note: Original plan specified 5 assertions including tests that switch to supabase_auth_admin
-- role. The supabase_auth_admin tests are not directly runnable in the local test harness because
-- the test runner (postgres) is not a member of that reserved role and cannot SET ROLE to it
-- (permission denied). This is a structural limitation of the local Supabase stack, not a bug
-- in the RLS. The grant to supabase_auth_admin and its RLS policy are believed correct by
-- inspection, but require integration-level coverage (in the auth hook itself, Task 2).

select tests.create_supabase_user('active-flag-fixture@test.local') as v_user \gset

insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('af111111-0000-0000-0000-000000000001', :'v_user'::uuid, 'teacher', 'class', gen_random_uuid(), now()),
  ('af222222-0000-0000-0000-000000000002', :'v_user'::uuid, 'coordinator', 'session', gen_random_uuid(), now());

-- Positive: Column exists and defaults to false for newly inserted rows.
select is(
  (select is_active from user_roles where id = 'af111111-0000-0000-0000-000000000001'),
  false,
  'is_active column defaults to false for newly inserted rows (after migration)'
);

-- Negative: not even the row's own owner, simulated as plain authenticated, can write is_active directly.
select tests.authenticate_as(:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());
select throws_ok(
  $$update user_roles set is_active = true where id = 'af222222-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'authenticated cannot update is_active directly (only supabase_auth_admin / switch_active_role can)'
);
select tests.clear_authentication();

-- Sanity: a different user's rows are independent.
select tests.create_supabase_user('active-flag-fixture-2@test.local') as v_user2 \gset
insert into user_roles (user_id, role, scope_type, scope_id) values (:'v_user2'::uuid, 'parent', 'org', null);
select is(
  (select count(*) from user_roles where user_id = :'v_user2'::uuid)::int, 1,
  'a different user can have rows in user_roles table'
);

select tests.clear_authentication();
select * from finish();
rollback;

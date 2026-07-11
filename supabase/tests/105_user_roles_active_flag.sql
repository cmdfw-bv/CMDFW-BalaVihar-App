begin;
select plan(5);

-- Note: Original plan specified 5 assertions including one that switches to supabase_auth_admin
-- to prove the positive grant ("admin can flip is_active"). That single assertion is not directly
-- runnable in this local test harness because the test runner (postgres) is not a member of the
-- reserved supabase_auth_admin role and cannot SET ROLE to it (permission denied) -- same
-- structural limitation documented in 020_user_roles_lockdown.sql. The grant to supabase_auth_admin
-- and its RLS policy are believed correct by inspection, but require integration-level coverage
-- (in the auth hook itself, Task 2).
--
-- The unique-index and per-user-isolation assertions below do NOT have this limitation: the
-- pgTAP harness connects as postgres, a superuser. Superuser connections bypass RLS and
-- GRANT/REVOKE privilege checks, but a UNIQUE INDEX is a structural data-integrity constraint
-- enforced against every role, including superusers -- there is no bypass. So those assertions
-- are proven directly with plain UPDATEs as postgres, no role-switching needed.

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

-- Partial unique index: a second active row for the same user is rejected. Plain postgres UPDATE
-- (no role switch) -- the constraint is structural and binds even a superuser connection.
update user_roles set is_active = true where id = 'af111111-0000-0000-0000-000000000001';
select throws_ok(
  $$update user_roles set is_active = true where id = 'af222222-0000-0000-0000-000000000002'$$,
  '23505',
  null,
  'a second active row for the same user violates the partial unique index'
);

-- Sanity: exactly one active row for this user after the rejected attempt above.
select is(
  (select count(*) from user_roles where user_id = :'v_user'::uuid and is_active)::int, 1,
  'exactly one active row remains for the user'
);

-- Sanity: a different user's active row is independent (index is per-user, not global).
select tests.create_supabase_user('active-flag-fixture-2@test.local') as v_user2 \gset
insert into user_roles (id, user_id, role, scope_type, scope_id) values
  ('af333333-0000-0000-0000-000000000003', :'v_user2'::uuid, 'parent', 'org', null);
update user_roles set is_active = true where id = 'af333333-0000-0000-0000-000000000003';
select is(
  (select count(*) from user_roles where user_id in (:'v_user'::uuid, :'v_user2'::uuid) and is_active)::int, 2,
  'two different users can each have their own active row at the same time'
);

select tests.clear_authentication();
select * from finish();
rollback;

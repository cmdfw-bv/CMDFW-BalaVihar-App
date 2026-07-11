begin;
select plan(14);

-- Note: Case 10's brief specified two assertions: authenticated-denied (throws_ok, 42501)
-- and supabase_auth_admin-allowed (lives_ok). Only the first is included below. The second
-- was attempted -- including the brief's suggested escape hatch of
-- `grant supabase_auth_admin to postgres;` before falling back -- and both paths failed:
--   1. `set role supabase_auth_admin;` directly: "permission denied to set role
--      \"supabase_auth_admin\"" (42501).
--   2. `grant supabase_auth_admin to postgres;` as an attempted workaround: "\"supabase_auth_admin\"
--      role memberships are reserved, only superusers can grant them".
-- Investigating #2 revealed the connecting role is NOT actually a superuser here
-- (`select rolsuper from pg_roles where rolname = 'postgres'` returns false) -- it only has
-- rolbypassrls/rolcreaterole/rolcreatedb plus broad role memberships, which is what lets it
-- bypass RLS and REVOKE ... FROM PUBLIC elsewhere in this suite. supabase_auth_admin,
-- supabase_storage_admin, etc. are explicitly reserved by the local stack and only grantable
-- by a true superuser, which `postgres` is not. Same structural limitation documented in
-- 020_user_roles_lockdown.sql and 105_user_roles_active_flag.sql, now confirmed at the role-
-- attribute level rather than just observed as a SET ROLE failure. The grant to
-- supabase_auth_admin and its function grant are believed correct by inspection (verified by
-- \df+ showing supabase_auth_admin as the sole grantee), but the positive-allow half of Case 10
-- is not directly provable in this local test harness.

-- Case 1: single-role user, no active row yet -> hook auto-activates the sole row.
select tests.create_supabase_user('hook-single@test.local') as v_single \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('10000001-0000-0000-0000-000000000001', :'v_single'::uuid, 'teacher', 'class',
   '10000001-c000-0000-0000-000000000001'::uuid, now());

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_single',
    'claims', jsonb_build_object('sub', :'v_single')
  ))->'claims'->>'active_role',
  'teacher',
  'case 1: single-role user auto-activates their sole row'
);

-- Case 2: multi-role user, none active -> narrowest scope (class) wins over session/org.
select tests.create_supabase_user('hook-multi@test.local') as v_multi \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('20000002-0000-0000-0000-000000000001', :'v_multi'::uuid, 'teacher', 'class',
   '20000002-c000-0000-0000-000000000001'::uuid, now()),
  ('20000002-0000-0000-0000-000000000002', :'v_multi'::uuid, 'coordinator', 'session',
   '20000002-c000-0000-0000-000000000002'::uuid, now()),
  ('20000002-0000-0000-0000-000000000003', :'v_multi'::uuid, 'bv_coordinator', 'org', null, now());

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_multi',
    'claims', jsonb_build_object('sub', :'v_multi')
  ))->'claims'->>'active_role',
  'teacher',
  'case 2: multi-role user activates the class-scoped (narrowest) grant'
);
select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_multi',
    'claims', jsonb_build_object('sub', :'v_multi')
  ))->'claims'->>'scope_id',
  '20000002-c000-0000-0000-000000000001',
  'case 2: activated row is specifically the class-scoped one'
);

-- Case 3: two rows at the same scope_type, none active -> earlier created_at wins.
select tests.create_supabase_user('hook-tie@test.local') as v_tie \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at) values
  ('30000003-0000-0000-0000-000000000001', :'v_tie'::uuid, 'coordinator', 'session',
   '30000003-c000-0000-0000-000000000001'::uuid, '2026-01-01T00:00:00Z'),
  ('30000003-0000-0000-0000-000000000002', :'v_tie'::uuid, 'coordinator', 'session',
   '30000003-c000-0000-0000-000000000002'::uuid, '2026-02-01T00:00:00Z');

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_tie',
    'claims', jsonb_build_object('sub', :'v_tie')
  ))->'claims'->>'scope_id',
  '30000003-c000-0000-0000-000000000001',
  'case 3: tie-break activates the earlier-created_at row'
);

-- Case 4: a row already active -> ensure step is a no-op; claims match the pre-existing active row.
select tests.create_supabase_user('hook-already-active@test.local') as v_active \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, created_at, is_active) values
  ('40000004-0000-0000-0000-000000000001', :'v_active'::uuid, 'parent', 'org', null, now(), true),
  ('40000004-0000-0000-0000-000000000002', :'v_active'::uuid, 'teacher', 'class',
   '40000004-c000-0000-0000-000000000002'::uuid, now(), false);

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_active',
    'claims', jsonb_build_object('sub', :'v_active')
  ))->'claims'->>'active_role',
  'parent',
  'case 4: pre-existing active row wins, not reassigned to another grant'
);
select is(
  (select count(*) from user_roles where user_id = :'v_active'::uuid and is_active)::int,
  1,
  'case 4: ensure step did not touch is_active when one row was already active'
);

-- Case 5: zero-role user -> no active_role key; other claim keys pass through unchanged.
select tests.create_supabase_user('hook-zero@test.local') as v_zero \gset

select ok(
  not (
    (custom_access_token_hook(jsonb_build_object(
      'user_id', :'v_zero',
      'claims', jsonb_build_object('sub', :'v_zero')
    ))->'claims') ? 'active_role'
  ),
  'case 5: zero-role user gets no active_role claim key'
);
select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_zero',
    'claims', jsonb_build_object('sub', :'v_zero')
  ))->'claims'->>'sub',
  :'v_zero',
  'case 5: other claim keys (sub) pass through unmodified'
);

-- Case 6: active row is org-scoped -> claims carry no scope_id key at all (not JSON null).
select tests.create_supabase_user('hook-org@test.local') as v_org \gset
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_org'::uuid, 'bv_coordinator', 'org', null, true);

select ok(
  not (
    (custom_access_token_hook(jsonb_build_object(
      'user_id', :'v_org',
      'claims', jsonb_build_object('sub', :'v_org')
    ))->'claims') ? 'scope_id'
  ),
  'case 6: org-scoped active role omits the scope_id key entirely'
);

-- Case 7: active row is non-org-scoped -> scope_id present, equals the row's scope_id.
select tests.create_supabase_user('hook-nonorg@test.local') as v_nonorg \gset
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_nonorg'::uuid, 'teacher', 'class', '70000007-c000-0000-0000-000000000001'::uuid, true);

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_nonorg',
    'claims', jsonb_build_object('sub', :'v_nonorg')
  ))->'claims'->>'scope_id',
  '70000007-c000-0000-0000-000000000001',
  'case 7: non-org active role carries its real scope_id'
);

-- Case 8a: role revoked while active -> next hook call re-heals to the next-narrowest remaining grant.
select tests.create_supabase_user('hook-revoked@test.local') as v_revoked \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('80000008-0000-0000-0000-000000000001', :'v_revoked'::uuid, 'teacher', 'class',
   '80000008-c000-0000-0000-000000000001'::uuid, true),
  ('80000008-0000-0000-0000-000000000002', :'v_revoked'::uuid, 'coordinator', 'session',
   '80000008-c000-0000-0000-000000000002'::uuid, false),
  ('80000008-0000-0000-0000-000000000003', :'v_revoked'::uuid, 'bv_coordinator', 'org', null, false);

delete from user_roles where id = '80000008-0000-0000-0000-000000000001';

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_revoked',
    'claims', jsonb_build_object('sub', :'v_revoked')
  ))->'claims'->>'active_role',
  'coordinator',
  'case 8a: revoking the active row re-heals to the next-narrowest remaining grant'
);

-- Case 8b: revoking a user's only row leaves zero grants -> zero-claim result, not an error.
select tests.create_supabase_user('hook-revoked-to-none@test.local') as v_revoked_none \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('80000009-0000-0000-0000-000000000001', :'v_revoked_none'::uuid, 'parent', 'org', null, true);
delete from user_roles where id = '80000009-0000-0000-0000-000000000001';

select ok(
  not (
    (custom_access_token_hook(jsonb_build_object(
      'user_id', :'v_revoked_none',
      'claims', jsonb_build_object('sub', :'v_revoked_none')
    ))->'claims') ? 'active_role'
  ),
  'case 8b: revoking a user''s sole grant leaves no active_role claim, not an error'
);

-- Case 9: forgery resistance -> a fabricated active_role already in the incoming event is discarded.
select tests.create_supabase_user('hook-forge@test.local') as v_forge \gset
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_forge'::uuid, 'parent', 'org', null, true);

select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_forge',
    'claims', jsonb_build_object('sub', :'v_forge', 'active_role', 'admin')
  ))->'claims'->>'active_role',
  'parent',
  'case 9: hook discards a forged active_role already present on the incoming event'
);

-- Case 10: privilege check -> authenticated cannot call the hook directly (denied half only;
-- see note at top of file for the supabase_auth_admin-allowed half).
set role authenticated;
select throws_ok(
  $$select custom_access_token_hook(jsonb_build_object('user_id', gen_random_uuid()::text, 'claims', '{}'::jsonb))$$,
  '42501',
  null,
  'case 10: authenticated cannot call custom_access_token_hook directly'
);
reset role;

select * from finish();
rollback;

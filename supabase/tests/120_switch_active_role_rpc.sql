begin;
select plan(8);

-- Fixture: user X holds role A (active) + role B (inactive).
select tests.create_supabase_user('switch-x@test.local') as v_x \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000001-0000-0000-0000-00000000000a', :'v_x'::uuid, 'teacher', 'class',
   '90000001-c000-0000-0000-00000000000a'::uuid, true),
  ('90000001-0000-0000-0000-00000000000b', :'v_x'::uuid, 'coordinator', 'session',
   '90000001-c000-0000-0000-00000000000b'::uuid, false);

-- Case 1: owner switch flips active from A to B.
select tests.authenticate_as(:'v_x'::uuid, 'teacher', 'class', '90000001-c000-0000-0000-00000000000a'::uuid);
select switch_active_role('90000001-0000-0000-0000-00000000000b'::uuid);
select tests.clear_authentication();

select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000a'), false,
  'case 1: previously active row A is cleared after switching to B'
);
select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000b'), true,
  'case 1: target row B is now active'
);

-- Fixture: user Y, unrelated to X.
select tests.create_supabase_user('switch-y@test.local') as v_y \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000002-0000-0000-0000-000000000001', :'v_y'::uuid, 'parent', 'org', null, true);

-- Case 2: Y tries to switch X's row B -> no-op, no error, no state change for either user.
select tests.authenticate_as(:'v_y'::uuid, 'parent', 'org', null);
select lives_ok(
  $$select switch_active_role('90000001-0000-0000-0000-00000000000b'::uuid)$$,
  'case 2: calling switch_active_role on another user''s row does not raise an error'
);
select tests.clear_authentication();

select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000b'), true,
  'case 2: non-owner call left X''s active row (B) unchanged'
);
select is(
  (select is_active from user_roles where id = '90000002-0000-0000-0000-000000000001'), true,
  'case 2: non-owner call did not touch the caller''s (Y''s) own active row either'
);

-- Case 3: exactly one active row remains for X after the switches above (partial unique index sanity).
select is(
  (select count(*) from user_roles where user_id = :'v_x'::uuid and is_active)::int, 1,
  'case 3: exactly one active row for X'
);

-- Case 4: switching to the already-active row is an idempotent no-op (stays active, not toggled off).
select tests.authenticate_as(:'v_x'::uuid, 'coordinator', 'session', '90000001-c000-0000-0000-00000000000b'::uuid);
select switch_active_role('90000001-0000-0000-0000-00000000000b'::uuid);
select tests.clear_authentication();

select is(
  (select is_active from user_roles where id = '90000001-0000-0000-0000-00000000000b'), true,
  'case 4: switching to the already-active row leaves it active (idempotent)'
);

-- Case 5: hook/RPC integration - an immediate hook call reflects the newly-active role, no lag.
select is(
  custom_access_token_hook(jsonb_build_object(
    'user_id', :'v_x',
    'claims', jsonb_build_object('sub', :'v_x')
  ))->'claims'->>'active_role',
  'coordinator',
  'case 5: hook and switch_active_role share one source of truth (is_active)'
);

select * from finish();
rollback;

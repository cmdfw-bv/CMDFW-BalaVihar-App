begin;
select plan(4);

select tests.create_supabase_user('grant-idx@test.local') as v_user \gset

-- Case 1: RPC inserts a new grant and returns its id.
select ok(
  (select insert_user_role_grant(:'v_user'::uuid, 'parent', 'org', null, true)) is not null,
  'insert_user_role_grant returns a new id on first insert'
);

-- Case 2: identical grant tuple is an idempotent no-op (NULL, no error).
select is(
  (select insert_user_role_grant(:'v_user'::uuid, 'parent', 'org', null, false)),
  null,
  'insert_user_role_grant returns null on duplicate grant tuple (idempotent no-op)'
);

-- Case 3: exactly one row exists for that tuple (no duplicate row was created).
select is(
  (select count(*) from user_roles where user_id = :'v_user'::uuid and role = 'parent' and scope_type = 'org')::int, 1,
  'case 2 did not create a duplicate row'
);

-- Case 4: a different scope_id for a non-org role is a distinct grant, not deduped.
select tests.create_supabase_user('grant-idx2@test.local') as v_user2 \gset
select ok(
  (select insert_user_role_grant(:'v_user2'::uuid, 'teacher', 'class', gen_random_uuid(), true)) is not null,
  'insert_user_role_grant allows a class-scoped grant for a different scope_id'
);

select * from finish();
rollback;

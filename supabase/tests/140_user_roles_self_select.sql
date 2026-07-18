begin;
select plan(6);

select tests.create_supabase_user('self-select-a@test.local') as v_user_a \gset
select tests.create_supabase_user('self-select-b@test.local') as v_user_b \gset
select tests.create_supabase_user('self-select-zero@test.local') as v_user_zero \gset

insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_user_a'::uuid, 'teacher', 'class', gen_random_uuid()),
  (:'v_user_a'::uuid, 'coordinator', 'session', gen_random_uuid());
insert into user_roles (user_id, role, scope_type, scope_id) values
  (:'v_user_b'::uuid, 'parent', 'org', null);

-- (a) user A's query returns exactly their own N rows.
select tests.authenticate_as(:'v_user_a'::uuid, 'teacher', 'class', gen_random_uuid());
select is(
  (select count(*) from user_roles)::int, 2,
  'authenticated user sees exactly their own N user_roles rows'
);

-- (b) user A never sees user B's rows, across role/scope combinations.
select ok(
  not exists (select 1 from user_roles where user_id = :'v_user_b'::uuid),
  'authenticated user never sees another user''s user_roles rows'
);
select tests.clear_authentication();

-- (c) a zero-role user's query returns 0 rows, not an error (active_role claim is null,
-- matching the real zero-role JWT shape from auth-hook-and-identity, not a role string).
select tests.authenticate_as(:'v_user_zero'::uuid, null, null, null);
select is(
  (select count(*) from user_roles)::int, 0,
  'zero-role authenticated user gets 0 rows, not an error'
);
select tests.clear_authentication();

-- (d) insert/update/delete against user_roles as authenticated still fail — confirms the
-- new policy adds read only, nothing wider (unchanged from 020_user_roles_lockdown.sql's
-- insert case; this file adds the update/delete siblings for completeness against the new
-- select policy specifically).
select tests.authenticate_as(:'v_user_a'::uuid, 'teacher', 'class', gen_random_uuid());
select throws_ok(
  $$insert into user_roles (user_id, role, scope_type, scope_id) values (gen_random_uuid(), 'admin', 'org', null)$$,
  '42501', null,
  'authenticated cannot insert into user_roles (self-select policy is read-only)'
);
select throws_ok(
  format($$update user_roles set is_active = true where user_id = %L$$, :'v_user_a'::uuid),
  '42501', null,
  'authenticated cannot update user_roles (self-select policy is read-only)'
);
select throws_ok(
  format($$delete from user_roles where user_id = %L$$, :'v_user_a'::uuid),
  '42501', null,
  'authenticated cannot delete from user_roles (self-select policy is read-only)'
);

select tests.clear_authentication();
select * from finish();
rollback;

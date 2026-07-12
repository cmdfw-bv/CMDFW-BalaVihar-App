begin;
select plan(11);

-- Fixture users, one per role tier, plus a victim to attack.
select tests.create_supabase_user('adv-parent@test.local') as v_parent \gset
select tests.create_supabase_user('adv-teacher@test.local') as v_teacher \gset
select tests.create_supabase_user('adv-coord@test.local') as v_coord \gset
select tests.create_supabase_user('adv-bvcoord@test.local') as v_bvc \gset
select tests.create_supabase_user('adv-admin@test.local') as v_admin \gset
select tests.create_supabase_user('adv-victim@test.local') as v_victim \gset

insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_parent'::uuid, 'parent', 'org', null, true),
  (:'v_teacher'::uuid, 'teacher', 'class', gen_random_uuid(), true),
  (:'v_coord'::uuid, 'coordinator', 'session', gen_random_uuid(), true),
  (:'v_bvc'::uuid, 'bv_coordinator', 'org', null, true),
  (:'v_admin'::uuid, 'admin', 'org', null, true),
  (:'v_victim'::uuid, 'parent', 'org', null, true);

-- Attack 1: parent tries to directly SELECT other users' user_roles rows.
select tests.authenticate_as(:'v_parent'::uuid, 'parent', 'org', null);
select is((select count(*) from user_roles)::int, 0, 'ATTACK: parent gets zero rows selecting user_roles directly (RLS default-deny)');

-- Attack 2: parent tries direct INSERT to self-grant admin.
select throws_ok(
  format($$insert into user_roles (user_id, role, scope_type, scope_id) values (%L::uuid, 'admin', 'org', null)$$, :'v_parent'),
  '42501',
  null,
  'ATTACK DENY: parent cannot self-insert an admin row directly against user_roles'
);

-- Attack 3: parent tries direct DELETE of another user's row (revoke attack).
select throws_ok(
  format($$delete from user_roles where user_id = %L::uuid$$, :'v_victim'),
  '42501',
  null,
  'ATTACK DENY: parent cannot directly delete another user''s user_roles row'
);

select tests.clear_authentication();

-- Attack 4: teacher tries to call insert_user_role_grant RPC directly, bypassing the
-- Netlify handler's tiering check, self-targeting admin.
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', gen_random_uuid());
select throws_ok(
  format($$select insert_user_role_grant(%L::uuid, 'admin', 'org', null, true)$$, :'v_teacher'),
  '42501',
  null,
  'ATTACK DENY: teacher (authenticated role) cannot execute insert_user_role_grant RPC directly (no EXECUTE grant to authenticated)'
);
select tests.clear_authentication();

-- Attack 5: coordinator tries the same RPC directly, targeting themselves as admin.
select tests.authenticate_as(:'v_coord'::uuid, 'coordinator', 'session', gen_random_uuid());
select throws_ok(
  format($$select insert_user_role_grant(%L::uuid, 'admin', 'org', null, true)$$, :'v_coord'),
  '42501',
  null,
  'ATTACK DENY: coordinator cannot execute insert_user_role_grant RPC directly'
);
select tests.clear_authentication();

-- Attack 6: anon cannot select from user_roles at all.
set role anon;
select throws_ok(
  $$select * from user_roles limit 1$$,
  '42501',
  null,
  'ATTACK DENY: anon cannot select from user_roles at all'
);
reset role;

-- Attack 7: anon cannot call insert_user_role_grant.
set role anon;
select throws_ok(
  format($$select insert_user_role_grant(%L::uuid, 'admin', 'org', null, true)$$, :'v_victim'),
  '42501',
  null,
  'ATTACK DENY: anon cannot execute insert_user_role_grant RPC'
);
reset role;

-- Attack 8: anon cannot invoke custom_access_token_hook to forge claims.
set role anon;
select throws_ok(
  $$select custom_access_token_hook('{}'::jsonb)$$,
  '42501',
  null,
  'ATTACK DENY: anon cannot invoke custom_access_token_hook directly to forge claims'
);
reset role;

-- Attack 9: bv_coordinator direct SELECT on user_roles still denied — no client policy at any tier.
select tests.authenticate_as(:'v_bvc'::uuid, 'bv_coordinator', 'org', null);
select is((select count(*) from user_roles)::int, 0, 'ATTACK: bv_coordinator gets zero rows selecting user_roles directly (no client policy at any tier)');
select tests.clear_authentication();

-- Attack 10: admin direct SELECT on user_roles still denied (client role, not service_role).
select tests.authenticate_as(:'v_admin'::uuid, 'admin', 'org', null);
select is((select count(*) from user_roles)::int, 0, 'ATTACK: admin (client role, not service_role) gets zero rows selecting user_roles directly');
select tests.clear_authentication();

-- Attack 11: active-role switch — user holds teacher(active) + parent(inactive); after
-- switch_active_role, exactly one row remains active (no dual-active leak). Counted after
-- clear_authentication since user_roles has no client-readable policy at any tier (attacks 1/9/10) —
-- querying under the still-authenticated role would itself be denied and produce a false negative.
select tests.create_supabase_user('adv-multirole@test.local') as v_multi \gset
insert into user_roles (user_id, role, scope_type, scope_id, is_active) values
  (:'v_multi'::uuid, 'teacher', 'class', gen_random_uuid(), true);
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active)
  values (gen_random_uuid(), :'v_multi'::uuid, 'parent', 'org', null, false) returning id as v_parent_row \gset
select tests.authenticate_as(:'v_multi'::uuid, 'teacher', 'class', gen_random_uuid());
select switch_active_role(:'v_parent_row'::uuid);
select tests.clear_authentication();
select is(
  (select count(*) from user_roles where user_id = :'v_multi'::uuid and is_active = true),
  1::bigint,
  'ATTACK: after switch_active_role, exactly one row remains active for the multi-role user (no dual-active leak)'
);

select * from finish();
rollback;

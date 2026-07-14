begin;
select plan(8);

-- Fixture: Center Brampton -> Session Sunday AM -> Class Junior A.
select gen_random_uuid() as v_center \gset
select gen_random_uuid() as v_session \gset
select gen_random_uuid() as v_class \gset
insert into centers (id, name) values (:'v_center'::uuid, 'Brampton');
insert into sessions (id, center_id, name, start_date, end_date)
  values (:'v_session'::uuid, :'v_center'::uuid, 'Sunday AM', '2026-01-11', '2026-05-24');
insert into classes (id, session_id, name, grade_band)
  values (:'v_class'::uuid, :'v_session'::uuid, 'Junior A', 'Gr3');

-- Fixture: user M holds three roles at once (teacher/class, coordinator/session,
-- bv_coordinator/org) -- only the coordinator row is marked active. The RPC must still
-- resolve labels for ALL three, not just the active one (that's the whole point of a
-- SECURITY DEFINER function keyed on auth.uid() rather than the JWT's active_role claim).
select tests.create_supabase_user('scope-labels-m@test.local') as v_m \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000a', :'v_m'::uuid, 'teacher', 'class', :'v_class'::uuid, false),
  ('90000003-0000-0000-0000-00000000000b', :'v_m'::uuid, 'coordinator', 'session', :'v_session'::uuid, true),
  ('90000003-0000-0000-0000-00000000000c', :'v_m'::uuid, 'bv_coordinator', 'org', null, false);

-- Fixture: unrelated user O, own teacher grant on a different class.
select gen_random_uuid() as v_other_class \gset
insert into classes (id, session_id, name, grade_band)
  values (:'v_other_class'::uuid, :'v_session'::uuid, 'Senior B', 'Gr9');
select tests.create_supabase_user('scope-labels-o@test.local') as v_o \gset
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000d', :'v_o'::uuid, 'teacher', 'class', :'v_other_class'::uuid, true);

-- Case 1: M, authenticated with coordinator (the table's actually-active role), gets all 3 of M's own rows back.
select tests.authenticate_as(:'v_m'::uuid, 'coordinator', 'session', :'v_session'::uuid);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 3,
  'case 1: RPC returns all of the caller''s own roles, not just the active one'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000a'),
  'Brampton · Sunday AM · Junior A',
  'case 1: teacher (class scope) resolves to Center · Session · Class'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000b'),
  'Brampton · Sunday AM',
  'case 1: coordinator (session scope) resolves to Center · Session'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000c'),
  null,
  'case 1: bv_coordinator (org scope) resolves to null -- client falls back to "Org"'
);
select tests.clear_authentication();

-- Case 2: same user M, authenticated as a DIFFERENT held role (teacher, not the table's active
-- coordinator row) gets the identical 3-row result -- proves resolution is keyed on auth.uid()
-- ownership, not the JWT's active_role/scope claims.
select tests.authenticate_as(:'v_m'::uuid, 'teacher', 'class', :'v_class'::uuid);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 3,
  'case 2: result set is identical regardless of which held role is the JWT''s active_role'
);
select tests.clear_authentication();

-- Case 3: unrelated user O only ever sees their own single row -- never M's rows.
select tests.authenticate_as(:'v_o'::uuid, 'teacher', 'class', :'v_other_class'::uuid);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 1,
  'case 3: unrelated caller O sees exactly their own one row'
);
select is(
  (select scope_label from resolve_my_scope_labels() limit 1),
  'Brampton · Sunday AM · Senior B',
  'case 3: O''s own teacher row resolves correctly'
);
select tests.clear_authentication();

-- Case 4: a signed-out / sub-less caller gets zero rows, not an error and not every row in the table.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select set_config('role', 'authenticated', true);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 0,
  'case 4: a sub-less authenticated session resolves zero rows (auth.uid() is null, matches nothing)'
);
select tests.clear_authentication();

select * from finish();
rollback;

begin;
select plan(10);

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

-- Fixture: a family with two children, and a parent user whose user_roles row is seeded the
-- same way seed.sql seeds every parent (scope_type='org', scope_id=null) -- resolution must
-- come from family_members/students, not scope_type/scope_id.
select gen_random_uuid() as v_family \gset
insert into families (id, label) values (:'v_family'::uuid, 'Rao Family');
insert into students (id, family_id, first_name, last_name, grade_level) values
  (gen_random_uuid(), :'v_family'::uuid, 'Aanya', 'Rao', 'Gr3'),
  (gen_random_uuid(), :'v_family'::uuid, 'Kiran', 'Rao', 'Gr6');
select tests.create_supabase_user('scope-labels-parent@test.local') as v_parent \gset
insert into family_members (family_id, user_id, relationship) values (:'v_family'::uuid, :'v_parent'::uuid, 'guardian');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000e', :'v_parent'::uuid, 'parent', 'org', null, true);

-- Case 5: parent resolves to their children's names, not null/"Org".
select tests.authenticate_as(:'v_parent'::uuid, 'parent', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000e'),
  'Aanya, Kiran',
  'case 5: parent (org scope, no scope_id) resolves to comma-joined children''s first names'
);
select tests.clear_authentication();

-- Case 6: a parent with zero children on file still resolves cleanly to null (not an error) --
-- appHeaderSubtitle's client-side fallback (Task 6) is what turns this into "My Children".
select gen_random_uuid() as v_childless_family \gset
insert into families (id, label) values (:'v_childless_family'::uuid, 'Childless Family');
select tests.create_supabase_user('scope-labels-childless-parent@test.local') as v_childless_parent \gset
insert into family_members (family_id, user_id, relationship) values (:'v_childless_family'::uuid, :'v_childless_parent'::uuid, 'guardian');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000f', :'v_childless_parent'::uuid, 'parent', 'org', null, true);
select tests.authenticate_as(:'v_childless_parent'::uuid, 'parent', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000f'),
  null,
  'case 6: a parent with no students on file resolves to null, not an error'
);
select tests.clear_authentication();

select * from finish();
rollback;

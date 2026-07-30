begin;
select plan(21);

-- Fixture: Center Brampton -> Session Sunday AM -> Class Junior A.
select gen_random_uuid() as v_center \gset
select gen_random_uuid() as v_session \gset
select gen_random_uuid() as v_class \gset
insert into centers (id, name) values (:'v_center'::uuid, 'Brampton');
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
  values (:'v_session'::uuid, :'v_center'::uuid, 'Sunday AM', '2026-01-11', '2026-05-24', 0, '09:00', '10:30');
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

-- ============================================================
-- Adversarial cases (rls-adversarial-tester pass, 2026-07-15 /test run) -- minors' data
-- (children's first names) is at stake here, so these go beyond the happy-path cases 1-6
-- above: forged JWT claims, cross-family leakage, orphaned rows, anon access, and
-- injection-shaped data.
-- ============================================================

-- Fixture: two unrelated families A and B, each with one parent and one child.
select gen_random_uuid() as v_fam_a \gset
select gen_random_uuid() as v_fam_b \gset
insert into families (id, label) values (:'v_fam_a'::uuid, 'Family A'), (:'v_fam_b'::uuid, 'Family B');
insert into students (id, family_id, first_name, last_name, grade_level) values
  (gen_random_uuid(), :'v_fam_a'::uuid, 'Alice', 'A', 'Gr1'),
  (gen_random_uuid(), :'v_fam_b'::uuid, 'Bob', 'B', 'Gr2');

select tests.create_supabase_user('atk-parent-a@test.local') as v_parent_a \gset
select tests.create_supabase_user('atk-parent-b@test.local') as v_parent_b \gset
insert into family_members (family_id, user_id, relationship) values (:'v_fam_a'::uuid, :'v_parent_a'::uuid, 'guardian');
insert into family_members (family_id, user_id, relationship) values (:'v_fam_b'::uuid, :'v_parent_b'::uuid, 'guardian');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  (gen_random_uuid(), :'v_parent_a'::uuid, 'parent', 'org', null, true),
  (gen_random_uuid(), :'v_parent_b'::uuid, 'parent', 'org', null, true);

-- Case 7: parent A, normal auth -> only sees Alice, never Bob.
select tests.authenticate_as(:'v_parent_a'::uuid, 'parent', 'org', null);
select is(
  (select string_agg(scope_label, '|') from resolve_my_scope_labels()),
  'Alice',
  'case 7: parent A sees only own child Alice'
);
select tests.clear_authentication();

-- Case 8: parent A forges scope_type/scope_id claims (e.g. pretends scope_type='center' with
-- family B's id smuggled as scope_id) -- the function ignores scope claims entirely for
-- role='parent', so this must have zero effect; still only Alice.
select tests.authenticate_as(:'v_parent_a'::uuid, 'parent', 'center', :'v_fam_b'::uuid);
select is(
  (select string_agg(scope_label, '|') from resolve_my_scope_labels()),
  'Alice',
  'case 8: forged scope_type/scope_id claims on parent role do not change result'
);
select tests.clear_authentication();

-- Case 9: parent A authenticates as active_role='bv_coordinator' (a role they do NOT hold in
-- user_roles), hoping an org-wide bypass leaks into this RPC. The RPC has no dependency on
-- active_role at all (keyed on auth.uid()+ur.user_id), so the result must still be just A's
-- own row, resolved via family_members, not org-wide.
select tests.authenticate_as(:'v_parent_a'::uuid, 'bv_coordinator', 'org', null);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 1,
  'case 9: forging active_role=bv_coordinator does not grant extra rows (still just caller''s own user_roles row)'
);
select is(
  (select scope_label from resolve_my_scope_labels() limit 1),
  'Alice',
  'case 9: and that row still resolves via family_members, not org-wide, even under forged active_role'
);
select tests.clear_authentication();

-- Fixture: a third family C (unrelated), and a parent linked to BOTH families A and B.
select gen_random_uuid() as v_fam_c \gset
insert into families (id, label) values (:'v_fam_c'::uuid, 'Family C');
insert into students (id, family_id, first_name, last_name, grade_level) values
  (gen_random_uuid(), :'v_fam_c'::uuid, 'Zoe', 'Z', 'Gr4');

select tests.create_supabase_user('atk-parent-multi@test.local') as v_parent_multi \gset
insert into family_members (family_id, user_id, relationship) values
  (:'v_fam_a'::uuid, :'v_parent_multi'::uuid, 'guardian');
insert into family_members (family_id, user_id, relationship) values
  (:'v_fam_b'::uuid, :'v_parent_multi'::uuid, 'guardian');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  (gen_random_uuid(), :'v_parent_multi'::uuid, 'parent', 'org', null, true);

-- Case 10: a parent linked to two families sees the union of both, ordered alphabetically,
-- and never Zoe (family C, unrelated).
select tests.authenticate_as(:'v_parent_multi'::uuid, 'parent', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() limit 1),
  'Alice, Bob',
  'case 10: parent linked to two families sees union of both (Alice, Bob) alphabetically, never Zoe (family C)'
);
select tests.clear_authentication();

-- Fixture: an orphaned student row -- family_id with NO family_members row (data-integrity
-- edge case, not reachable through the app's own writes but worth covering defensively).
select gen_random_uuid() as v_fam_orphan \gset
insert into families (id, label) values (:'v_fam_orphan'::uuid, 'Orphan Family');
insert into students (id, family_id, first_name, last_name, grade_level) values
  (gen_random_uuid(), :'v_fam_orphan'::uuid, 'Orphan', 'Kid', 'Gr1');
-- deliberately NO family_members row linking anyone to v_fam_orphan

-- Case 11: an orphaned student (no family_members link) never leaks to an unrelated parent.
select tests.authenticate_as(:'v_parent_a'::uuid, 'parent', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() limit 1),
  'Alice',
  'case 11: orphaned student (no family_members link) never leaks to an unrelated parent'
);
select tests.clear_authentication();

-- Case 12: unauthenticated / anon role attempting a direct RPC call is denied at the grant
-- level (no execute grant to anon).
select set_config('request.jwt.claims', '', true);
select set_config('role', 'anon', true);
select throws_ok(
  $t$ select * from resolve_my_scope_labels() $t$,
  '42501',
  null,
  'case 12: anon role is denied execute on resolve_my_scope_labels() (no grant to anon)'
);
reset role;
select set_config('request.jwt.claims', '', true);

-- Case 13: authenticated as a genuinely different real user (not just claim-forged) --
-- confirm cross-user isolation end-to-end via authenticate_as with parent B's real uid.
select tests.authenticate_as(:'v_parent_b'::uuid, 'parent', 'org', null);
select is(
  (select string_agg(scope_label, '|') from resolve_my_scope_labels()),
  'Bob',
  'case 13: parent B, authenticated as themselves, sees only Bob -- never Alice/Zoe/Orphan'
);
select isnt(
  (select string_agg(scope_label, '|') from resolve_my_scope_labels()),
  'Alice',
  'case 13b: parent B result never equals parent A''s label'
);
select tests.clear_authentication();

-- Fixture: SQL-injection-shaped first_name (seed allows arbitrary text; students.first_name
-- has no format constraint).
select gen_random_uuid() as v_fam_inj \gset
insert into families (id, label) values (:'v_fam_inj'::uuid, 'Injection Family');
insert into students (id, family_id, first_name, last_name, grade_level) values
  (gen_random_uuid(), :'v_fam_inj'::uuid, $q$Rob'; DROP TABLE students; --$q$, 'X', 'Gr1');
select tests.create_supabase_user('atk-parent-inj@test.local') as v_parent_inj \gset
insert into family_members (family_id, user_id, relationship) values (:'v_fam_inj'::uuid, :'v_parent_inj'::uuid, 'guardian');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  (gen_random_uuid(), :'v_parent_inj'::uuid, 'parent', 'org', null, true);

-- Case 14: SQL-injection-shaped first_name is returned inertly as data, not executed, and the
-- students table survives the round-trip intact.
select tests.authenticate_as(:'v_parent_inj'::uuid, 'parent', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() limit 1),
  $q$Rob'; DROP TABLE students; --$q$,
  'case 14: SQL-injection-shaped first_name is returned inertly as data, not executed'
);
select tests.clear_authentication();
select ok(
  (select count(*) from students) > 5,
  'case 14b: students table intact after injection-shaped data round-trip (no injection occurred)'
);

select * from finish();
rollback;

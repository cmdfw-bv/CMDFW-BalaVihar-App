begin;
select plan(32);

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

-- ============================================================
-- Student scope label (issue #76). A student is org-scoped with a null scope_id (seed.sql,
-- matching the production role-sweep -- see #61/#67), so like the parent case its label cannot
-- come from scope_type/scope_id. Per ADR-0014 §4 a single-role student's chip should read
-- Center · Session · Grade/Class, resolved from the student's ACTIVE enrollment
-- (students.user_id -> enrollments -> classes -> sessions -> centers) -- the same shape a
-- teacher of that class gets (case 1), achieved without a class scope_id.
-- ============================================================
select gen_random_uuid() as v_student_family \gset
insert into families (id, label) values (:'v_student_family'::uuid, 'Student Family');
select tests.create_supabase_user('scope-labels-student@test.local') as v_student_user \gset
select gen_random_uuid() as v_student \gset
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  (:'v_student'::uuid, :'v_student_family'::uuid, 'Isha', 'S', 'Gr3', :'v_student_user'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  (:'v_student'::uuid, :'v_class'::uuid, :'v_session'::uuid, 'active');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-000000000010', :'v_student_user'::uuid, 'student', 'org', null, true);

-- Case 15: student (org scope, no scope_id) resolves to Center · Session · Class via their
-- active enrollment. RED until resolve_my_scope_labels() gains a student branch (today an
-- org-scoped non-parent role hits `else null`).
select tests.authenticate_as(:'v_student_user'::uuid, 'student', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-000000000010'),
  'Brampton · Sunday AM · Junior A',
  'case 15: student (org scope) resolves to Center · Session · Class via active enrollment'
);
select tests.clear_authentication();

-- Fixture: a student with NO current active enrollment (only a withdrawn one). NOTE: this state --
-- a student who can still reach the app despite not being currently registered -- is itself an
-- access-lifecycle gap (WHO may log in at all), tracked for a future ADR / #58, NOT something #77
-- fixes. The case below only pins the DB behaviour of the `status = 'active'` filter (null, never a
-- class they've left); it does NOT assert the resulting chip is acceptable UX.
select gen_random_uuid() as v_wd_family \gset
insert into families (id, label) values (:'v_wd_family'::uuid, 'Withdrawn Family');
select tests.create_supabase_user('scope-labels-student-wd@test.local') as v_wd_user \gset
select gen_random_uuid() as v_wd_student \gset
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  (:'v_wd_student'::uuid, :'v_wd_family'::uuid, 'Dev', 'S', 'Gr3', :'v_wd_user'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  (:'v_wd_student'::uuid, :'v_class'::uuid, :'v_session'::uuid, 'withdrawn');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-000000000011', :'v_wd_user'::uuid, 'student', 'org', null, true);

-- Case 16: the `status = 'active'` filter -- a student whose only enrollment is withdrawn resolves
-- to null, never the class they left. The count(*) = 1 companion proves the null is the label of a
-- real row, not a missing row. Documents current DB behaviour only; NOT a claim the resulting chip
-- is acceptable -- who may log in at all is the access-lifecycle ADR / #58.
select tests.authenticate_as(:'v_wd_user'::uuid, 'student', 'org', null);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 1,
  'case 16: the withdrawn student still has exactly one role row (so the null below is a real label)'
);
select is(
  (select count(*) from resolve_my_scope_labels()
    where user_roles_id = '90000003-0000-0000-0000-000000000011')::int, 1,
  'case 16: ...and the specific row under test exists (so the null is its label, not a wrong/missing id)'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-000000000011'),
  null,
  'case 16: ...and its label is null (active-only filter), never the class they left'
);
select tests.clear_authentication();

-- Fixture: a second REAL student B, enrolled in a DIFFERENT class (Senior B) and -- deliberately --
-- in the SAME family as student A. B is authenticated as in case 19 (the cross-identity proof) and
-- is also the decoy class for the forged-claim cases 17-18.
select tests.create_supabase_user('scope-labels-student-b@test.local') as v_student_b_user \gset
select gen_random_uuid() as v_student_b \gset
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  (:'v_student_b'::uuid, :'v_student_family'::uuid, 'Rohan', 'S', 'Gr9', :'v_student_b_user'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  (:'v_student_b'::uuid, :'v_other_class'::uuid, :'v_session'::uuid, 'active');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-000000000012', :'v_student_b_user'::uuid, 'student', 'org', null, true);

-- Case 17: student A forging active_role='bv_coordinator' (org-wide bypass attempt) still
-- resolves exactly their own one row, labelled via their own enrollment -- never student B's
-- class, never org-wide. Mirrors case 9 for the student branch (the RPC is keyed on auth.uid(),
-- not the JWT's active_role claim).
select tests.authenticate_as(:'v_student_user'::uuid, 'bv_coordinator', 'org', null);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 1,
  'case 17: student forging active_role=bv_coordinator still gets only their own one row'
);
select is(
  (select scope_label from resolve_my_scope_labels() limit 1),
  'Brampton · Sunday AM · Junior A',
  'case 17: and it resolves via their own enrollment (never student B''s Senior B, never org-wide)'
);
select tests.clear_authentication();

-- Case 18: student A forging scope_type='class' + scope_id = another class (Senior B) cannot
-- force a different CASE branch or leak that class -- the student branch keys on
-- st.user_id = auth.uid() and ignores scope_type/scope_id entirely, so forged scope claims are
-- structurally inert. (rls-adversarial-tester supplemental case, 2026-08-17.)
select tests.authenticate_as(:'v_student_user'::uuid, 'student', 'class', :'v_other_class'::uuid);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 1,
  'case 18: forged scope_type/scope_id does not widen the row set -- still the caller''s own one row'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-000000000010'),
  'Brampton · Sunday AM · Junior A',
  'case 18: forged scope_type/scope_id claims are inert for the student branch (own class, never the smuggled one)'
);
select tests.clear_authentication();

-- Case 19: the cross-identity proof -- authenticate as student B (a DIFFERENT real user, in the
-- SAME family as A, whose class sorts AFTER A's) and assert B sees B's OWN class. This is the load-
-- bearing isolation test (the student analogue of case 13). The mutation it UNIQUELY catches is
-- same-family sibling resolution -- resolving via the caller's family rather than their own user_id
-- (a plausible refactor toward the sibling parent branch): 29/30 pass, only this fails. (The literal
-- family_members swap and a dropped caller predicate die more trivially -- case 15 catches those,
-- since family_members holds parent users, not students. Confirmed by mutation testing, #77 review.)
select tests.authenticate_as(:'v_student_b_user'::uuid, 'student', 'org', null);
select is(
  (select count(*) from resolve_my_scope_labels())::int, 1,
  'case 19: student B sees exactly their own one row'
);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-000000000012'),
  'Brampton · Sunday AM · Senior B',
  'case 19: and it is B''s own class, never student A''s Junior A (kills same-family sibling resolution -- the one mutation that survives cases 15-18)'
);
select tests.clear_authentication();

-- Fixture: a RETURNING student C with TWO active enrollments -- last year's session (Sunday AM,
-- Jan) and this year's (Fall Term, Sep, a later start_date). enrollments_one_active_per_session
-- only constrains WITHIN a session, so this is schema-legal and reachable in year two of production
-- (the reset that would retire last year's row is deferred to #58). This is the ONLY fixture that
-- exercises the migration's `order by se.start_date desc ... limit 1` -- without it, deleting that
-- clause leaves every other case green (Maulik/Srinath #77 review).
select gen_random_uuid() as v_new_session \gset
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
  values (:'v_new_session'::uuid, :'v_center'::uuid, 'Fall Term', '2026-09-06', '2026-12-13', 0, '09:00', '10:30');
select gen_random_uuid() as v_new_class \gset
insert into classes (id, session_id, name, grade_band)
  values (:'v_new_class'::uuid, :'v_new_session'::uuid, 'Gr4 Class', 'Gr4');
select tests.create_supabase_user('scope-labels-student-returning@test.local') as v_ret_user \gset
select gen_random_uuid() as v_ret_student \gset
insert into students (id, family_id, first_name, last_name, grade_level, user_id) values
  (:'v_ret_student'::uuid, :'v_student_family'::uuid, 'Meera', 'S', 'Gr4', :'v_ret_user'::uuid);
insert into enrollments (student_id, class_id, session_id, status) values
  (:'v_ret_student'::uuid, :'v_class'::uuid, :'v_session'::uuid, 'active'),          -- last year: Sunday AM (Jan)
  (:'v_ret_student'::uuid, :'v_new_class'::uuid, :'v_new_session'::uuid, 'active');  -- this year: Fall Term (Sep)
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-000000000013', :'v_ret_user'::uuid, 'student', 'org', null, true);

-- Case 20: a returning student with two active enrollments resolves to the NEWEST session's class
-- (this year's), not last year's. Proves `order by se.start_date desc`: deleting the clause (or the
-- `desc`) makes this the assertion that fails, since the older Sunday AM row is inserted first.
select tests.authenticate_as(:'v_ret_user'::uuid, 'student', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-000000000013'),
  'Brampton · Fall Term · Gr4 Class',
  'case 20: returning student (two active enrollments) resolves to the newest session (order by start_date desc)'
);
select tests.clear_authentication();

select * from finish();
rollback;

-- supabase/seed/seed.sql
-- Per-environment ACCOUNT LAYER for LOCAL dev (#19). Runs AFTER domain.sql (config.toml order:
-- 00_test_fixtures.sql -> domain.sql -> seed.sql). domain.sql created the account-free structure
-- (centers/sessions/classes/families/students/enrollments); this file adds the accounts (via
-- tests.create_supabase_user -- LOCAL ONLY) and every row that references auth.users:
-- user_roles, family_members, students.user_id, attendance, class_updates, consents.
--
-- In the CLOUD, #65 performs this same layer via the Auth Admin API instead of tests.* — that
-- split is the governing decision: ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts.
-- Entirely synthetic; no real member data, ever.
do $$
declare
  v_f3 uuid;
  v_class record;
  v_student record;
  v_family record;
  v_teacher_user_id uuid;
  v_student_user_id uuid;
  v_parent_user_id uuid;
  v_coordinator_user_id uuid;
  v_bv_admin_user_id uuid;
  v_multirole_user_id uuid;
  v_first_class_id uuid;
  v_teacher_by_class jsonb := '{}'::jsonb;   -- class_id::text -> teacher user_id::text
  d date;
  i int := 0;
  v_fam_i int := 0;
begin
  select id into v_f3 from sessions where name = 'F3';
  -- One legible error if the account-free structure wasn't loaded first (config.toml order:
  -- 00_test_fixtures -> domain.sql -> seed.sql). Matches supabase/tests/0000_..precheck's pattern.
  if v_f3 is null then
    raise exception 'seed.sql requires domain.sql to have run first (no F3 session found)';
  end if;

  -- One teacher per F3 class (all 6 rows, incl. the empty 10-12 — a class still has a teacher).
  -- Order the empty 10-12 class LAST so teacher1@ and v_first_class_id (the multirole account's
  -- teacher class) land on a POPULATED class — not the empty one (a silent demo regression).
  for v_class in
    select id, grade_band from classes where session_id = v_f3
     order by (grade_band = '10, 11, 12'), grade_band
  loop
    i := i + 1;
    v_teacher_user_id := tests.create_supabase_user('teacher' || i || '@bv-seed.test.local');
    insert into user_roles (user_id, role, scope_type, scope_id)
      values (v_teacher_user_id, 'teacher', 'class', v_class.id);
    v_teacher_by_class := v_teacher_by_class || jsonb_build_object(v_class.id::text, v_teacher_user_id::text);
    if v_first_class_id is null then v_first_class_id := v_class.id; end if;
  end loop;

  -- Guardians: 1 per family, a 2nd for the first 6 (multi-guardian households, ADR-0018).
  for v_family in select id from families order by label loop
    v_fam_i := v_fam_i + 1;
    v_parent_user_id := tests.create_supabase_user('parent' || v_fam_i || 'a@bv-seed.test.local');
    insert into family_members (family_id, user_id, relationship) values (v_family.id, v_parent_user_id, 'guardian');
    insert into user_roles (user_id, role, scope_type, scope_id) values (v_parent_user_id, 'parent', 'org', null);
    if v_fam_i <= 6 then
      declare v_parent_b uuid := tests.create_supabase_user('parent' || v_fam_i || 'b@bv-seed.test.local');
      begin
        insert into family_members (family_id, user_id, relationship) values (v_family.id, v_parent_b, 'guardian');
        insert into user_roles (user_id, role, scope_type, scope_id) values (v_parent_b, 'parent', 'org', null);
      end;
    end if;
  end loop;

  -- Student logins -- PILOT EXCEPTION (#19): every student in the F3 "7, 8, 9" class gets a login,
  -- not just grade 9 (the general Gr9+ rule; 10-12 is empty this year). Self-scope = org/null,
  -- resolved via students.user_id (ROLE_SCOPE_TYPE.student), mirroring the prod auto-sweep.
  i := 0;
  for v_student in
    select st.id from students st
      join enrollments e on e.student_id = st.id
      join classes c on c.id = e.class_id
     where c.session_id = v_f3 and c.grade_band = '7, 8, 9'
     -- deterministic order so studentN@ ↔ student is stable across reseeds (UAT-11/12/13 depend on it)
     order by st.grade_level, st.first_name
  loop
    i := i + 1;
    v_student_user_id := tests.create_supabase_user('student' || i || '@bv-seed.test.local');
    update students set user_id = v_student_user_id where id = v_student.id;
    insert into user_roles (user_id, role, scope_type, scope_id) values (v_student_user_id, 'student', 'org', null);
  end loop;

  -- Attendance + class_updates for each running class's last 4 completed scheduled meetings, with
  -- a deliberate compliant / non-compliant mix for the compliance-dashboard demo (every class is
  -- 0% or 100% on each metric, so no "at-risk/partial" 70-85% band here + the empty 10-12 is
  -- unclassified; a richer at-risk case for the demo is #65's cloud-seed activity, not this local seed)
  -- (derived from class_meetings, not a hardcoded calendar). Non-compliance is chosen by EXPLICIT
  -- class label, not an incidental sort position, so the pilot '7, 8, 9' class (the only one with
  -- student logins) stays FULLY compliant and its students see a populated feed:
  --   * '3, 4'  -> no attendance    (non-compliant on attendance)
  --   * 'PreK'  -> no class_updates (non-compliant on updates)
  --   * every other running class (incl. '7, 8, 9') -> fully compliant
  for v_class in
    select c.id, c.grade_band from classes c
     where c.session_id = v_f3 and c.grade_band <> '10, 11, 12'
     order by c.grade_band
  loop
    v_teacher_user_id := (v_teacher_by_class ->> v_class.id::text)::uuid;
    for d in
      select meeting_date from class_meetings
       where class_id = v_class.id and status = 'scheduled' and meeting_date < current_date
       order by meeting_date desc limit 4
    loop
      if v_class.grade_band <> '3, 4' then
        insert into attendance (enrollment_id, class_meeting_date, status, marked_by)
        select e.id, d,
               case when extract(day from d)::int % 5 = 0 then 'absent' else 'present' end,
               v_teacher_user_id
          from enrollments e where e.class_id = v_class.id;
      end if;
      if v_class.grade_band <> 'PreK' then
        insert into class_updates (class_id, meeting_date, posted_by, body)
        values (v_class.id, d, v_teacher_user_id, 'Synthetic seed update for ' || to_char(d, 'Mon FMDD') || '.');
      end if;
    end loop;
  end loop;

  -- Consents -- per student: participation always granted, media varied. granted_by = a guardian
  -- of the student's family (every family has one, created above).
  insert into consents (student_id, consent_type, granted, granted_by)
  select st.id, 'participation', true,
         (select fm.user_id from family_members fm where fm.family_id = st.family_id order by fm.created_at limit 1)
    from students st;
  insert into consents (student_id, consent_type, granted, granted_by)
  select st.id, 'media',
         (('x' || substr(md5(st.id::text), 1, 8))::bit(32)::bigint % 4) <> 0,
         (select fm.user_id from family_members fm where fm.family_id = st.family_id order by fm.created_at limit 1)
    from students st;

  -- Session-scoped Coordinator + org-scoped BV Coordinator / Admin.
  v_coordinator_user_id := tests.create_supabase_user('coordinator1@bv-seed.test.local');
  insert into user_roles (user_id, role, scope_type, scope_id) values (v_coordinator_user_id, 'coordinator', 'session', v_f3);

  v_bv_admin_user_id := tests.create_supabase_user('bvcoordinator1@bv-seed.test.local');
  insert into user_roles (user_id, role, scope_type, scope_id) values (v_bv_admin_user_id, 'bv_coordinator', 'org', null);

  insert into user_roles (user_id, role, scope_type, scope_id)
    values (tests.create_supabase_user('admin1@bv-seed.test.local'), 'admin', 'org', null);

  -- Thinnest-slice multi-role coverage: one account holding Parent+Teacher+Coordinator+BV Coordinator.
  v_multirole_user_id := tests.create_supabase_user('multirole@bv-seed.test.local');
  -- Attach to a family that actually HAS a student, so the role-switcher's parent scope resolves to
  -- real children (pins 090_multi_role_isolation to a stable property, not the incidental fam #1).
  insert into family_members (family_id, user_id, relationship)
    values ((select f.id from families f join students s on s.family_id = f.id
             order by f.label limit 1), v_multirole_user_id, 'guardian');
  insert into user_roles (user_id, role, scope_type, scope_id) values
    (v_multirole_user_id, 'parent', 'org', null) on conflict do nothing;
  insert into user_roles (user_id, role, scope_type, scope_id) values
    (v_multirole_user_id, 'teacher', 'class', v_first_class_id),
    (v_multirole_user_id, 'coordinator', 'session', v_f3),
    (v_multirole_user_id, 'bv_coordinator', 'org', null);
end $$;

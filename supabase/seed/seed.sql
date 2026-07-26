-- Entirely synthetic POC seed data (doc 2 §6 item 2). No real program-member data, ever.
-- Shaped after the actual pilot: one center (Frisco), one session (F3), covering the
-- full Shishu Vihaar (Kindergarten) through Gr12 grade range as 13 individual classes
-- (not the coarse grade-bands used by earlier drafts of this seed).
do $$
declare
  v_center_id uuid := gen_random_uuid();
  v_session uuid := gen_random_uuid();
  v_class_ids uuid[] := array[]::uuid[];
  v_class_id uuid;
  v_family_id uuid;
  v_student_id uuid;
  v_parent_user_id uuid;
  v_teacher_user_id uuid;
  v_coordinator_user_id uuid;
  v_bv_admin_user_id uuid;
  v_multirole_user_id uuid;
  grade_bands text[] := array[
    'Shishu Vihaar','Gr1','Gr2','Gr3','Gr4','Gr5','Gr6',
    'Gr7','Gr8','Gr9','Gr10','Gr11','Gr12'
  ];
  v_grade_count int := 13;
  i int;
  j int;
  d date;
begin
  insert into centers (id, name) values (v_center_id, 'Frisco');
  -- ADR-0031: Frisco F3 is the confirmed pilot session, Sundays 2:00-3:30PM (day_of_week 0=Sunday).
  insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
    (v_session, v_center_id, 'F3', '2026-01-11', '2026-05-24', 0, '14:00', '15:30');

  -- 13 classes spanning Shishu Vihaar (KG) through Gr12, all within the single F3 session.
  for i in 1..v_grade_count loop
    v_class_id := gen_random_uuid();
    v_class_ids := array_append(v_class_ids, v_class_id);
    insert into classes (id, session_id, name, grade_band)
    values (v_class_id, v_session, grade_bands[i] || ' Class', grade_bands[i]);

    v_teacher_user_id := tests.create_supabase_user('teacher' || i || '@bv-seed.test.local');
    insert into user_roles (user_id, role, scope_type, scope_id)
      values (v_teacher_user_id, 'teacher', 'class', v_class_id);
  end loop;

  -- ~20 families, some multi-guardian / multi-child (ADR-0018), ~35 students across the 13 classes.
  for i in 1..20 loop
    v_family_id := gen_random_uuid();
    insert into families (id, label) values (v_family_id, 'Seed Family ' || i);

    v_parent_user_id := tests.create_supabase_user('parent' || i || 'a@bv-seed.test.local');
    insert into family_members (family_id, user_id, relationship) values (v_family_id, v_parent_user_id, 'guardian');
    insert into user_roles (user_id, role, scope_type, scope_id) values (v_parent_user_id, 'parent', 'org', null);

    if i <= 6 then
      -- multi-guardian household
      declare
        v_parent_b_user_id uuid := tests.create_supabase_user('parent' || i || 'b@bv-seed.test.local');
      begin
        insert into family_members (family_id, user_id, relationship) values (v_family_id, v_parent_b_user_id, 'guardian');
        insert into user_roles (user_id, role, scope_type, scope_id) values (v_parent_b_user_id, 'parent', 'org', null);
      end;
    end if;

    -- 1 or 2 students per family (multi-child for the first 10 families).
    for j in 1..(case when i <= 10 then 2 else 1 end) loop
      v_class_id := v_class_ids[1 + ((i + j) % v_grade_count)];
      v_student_id := gen_random_uuid();
      insert into students (id, family_id, first_name, last_name, grade_level, user_id)
      values (
        v_student_id, v_family_id, 'Student' || i || '_' || j, 'Seed',
        (select grade_band from classes where id = v_class_id),
        -- Only Gr9-Gr12 students get a login (students.user_id) -- KG/Shishu Vihaar
        -- through Gr8 have no login and can't be chat participants (§7 note).
        case when (select grade_band from classes where id = v_class_id) in ('Gr9','Gr10','Gr11','Gr12')
          then tests.create_supabase_user('student' || i || '_' || j || '@bv-seed.test.local')
          else null
        end
      );

      insert into enrollments (student_id, class_id, session_id, status)
      values (v_student_id, v_class_id, (select session_id from classes where id = v_class_id), 'active');

      -- 4 weeks of Tuesday attendance, mixed present/absent.
      for d in select generate_series('2026-01-13'::date, '2026-02-03'::date, '7 days')::date loop
        insert into attendance (enrollment_id, class_meeting_date, status, marked_by)
        select e.id, d, case when (i + j) % 5 = 0 then 'absent' else 'present' end,
               (select user_id from user_roles where scope_type = 'class' and scope_id = v_class_id and role = 'teacher' limit 1)
        from enrollments e where e.student_id = v_student_id and e.class_id = v_class_id;
      end loop;

      insert into consents (student_id, consent_type, granted, granted_by) values
        (v_student_id, 'participation', true, v_parent_user_id),
        (v_student_id, 'media', (i % 4 <> 0), v_parent_user_id);
    end loop;
  end loop;

  -- Session-scoped Coordinator + org-scoped BV Coordinator/Admin.
  v_coordinator_user_id := tests.create_supabase_user('coordinator1@bv-seed.test.local');
  insert into user_roles (user_id, role, scope_type, scope_id) values (v_coordinator_user_id, 'coordinator', 'session', v_session);

  v_bv_admin_user_id := tests.create_supabase_user('bvcoordinator1@bv-seed.test.local');
  insert into user_roles (user_id, role, scope_type, scope_id) values (v_bv_admin_user_id, 'bv_coordinator', 'org', null);

  insert into user_roles (user_id, role, scope_type, scope_id)
    values (tests.create_supabase_user('admin1@bv-seed.test.local'), 'admin', 'org', null);

  -- Thinnest-slice multi-role coverage: one real account holding Parent+Teacher+Coordinator+BV Coordinator (doc 2 §5).
  v_multirole_user_id := tests.create_supabase_user('multirole@bv-seed.test.local');
  insert into family_members (family_id, user_id, relationship)
    values ((select id from families order by id limit 1), v_multirole_user_id, 'guardian');
  insert into user_roles (user_id, role, scope_type, scope_id) values
    (v_multirole_user_id, 'parent', 'org', null) -- parent has no scope_id concept; stored as org/null, resolved via family_members at read time
    on conflict do nothing;
  insert into user_roles (user_id, role, scope_type, scope_id) values
    (v_multirole_user_id, 'teacher', 'class', v_class_ids[1]),
    (v_multirole_user_id, 'coordinator', 'session', v_session),
    (v_multirole_user_id, 'bv_coordinator', 'org', null);

  -- ADR-0031 / doc 1 §9a: the real center/session catalog beyond the pilot slice
  -- (Frisco F3 above). Names + schedule shape only (real business data, not PII;
  -- doc 1 §9a) — no classes/families/students here, since only Frisco F3 is the
  -- POC pilot target (doc 1 §4/§9) and gets full population.
  declare
    v_saaket_id uuid := gen_random_uuid();
    v_chitrakoot_id uuid := gen_random_uuid();
  begin
    insert into centers (id, name) values
      (v_saaket_id, 'Saaket'),
      (v_chitrakoot_id, 'Chitrakoot');

    insert into sessions (center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
      (v_saaket_id, 'S4', '2026-01-11', '2026-05-24', 5, '18:45', '20:15'),
      (v_saaket_id, 'S1', '2026-01-11', '2026-05-24', 0, '09:00', '10:30'),
      (v_saaket_id, 'S2', '2026-01-11', '2026-05-24', 0, '12:00', '13:30'),
      (v_center_id, 'F1', '2026-01-11', '2026-05-24', 0, '09:00', '10:30'),
      (v_center_id, 'F2', '2026-01-11', '2026-05-24', 0, '12:00', '13:30'),
      (v_chitrakoot_id, 'C1', '2026-01-11', '2026-05-24', 0, '09:00', '10:30'),
      (v_chitrakoot_id, 'C2', '2026-01-11', '2026-05-24', 0, '12:00', '13:30');
  end;
end $$;

-- supabase/seed/domain.sql
-- Shared, account-free synthetic dataset (#19 pilot-seed-data). Loaded identically by local
-- `db reset` (config.toml) and #65's cloud loader. Contains ONLY rows that reference no
-- auth.users: centers, sessions, classes, families, students (user_id null), enrollments.
--
-- Accounts + every account-linked row (user_roles, family_members, students.user_id,
-- attendance, class_updates, consents) are layered on per-environment AFTER this file — locally
-- by seed.sql via tests.*, in the cloud by #65 via the Auth Admin API. That split is the
-- governing decision: ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts (Option A).
-- Rule for this file: NO tests.* calls, and NO row referencing auth.users.
--
-- Shape = the real F3 2026-27 attendance sheet: 6 class rows — 5 running (PreK-9) + a
-- deliberately EMPTY 10-12 row. ~33 students, ~3 per grade level (PreK, KG, 1-9). Grade tokens
-- are the real ones (PreK, KG, 1-12); this diverges from csv-parse.ts's VALID_GRADE_BANDS
-- (Shishu Vihaar + Gr1-Gr12, no KG) — reconciling the app vocabulary is #93, out of scope here.
do $$
declare
  v_frisco     uuid := gen_random_uuid();
  v_saaket     uuid := gen_random_uuid();
  v_chitrakoot uuid := gen_random_uuid();
  v_f3         uuid := gen_random_uuid();
  -- the 6 F3 classes
  v_prek       uuid := gen_random_uuid();
  v_kg12       uuid := gen_random_uuid();
  v_c34        uuid := gen_random_uuid();
  v_c56        uuid := gen_random_uuid();
  v_c789       uuid := gen_random_uuid();
  v_c101112    uuid := gen_random_uuid();
  v_fam_ids    uuid[] := array[]::uuid[];
  v_family_id  uuid;
  v_student_id uuid;
  -- grade levels that get students (PreK-9), parallel to v_grade_class below; 10-12 stays empty.
  v_grades      text[] := array['PreK','KG','1','2','3','4','5','6','7','8','9'];
  v_grade_class uuid[];
  v_fam_idx    int := 0;
  i int; j int; k int;
begin
  -- Centers (Frisco is the fully-populated pilot center; the others exist as catalog only).
  insert into centers (id, name) values
    (v_frisco, 'Frisco'), (v_saaket, 'Saaket'), (v_chitrakoot, 'Chitrakoot');

  -- F3 session — ADR-0031: Sundays 2:00-3:30 PM (day_of_week 0), Jan-May 2026.
  insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
    values (v_f3, v_frisco, 'F3', '2026-01-11', '2026-05-24', 0, '14:00', '15:30');

  -- The 6 F3 classes — names mirror the attendance sheet; grade_band = the combined label.
  -- Inserting each fires ADR-0038's classes_generate_class_meetings trigger (account-free).
  insert into classes (id, session_id, name, grade_band) values
    (v_prek,    v_f3, 'F3 Pre-K',              'PreK'),
    (v_kg12,    v_f3, 'F3 KG, 1st & 2nd',      'KG, 1, 2'),
    (v_c34,     v_f3, 'F3 3rd & 4th',          '3, 4'),
    (v_c56,     v_f3, 'F3 5th & 6th',          '5, 6'),
    (v_c789,    v_f3, 'F3 7th, 8th & 9th',     '7, 8, 9'),
    (v_c101112, v_f3, 'F3 10th, 11th & 12th',  '10, 11, 12');

  -- ~20 families (guardians + student logins are added per-environment, not here).
  for i in 1..20 loop
    v_family_id := gen_random_uuid();
    v_fam_ids := array_append(v_fam_ids, v_family_id);
    insert into families (id, label) values (v_family_id, 'Seed Family ' || i);
  end loop;

  -- grade -> running-class map (parallel to v_grades). The 10-12 class gets NO students.
  v_grade_class := array[
    v_prek,                       -- PreK
    v_kg12, v_kg12, v_kg12,       -- KG, 1, 2
    v_c34, v_c34,                 -- 3, 4
    v_c56, v_c56,                 -- 5, 6
    v_c789, v_c789, v_c789        -- 7, 8, 9
  ];

  -- ~3 students per grade (PreK-9); each enrolled in its class; families round-robin.
  for k in 1..array_length(v_grades, 1) loop
    for j in 1..3 loop
      v_student_id := gen_random_uuid();
      v_fam_idx := v_fam_idx + 1;
      v_family_id := v_fam_ids[1 + (v_fam_idx % 20)];
      insert into students (id, family_id, first_name, last_name, grade_level, user_id)
        values (v_student_id, v_family_id, 'Student ' || v_grades[k] || '-' || j, 'Seed', v_grades[k], null);
      -- enrolled_at pinned to the session start (well before any class_meeting) so the compliance
      -- window always has data to render, regardless of when the seed runs (matches old seed).
      insert into enrollments (student_id, class_id, session_id, status, enrolled_at)
        values (v_student_id, v_grade_class[k], v_f3, 'active', '2026-01-11');
    end loop;
  end loop;

  -- Real center/session catalog beyond the pilot slice — names + schedule only, no
  -- classes/families/students (doc 1 §9a: real business data, not PII). Only F3 is populated.
  insert into sessions (center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
    (v_frisco,     'F1', '2026-01-11', '2026-05-24', 0, '09:00', '10:30'),
    (v_frisco,     'F2', '2026-01-11', '2026-05-24', 0, '12:00', '13:30'),
    (v_saaket,     'S1', '2026-01-11', '2026-05-24', 0, '09:00', '10:30'),
    (v_saaket,     'S2', '2026-01-11', '2026-05-24', 0, '12:00', '13:30'),
    (v_saaket,     'S4', '2026-01-11', '2026-05-24', 5, '18:45', '20:15'),
    (v_chitrakoot, 'C1', '2026-01-11', '2026-05-24', 0, '09:00', '10:30'),
    (v_chitrakoot, 'C2', '2026-01-11', '2026-05-24', 0, '12:00', '13:30');
end $$;

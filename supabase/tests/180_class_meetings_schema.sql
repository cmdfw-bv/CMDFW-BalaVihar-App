begin;
select plan(11);

insert into centers (id, name) values ('c6000000-0000-0000-0000-000000000001', 'Meetings-Schema Center');
-- ADR-0036: session weekday comes from ADR-0031's day_of_week (0=Sunday), not a second column.
insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time) values
  ('a6000000-0000-0000-0000-000000000001', 'c6000000-0000-0000-0000-000000000001', 'Meetings-Schema Session-A', '2026-01-04', '2026-01-25', 0, '09:00', '10:30'),
  ('a6000000-0000-0000-0000-000000000002', 'c6000000-0000-0000-0000-000000000001', 'Meetings-Schema Session-B', '2026-01-04', '2026-01-25', 0, '09:00', '10:30');
insert into classes (id, session_id, name, grade_band) values
  ('cc600000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'Meetings Class A', 'Gr3'),
  ('cc600000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000002', 'Meetings Class B (sibling session)', 'Gr3');

-- ADR-0036: the session-weekday NOT NULL assertion that lived here was dropped — it covered the
-- superseded `meeting_weekday`, and `day_of_week`'s NOT NULL is already proven by ADR-0031's own
-- 160_session_weekly_schedule.sql (col_not_null). Duplicating it here would assert nothing new.

select tests.create_supabase_user('meetings-coordinator@test.local') as v_coordinator \gset
select tests.create_supabase_user('meetings-coordinator-sibling@test.local') as v_coordinator_sibling \gset
select tests.create_supabase_user('meetings-teacher@test.local') as v_teacher \gset

-- Denied: teacher is not an authorized role for generation.
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'cc600000-0000-0000-0000-000000000001'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int, 0,
  'teacher cannot generate class_meetings (denied, no rows written)');
select is(
  (select count(*) from audit_log where actor_role = 'teacher' and action = 'denied' and target_table = 'sessions' and target_id = 'a6000000-0000-0000-0000-000000000001')::int, 1,
  'teacher''s denied generate call writes one audit_log row');

-- Denied: coordinator scoped to a sibling session cannot generate for Session-A.
select tests.authenticate_as(:'v_coordinator_sibling'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000002'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int, 0,
  'sibling-session coordinator cannot generate for Session-A (still zero rows)');

-- Positive: in-scope coordinator generates the full weekly series (4 Sundays: Jan4/11/18/25).
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000001'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int, 4,
  'generate_class_meetings_for_session creates one row per Sunday in the session window');
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000002')::int, 0,
  'sibling session''s class is untouched by Session-A''s generation call');
select is(
  (select count(*) from audit_log where actor_role = 'coordinator' and action = 'read')::int, 0,
  'a successful generate call writes no audit_log row (organizational metadata, not a minor''s record)');

-- Cancel one date (simulating the CSV skip-dates seam), then re-run: idempotent, cancelled row stays cancelled.
update class_meetings set status = 'cancelled' where class_id = 'cc600000-0000-0000-0000-000000000001' and meeting_date = '2026-01-18';
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000001'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int, 4,
  'idempotent re-run creates no duplicate rows');
select is(
  (select status from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001' and meeting_date = '2026-01-18'),
  'cancelled',
  'idempotent re-run does not reset an already-cancelled row back to scheduled');

-- Add a same-session sibling class (A2) and generate its calendar *before* checking the
-- teacher's RLS scope, so "teacher sees only their own class's rows" actually proves exclusion
-- (4-of-8) rather than coincidentally matching "teacher sees the whole table" (which it would if
-- class 1 were still the only class in class_meetings with any rows).
insert into classes (id, session_id, name, grade_band) values ('cc600000-0000-0000-0000-000000000003', 'a6000000-0000-0000-0000-000000000001', 'Meetings Class A2', 'Gr4');
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000001'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();

-- class_meetings RLS: teacher sees only their own class's rows, excluded from A2's in the same session.
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'cc600000-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from class_meetings)::int, 4, 'teacher sees only their own class''s 4-of-8 rows (A2''s rows in the same session are excluded)');
select tests.clear_authentication();

-- class_meetings RLS: coordinator sees every class in their own session, not the sibling session's.
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from class_meetings)::int, 8, 'coordinator sees all classes'' rows in their own session, none from the sibling session');
select tests.clear_authentication();

-- class_updates: zero policies for any role — direct select always returns zero rows, even for the org roles.
select tests.create_supabase_user('meetings-bvcoordinator@test.local') as v_bv \gset
insert into class_updates (class_id, meeting_date, posted_by) values ('cc600000-0000-0000-0000-000000000001', '2026-01-11', :'v_teacher'::uuid);
select tests.authenticate_as(:'v_bv'::uuid, 'bv_coordinator', 'org', null);
select is((select count(*) from class_updates)::int, 0, 'class_updates has zero read policies — even org-scope roles get zero rows direct-select');
select tests.clear_authentication();

select * from finish();
rollback;

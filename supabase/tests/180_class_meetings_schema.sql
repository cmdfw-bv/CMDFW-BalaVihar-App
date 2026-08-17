begin;
select plan(19);

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

-- NOTE (PR #50 review): classes now get their calendar from the classes_generate_class_meetings
-- trigger at insert time, so "no rows exist" is no longer a meaningful proxy for "the RPC refused".
-- These denial assertions are therefore delta-based: the row count must be UNCHANGED from what the
-- trigger already created, and the refusal is proven by the audit_log row. That is a stronger
-- statement than the previous absolute-zero, which would also have passed if the RPC silently did
-- nothing for a legitimate caller.
select (select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int as v_a1_baseline \gset

-- Denied: teacher is not an authorized role for generation.
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'cc600000-0000-0000-0000-000000000001'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int, :'v_a1_baseline'::int,
  'teacher cannot generate class_meetings (denied — row count unchanged from the trigger''s)');
select is(
  (select count(*) from audit_log where actor_role = 'teacher' and action = 'denied' and target_table = 'sessions' and target_id = 'a6000000-0000-0000-0000-000000000001')::int, 1,
  'teacher''s denied generate call writes one audit_log row');

-- Denied: coordinator scoped to a sibling session cannot generate for Session-A.
select tests.authenticate_as(:'v_coordinator_sibling'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000002'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int, :'v_a1_baseline'::int,
  'sibling-session coordinator cannot generate for Session-A (row count unchanged)');

-- Positive: in-scope coordinator generates the full weekly series (4 Sundays: Jan4/11/18/25).
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000001'::uuid);
select generate_class_meetings_for_session('a6000000-0000-0000-0000-000000000001'::uuid);
select tests.clear_authentication();
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000001')::int, 4,
  'generate_class_meetings_for_session creates one row per Sunday in the session window');
-- Class B belongs to Session-B, so its rows come from its own trigger run and must be exactly the
-- same 4 Sundays — Session-A's generation call must not add to, or reach into, another session.
select is((select count(*) from class_meetings where class_id = 'cc600000-0000-0000-0000-000000000002')::int, 4,
  'sibling session''s class holds only its own trigger-created rows, untouched by Session-A''s call');
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

-- ADR-0036: this block previously asserted `class_updates` had ZERO read policies, matching the
-- minimal zero-policy table this migration used to define. That table is gone — issue #21's
-- canonical `class_updates` (20260724120400) is authoritative and carries 7 policies, including
-- class_updates_org_select. Both the old insert (which omitted the now-NOT NULL `body`) and the
-- old assertion would fail against it, so both are replaced rather than renamed.
--
-- What this now covers is the seam ADR-0036 actually created: `meeting_date` (20260729091000)
-- exists on the canonical table, is NOT NULL, and is plainly readable through that table's
-- existing org policy — i.e. adding the column introduced no new access surface of its own.
select tests.create_supabase_user('meetings-bvcoordinator@test.local') as v_bv \gset
insert into class_updates (class_id, meeting_date, posted_by, body)
values ('cc600000-0000-0000-0000-000000000001', '2026-01-11', :'v_teacher'::uuid, 'Meetings-schema fixture update');

select has_column('public', 'class_updates', 'meeting_date', 'class_updates has meeting_date (ADR-0036)');
select col_not_null('public', 'class_updates', 'meeting_date', 'class_updates.meeting_date is NOT NULL');

-- meeting_date is a plain column on an already-policied table: an org-scope role reads it through
-- class_updates_org_select, and gets the value it was written with (not null, not coerced).
select tests.authenticate_as(:'v_bv'::uuid, 'bv_coordinator', 'org', null);
select is(
  (select meeting_date from class_updates where class_id = 'cc600000-0000-0000-0000-000000000001'),
  '2026-01-11'::date,
  'org-scope role reads class_updates.meeting_date through the canonical table''s existing policy'
);
select tests.clear_authentication();

-- A role with no class_updates policy path still sees nothing — confirms adding meeting_date did
-- not widen the table's read surface.
select tests.create_supabase_user('meetings-outsider@test.local') as v_outsider \gset
select tests.authenticate_as(:'v_outsider'::uuid, 'parent', 'org', null);
select is((select count(*) from class_updates)::int, 0, 'an unrelated parent still reads zero class_updates rows after the meeting_date addition');
select tests.clear_authentication();

-- ============================================================================
-- class_meetings' two defining guarantees (PR #50 review, blocking item 3)
-- ============================================================================
-- §11.3 / non-negotiable #4 requires adversarial role x scope coverage for a new table, and
-- neither of these was asserted anywhere: that staff cannot WRITE class_meetings, and that
-- non-staff read ZERO rows.
--
-- The reviewer's sharpened point about 20260729090000:25 is what makes these necessary rather
-- than redundant: that `revoke insert, update, delete ... from authenticated, anon` is a no-op,
-- because this project's pg_default_acl never granted those privileges in the first place. So
-- the guarantee rests purely on ABSENCE — no default grant, no write policy — which is exactly
-- what a later blanket `grant` regresses silently and invisibly.
--
-- throws_ok('42501') is the right assertion here (not a 0-row no-op check): the denial is a
-- missing grant, which raises, rather than an RLS filter, which would silently affect 0 rows.
select tests.authenticate_as(:'v_coordinator'::uuid, 'coordinator', 'session', 'a6000000-0000-0000-0000-000000000001'::uuid);
select throws_ok(
  $$insert into class_meetings (class_id, meeting_date) values ('cc600000-0000-0000-0000-000000000001'::uuid, '2026-02-01')$$,
  '42501', null,
  'staff (coordinator) cannot INSERT class_meetings — generation is RPC-only'
);
select throws_ok(
  $$update class_meetings set status = 'cancelled' where class_id = 'cc600000-0000-0000-0000-000000000001'::uuid$$,
  '42501', null,
  'staff (coordinator) cannot UPDATE class_meetings — cancellation is not a client write path'
);
select tests.clear_authentication();

-- Non-staff read zero. class_meetings carries no parent/student policy at all, so these are
-- filtered to nothing rather than raising.
select tests.create_supabase_user('meetings-parent@test.local') as v_cm_parent \gset
select tests.authenticate_as(:'v_cm_parent'::uuid, 'parent', 'org', null);
select is((select count(*) from class_meetings)::int, 0, 'Parent reads zero class_meetings rows');
select tests.clear_authentication();

select tests.create_supabase_user('meetings-student@test.local') as v_cm_student \gset
select tests.authenticate_as(:'v_cm_student'::uuid, 'student', 'class', 'cc600000-0000-0000-0000-000000000001'::uuid);
select is((select count(*) from class_meetings)::int, 0, 'Student reads zero class_meetings rows, even scoped to a class that has them');
select tests.clear_authentication();

-- anon differs from parent/student: they hold `grant select ... to authenticated` and are
-- filtered to zero rows by the absence of a matching policy, whereas anon has no grant at all and
-- is refused outright. Asserting 0 rows for anon would have been wrong in a way that still passed
-- if a grant were later added — 42501 is the assertion that actually pins the behaviour.
select set_config('request.jwt.claims', '', true);
set role anon;
select throws_ok(
  $$select count(*) from class_meetings$$,
  '42501', null, 'anon cannot select class_meetings at all (no grant)'
);
reset role;

select * from finish();
rollback;

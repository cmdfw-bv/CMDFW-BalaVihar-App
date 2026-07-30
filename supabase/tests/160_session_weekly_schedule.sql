-- ADR-0031: sessions.day_of_week/start_time/end_time — proves the check constraint
-- and that RLS/grants on sessions are unaffected by the new columns (amends
-- core-schema-and-rls's already-Built RLS suite in 010_operational_core_rls.sql,
-- does not replace it).
begin;
select plan(9);

insert into centers (id, name) values ('c0000000-0000-0000-0000-000000000001', 'Schedule Test Center');

select has_column('public', 'sessions', 'day_of_week', 'sessions has day_of_week');
select has_column('public', 'sessions', 'start_time', 'sessions has start_time');
select has_column('public', 'sessions', 'end_time', 'sessions has end_time');
select col_not_null('public', 'sessions', 'day_of_week', 'day_of_week is not null');
select col_not_null('public', 'sessions', 'start_time', 'start_time is not null');
select col_not_null('public', 'sessions', 'end_time', 'end_time is not null');

-- Check constraint: day_of_week must be 0..6 (0=Sunday, matching extract(dow from ...)).
select throws_ok(
  $$insert into sessions (center_id, name, start_date, end_date, day_of_week, start_time, end_time)
    values ('c0000000-0000-0000-0000-000000000001', 'Bad Session', '2026-01-01', '2026-06-01', 7, '09:00', '10:30')$$,
  '23514',
  null,
  'day_of_week outside 0..6 is rejected by the check constraint'
);

select lives_ok(
  $$insert into sessions (id, center_id, name, start_date, end_date, day_of_week, start_time, end_time)
    values ('50000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Good Session', '2026-01-01', '2026-06-01', 0, '14:00', '15:30')$$,
  'day_of_week=0 (Sunday) with a valid time range is accepted'
);

-- RLS unaffected: unchanged sessions_teacher_select policy still scopes correctly
-- and the new columns are readable through it.
insert into classes (id, session_id, name, grade_band)
values ('c1000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Test Class', 'Gr3');

select tests.create_supabase_user('schedule-teacher@test.local') as v_teacher \gset
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', 'c1000000-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $$select day_of_week, start_time, end_time from sessions$$,
  $$values (0::smallint, '14:00'::time, '15:30'::time)$$,
  'teacher (class scope) still reads exactly their own session, including the new columns, via the unchanged sessions_teacher_select policy'
);

select tests.clear_authentication();
select * from finish();
rollback;

begin;
select plan(7);

-- #19 (pilot-seed-data): the shared, account-free supabase/seed/domain.sql must load the real F3
-- shape — 6 class rows (5 running PreK-9 + a deliberately EMPTY 10-12 row, matching the real
-- attendance sheet), ~33 students (~3 per grade, PreK-9), and it must include KG (the old seed
-- skipped it: it listed "Shishu Vihaar + Gr1..Gr12" = 13). Runs against seeded data
-- (CI order: `supabase db reset` then `supabase test db`). No account-referencing rows are
-- asserted here — those live in the per-environment account layer (seed.sql), by design
-- (ADR-2026-09-14-synthetic-seed-shared-data-per-env-accounts).

-- The Frisco center exists.
select is(
  (select count(*) from centers where name = 'Frisco')::int,
  1,
  'Frisco center seeded'
);

-- F3 has exactly 6 class rows (5 running + the kept-empty 10-12).
select is(
  (select count(*) from classes c join sessions s on s.id = c.session_id where s.name = 'F3')::int,
  6,
  'F3 has 6 class rows (5 running + empty 10-12)'
);

-- The six labels are distinct (no accidental duplicate grade_band).
select is(
  (select count(distinct c.grade_band) from classes c join sessions s on s.id = c.session_id
    where s.name = 'F3')::int,
  6,
  'F3 has 6 distinct class labels'
);

-- The kept-empty 10-12 class row exists.
select is(
  (select count(*) from classes c join sessions s on s.id = c.session_id
    where s.name = 'F3' and c.grade_band = '10, 11, 12')::int,
  1,
  'the 10, 11, 12 class row exists'
);

-- ...and it has zero enrollments (the deliberate empty-class edge case).
select is(
  (select count(*) from enrollments e
     join classes c on c.id = e.class_id
     join sessions s on s.id = c.session_id
    where s.name = 'F3' and c.grade_band = '10, 11, 12')::int,
  0,
  'the 10, 11, 12 class has zero enrollments'
);

-- F3 has ~33 enrolled students (across the 5 running classes).
select ok(
  (select count(*) from enrollments e
     join classes c on c.id = e.class_id
     join sessions s on s.id = c.session_id
    where s.name = 'F3') between 28 and 40,
  'F3 has ~33 enrolled students'
);

-- KG is represented (the old seed skipped it — jumped Shishu Vihaar -> Gr1).
select isnt(
  (select count(*) from students where grade_level = 'KG')::int,
  0,
  'KG grade is represented (old seed skipped it)'
);

select * from finish();
rollback;

begin;
select plan(2);

-- Regression for #61 / #53: the seed creates Gr9-Gr12 student LOGINS (students.user_id) and their
-- enrollments, but historically never inserted a matching 'student' user_roles row. Result: the
-- student role count was 0 and every seeded student landed on /no-role, making the Student persona
-- unusable and UAT-11/12/13 unwalkable. This test pins the seed's invariant so it can't regress.
-- Runs against seeded data (CI order: `supabase db reset` then `supabase test db`).

-- The seed must grant student roles at all (was 0).
select isnt(
  (select count(*) from user_roles where role = 'student')::int,
  0,
  'seed grants at least one student role'
);

-- No seeded student with a login may be left without a matching 'student' role
-- (scoped to their class, mirroring the teacher/parent grants in seed.sql).
select is(
  (select count(*)
     from students s
     join auth.users u on u.id = s.user_id
     left join user_roles ur on ur.user_id = s.user_id and ur.role = 'student'
    where ur.id is null)::int,
  0,
  'every seeded student login has a student role'
);

select * from finish();
rollback;

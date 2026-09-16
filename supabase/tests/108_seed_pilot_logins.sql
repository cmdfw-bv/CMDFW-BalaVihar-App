begin;
select plan(5);

-- #19 pilot exception: every student in the F3 "7, 8, 9" combined class gets an app login (not
-- just grade 9), so the Student experience is demoable/pilotable for that class. And the accounts
-- a volunteer actually demos (the 7-8-9 students, teacher1@, multirole@) must land on POPULATED
-- classes with real content — not the empty 10-12 class. Runs against seeded data (CI:
-- `supabase db reset` then `supabase test db`). Account layer = seed.sql; account-free structure
-- it builds on = domain.sql. Mutation-proof for assertion 1: break the login loop in
-- seed.sql (the `where c.grade_band = '7, 8, 9'` block) and this goes red (exact count, not vacuous).

-- Exactly the 9 students of the F3 7-8-9 class have a login (pilot exception). Exact count, so it
-- cannot pass vacuously (an empty/renamed class would make it 0, not 9).
select is(
  (select count(*) from students st
     join enrollments e on e.student_id = st.id
     join classes c on c.id = e.class_id
     join sessions s on s.id = c.session_id
    where s.name = 'F3' and c.grade_band = '7, 8, 9' and st.user_id is not null)::int,
  9,
  'F3 7-8-9 class: exactly 9 students have a login (pilot exception)'
);

-- Each such login carries a matching org-scoped 'student' role (so they don't land on /no-role).
select is(
  (select count(*) from students st
     join enrollments e on e.student_id = st.id
     join classes c on c.id = e.class_id
     join sessions s on s.id = c.session_id
     left join user_roles ur on ur.user_id = st.user_id and ur.role = 'student'
    where s.name = 'F3' and c.grade_band = '7, 8, 9' and st.user_id is not null and ur.id is null)::int,
  0,
  'every 7-8-9 login has a matching student role'
);

-- The pilot class the students log into has content — else the whole point (a demoable Student
-- feed) is undermined. The 7-8-9 class must stay fully compliant (has class_updates).
select ok(
  (select count(*) from class_updates cu
     join classes c on c.id = cu.class_id
     join sessions s on s.id = c.session_id
    where s.name = 'F3' and c.grade_band = '7, 8, 9') >= 1,
  'the 7-8-9 pilot class has class_updates (student feed is not empty)'
);

-- The multirole account's teacher-scoped class must be a POPULATED class (the role-switcher demo,
-- UAT-5/7) — not the empty 10-12 class.
select ok(
  (select count(*) from enrollments e
    where e.class_id = (select ur.scope_id from user_roles ur join auth.users u on u.id = ur.user_id
                         where u.email = 'multirole@bv-seed.test.local' and ur.role = 'teacher')) >= 1,
  'the multirole account teaches a populated class (not the empty 10-12)'
);

-- teacher1@ (the obvious account a volunteer types to demo the Teacher persona) has a populated roster.
select ok(
  (select count(*) from enrollments e
    where e.class_id = (select ur.scope_id from user_roles ur join auth.users u on u.id = ur.user_id
                         where u.email = 'teacher1@bv-seed.test.local' and ur.role = 'teacher')) >= 1,
  'teacher1@ has enrolled students (not the empty 10-12 class)'
);

select * from finish();
rollback;

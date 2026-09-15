begin;
select plan(3);

-- #19 pilot exception: every student in the F3 "7, 8, 9" combined class gets an app login (not
-- just grade 9), so the Student experience is demoable/pilotable for that class. General rule is
-- Gr9+, but F3 has no 10-12 students this year, so the 7-8-9 class is the login set. Runs against
-- seeded data (CI: `supabase db reset` then `supabase test db`). Account layer = seed.sql; the
-- account-free structure it builds on = domain.sql.

-- Every 7-8-9 student has a login (students.user_id set).
select is(
  (select count(*) from students st
     join enrollments e on e.student_id = st.id
     join classes c on c.id = e.class_id
     join sessions s on s.id = c.session_id
    where s.name = 'F3' and c.grade_band = '7, 8, 9' and st.user_id is null)::int,
  0,
  'every F3 7-8-9 student has a login (pilot exception)'
);

-- ...and there is at least one such student (the class is populated).
select ok(
  (select count(*) from students st
     join enrollments e on e.student_id = st.id
     join classes c on c.id = e.class_id
     join sessions s on s.id = c.session_id
    where s.name = 'F3' and c.grade_band = '7, 8, 9' and st.user_id is not null) >= 1,
  'the F3 7-8-9 class actually has login-bearing students'
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

select * from finish();
rollback;

begin;
select plan(4);

select id as v_multirole_user from auth.users where email = 'multirole@bv-seed.test.local' \gset
select count(*) as v_total_centers from centers \gset
select scope_id as v_teacher_scope from user_roles where user_id = :'v_multirole_user'::uuid and role = 'teacher' \gset
select scope_id as v_coordinator_scope from user_roles where user_id = :'v_multirole_user'::uuid and role = 'coordinator' \gset

select tests.authenticate_as(:'v_multirole_user'::uuid, 'parent');
select ok(
  (select count(*) from students) > 0
  and (select count(*) from students) = (
    select count(*) from students s
    join family_members fm on fm.family_id = s.family_id
    where fm.user_id = :'v_multirole_user'::uuid
  ),
  'simulating parent on the multi-role account yields only that guardian''s own children'
);

select tests.clear_authentication();
select tests.authenticate_as(:'v_multirole_user'::uuid, 'teacher', 'class', :'v_teacher_scope'::uuid);
select ok(
  (select count(*) from classes) = 1,
  'simulating teacher on the same account yields exactly their one assigned class, not their parent-scope children''s classes too'
);

select tests.clear_authentication();
select tests.authenticate_as(:'v_multirole_user'::uuid, 'coordinator', 'session', :'v_coordinator_scope'::uuid);
select ok(
  (select count(*) from classes) >= 1
  and not exists (
    select 1 from classes c where c.session_id <> :'v_coordinator_scope'::uuid
  ),
  'simulating coordinator on the same account yields only their session''s classes'
);

select tests.clear_authentication();
select tests.authenticate_as(:'v_multirole_user'::uuid, 'bv_coordinator', 'org', null);
select is(
  (select count(*) from centers)::int, :v_total_centers::int,
  'simulating bv_coordinator on the same account yields every center (org scope), not just their parent/teacher/coordinator subset'
);

select tests.clear_authentication();
select * from finish();
rollback;

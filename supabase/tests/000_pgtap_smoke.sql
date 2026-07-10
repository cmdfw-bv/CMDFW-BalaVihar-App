begin;
select plan(3);

select tests.create_supabase_user('smoke1@test.local') as v_user \gset

select tests.authenticate_as(:'v_user'::uuid, 'teacher', 'class', gen_random_uuid());

select is(auth.jwt()->>'active_role', 'teacher', 'authenticate_as sets active_role');
select is(auth.jwt()->>'sub', :'v_user', 'authenticate_as sets sub to the given user id');
select is(current_setting('role'), 'authenticated', 'authenticate_as switches to the authenticated role');

select tests.clear_authentication();

select * from finish();
rollback;

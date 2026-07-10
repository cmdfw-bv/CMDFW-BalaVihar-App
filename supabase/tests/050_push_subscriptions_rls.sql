begin;
select plan(4);

select tests.create_supabase_user('push-owner@test.local') as v_owner \gset
select tests.create_supabase_user('push-other@test.local') as v_other \gset

select tests.authenticate_as(:'v_owner'::uuid, 'parent');
select lives_ok(
  $$insert into push_subscriptions (user_id, endpoint, p256dh_key, auth_key)
    values (auth.uid(), 'https://fcm.example/abc', 'p256dh-fixture', 'auth-fixture')$$,
  'owner can insert their own push subscription'
);
select is((select count(*) from push_subscriptions)::int, 1, 'owner sees exactly their own subscription');

select tests.clear_authentication();
select tests.authenticate_as(:'v_other'::uuid, 'parent');
select is((select count(*) from push_subscriptions)::int, 0, 'a different user sees zero subscriptions');

with attempted as (
  update push_subscriptions set endpoint = 'https://fcm.example/hijacked' where endpoint = 'https://fcm.example/abc'
  returning 1
)
select count(*)::int as v_affected from attempted \gset

select is(:v_affected, 0, 'a different user cannot update someone else''s subscription');

select tests.clear_authentication();
select * from finish();
rollback;

begin;
select plan(5);

select has_column('public', 'students', 'retention_eligible_at', 'students has retention_eligible_at');
select has_column('public', 'attendance', 'retention_eligible_at', 'attendance has retention_eligible_at');
select has_column('public', 'consents', 'retention_eligible_at', 'consents has retention_eligible_at');
select has_column('public', 'messages', 'retention_eligible_at', 'messages has retention_eligible_at');

select is(
  (select count(*) from information_schema.triggers
   where event_object_table in ('students','attendance','consents','messages')
     and (trigger_name ilike '%retention%' or trigger_name ilike '%delet%')
  )::int,
  0,
  'no deletion/retention job trigger exists yet — the columns are inert, as designed'
);

select * from finish();
rollback;

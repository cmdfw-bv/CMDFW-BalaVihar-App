begin;
select plan(7);

select has_column('public', 'students', 'retention_eligible_at', 'students has retention_eligible_at');
select has_column('public', 'attendance', 'retention_eligible_at', 'attendance has retention_eligible_at');
select has_column('public', 'consents', 'retention_eligible_at', 'consents has retention_eligible_at');
select has_column('public', 'messages', 'retention_eligible_at', 'messages has retention_eligible_at');
-- class_updates/comments hold minor-authored and minor-directed content, same as messages, so
-- they carry the same retention placeholder (§11 retention rule / .claude/rules/supabase-sql.md).
select has_column('public', 'class_updates', 'retention_eligible_at', 'class_updates has retention_eligible_at');
select has_column('public', 'comments', 'retention_eligible_at', 'comments has retention_eligible_at');

select is(
  (select count(*) from information_schema.triggers
   where event_object_table in ('students','attendance','consents','messages','class_updates','comments')
     and (trigger_name ilike '%retention%' or trigger_name ilike '%delet%')
  )::int,
  0,
  'no deletion/retention job trigger exists yet — the columns are inert, as designed'
);

select * from finish();
rollback;

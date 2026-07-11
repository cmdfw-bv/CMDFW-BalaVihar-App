begin;
select plan(8);

-- ── families.primary_guardian_email_hash ────────────────────────────────────

select has_column(
  'public', 'families', 'primary_guardian_email_hash',
  'families has primary_guardian_email_hash column'
);

select col_is_null(
  'public', 'families', 'primary_guardian_email_hash',
  'primary_guardian_email_hash is nullable (seed families have no hash)'
);

-- Partial unique index: duplicate non-null hash is rejected.
insert into families (label, primary_guardian_email_hash)
  values ('Hash Setup Family', 'deadbeef0123456789');

select throws_ok(
  $$ insert into families (label, primary_guardian_email_hash)
     values ('Hash Dup Family', 'deadbeef0123456789') $$,
  '23505', null,
  'duplicate non-null guardian hash rejected by unique index'
);

-- Partial index does not constrain NULLs: two null-hash families must both insert.
select lives_ok(
  $$ insert into families (label, primary_guardian_email_hash)
     values ('No-hash Family A', null) $$,
  'first null guardian hash allowed'
);

select lives_ok(
  $$ insert into families (label, primary_guardian_email_hash)
     values ('No-hash Family B', null) $$,
  'second null guardian hash allowed (NULLs excluded from partial unique index)'
);

-- ── students.external_member_id partial unique index ────────────────────────

-- Duplicate non-null external_member_id is rejected.
insert into students (family_id, first_name, last_name, grade_level, external_member_id)
  values (
    (select id from families limit 1),
    'UniqueExt', 'TestStudent', 'Gr5', 'EXT-CSV-PLAN-001'
  );

select throws_ok(
  $$ insert into students (family_id, first_name, last_name, grade_level, external_member_id)
     values (
       (select id from families limit 1),
       'UniqueExt2', 'TestStudent', 'Gr5', 'EXT-CSV-PLAN-001'
     ) $$,
  '23505', null,
  'duplicate non-null external_member_id rejected by partial unique index'
);

-- NULLs are not constrained: two students with null external_member_id must both insert.
select lives_ok(
  $$ insert into students (family_id, first_name, last_name, grade_level, external_member_id)
     values ((select id from families limit 1), 'NullExt1', 'S', 'Gr5', null) $$,
  'first null external_member_id allowed'
);

select lives_ok(
  $$ insert into students (family_id, first_name, last_name, grade_level, external_member_id)
     values ((select id from families limit 1), 'NullExt2', 'S', 'Gr5', null) $$,
  'second null external_member_id allowed (NULLs excluded from partial unique index)'
);

select * from finish();
rollback;

begin;
select plan(6);

insert into families (id, label) values
  ('fc111111-0000-0000-0000-000000000001', 'Consent Family A'),
  ('fc222222-0000-0000-0000-000000000002', 'Consent Family B');

select tests.create_supabase_user('consent-parent-a@test.local') as v_parent_a \gset
select tests.create_supabase_user('consent-teacher@test.local') as v_teacher \gset

insert into family_members (family_id, user_id, relationship) values
  ('fc111111-0000-0000-0000-000000000001', :'v_parent_a'::uuid, 'guardian');

insert into students (id, family_id, first_name, last_name, grade_level) values
  ('5c111111-0000-0000-0000-000000000001', 'fc111111-0000-0000-0000-000000000001', 'Con', 'A', 'Grade4'),
  ('5c222222-0000-0000-0000-000000000002', 'fc222222-0000-0000-0000-000000000002', 'Con', 'B', 'Grade4');

insert into consents (student_id, consent_type, granted, granted_by) values
  ('5c111111-0000-0000-0000-000000000001', 'participation', true, :'v_parent_a'::uuid),
  ('5c222222-0000-0000-0000-000000000002', 'media', false, null);

-- Positive: parent sees + can insert/update their own child's consent.
select tests.authenticate_as(:'v_parent_a'::uuid, 'parent');
select is((select count(*) from consents)::int, 1, 'parent sees exactly their own child''s consent row');

select lives_ok(
  $$insert into consents (student_id, consent_type, granted, granted_by)
    values ('5c111111-0000-0000-0000-000000000001', 'media', true, auth.uid())$$,
  'parent can grant a new consent type for their own child'
);

select lives_ok(
  $$update consents set revoked_at = now() where student_id = '5c111111-0000-0000-0000-000000000001' and consent_type = 'participation'$$,
  'parent can revoke (set revoked_at) their own child''s consent'
);

-- Negative: parent cannot see or touch the other family's consent.
select is(
  (select count(*) from consents where student_id = '5c222222-0000-0000-0000-000000000002')::int, 0,
  'parent cannot see the other family''s consent row'
);
-- Note: an UPDATE whose USING clause makes a row invisible is excluded from the
-- update set (0 rows affected) rather than raising 42501 -- Postgres only raises
-- on a WITH CHECK failure for a row that *was* visible pre-update. Assert 0 rows
-- affected, which is the correct proof that the cross-family row cannot be touched.
-- (A data-modifying WITH must be the top-level statement, so capture the count
-- via \gset rather than nesting it inside is()'s argument.)
with attempted as (
  update consents set granted = true
  where student_id = '5c222222-0000-0000-0000-000000000002'
  returning 1
)
select count(*)::int as v_affected from attempted \gset

select is(:v_affected, 0, 'parent cannot update the other family''s consent');

-- Negative: Teacher gets zero rows directly (RPC-only per ADR-0019, proven again in Task 5).
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from consents)::int, 0, 'teacher direct select on consents returns zero rows');

select tests.clear_authentication();
select * from finish();
rollback;

-- consents RLS -- read paths only.
--
-- Updated for ADR-2026-09-15-consent-captured-at-registration (issue #92): the parent write
-- path is revoked, so the two assertions that previously proved a parent COULD insert and
-- update now prove the opposite. This file is edited rather than paired with a second test
-- file, because two suites asserting opposite things about the same table is worse than one
-- suite that is current.
--
-- Note on setup: the fixture rows below are inserted before any authenticate_as(), i.e. as the
-- table owner, which the REVOKE does not touch. That is deliberate -- it mirrors the only
-- writer the table has in reality (the synthetic seed) and proves the REVOKE is scoped to
-- `authenticated` rather than locking the table outright.

begin;
select plan(7);

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

-- Read path intact: parent still sees exactly their own child's row.
select tests.authenticate_as(:'v_parent_a'::uuid, 'parent');
select is((select count(*) from consents)::int, 1, 'parent sees exactly their own child''s consent row');

-- Write path closed. A table-level privilege check runs BEFORE RLS, so these raise 42501
-- (insufficient_privilege) rather than silently affecting zero rows -- which is the stronger
-- proof: the parent cannot write even the row their own policy would have admitted.
select throws_ok(
  $$insert into consents (student_id, consent_type, granted, granted_by)
    values ('5c111111-0000-0000-0000-000000000001', 'media', true, auth.uid())$$,
  '42501', null,
  'parent cannot insert a consent row for their own child (write path revoked)'
);

select throws_ok(
  $$update consents set revoked_at = now()
    where student_id = '5c111111-0000-0000-0000-000000000001' and consent_type = 'participation'$$,
  '42501', null,
  'parent cannot update (revoke) their own child''s consent row (write path revoked)'
);

-- Negative: parent still cannot see the other family's row.
select is(
  (select count(*) from consents where student_id = '5c222222-0000-0000-0000-000000000002')::int, 0,
  'parent cannot see the other family''s consent row'
);

-- Negative: the cross-family write is refused at the privilege layer too. Before the REVOKE
-- this had to be asserted as "0 rows affected", because an UPDATE whose USING clause hides the
-- row is excluded from the update set rather than raising. That subtlety no longer applies --
-- the privilege check fires first, for visible and invisible rows alike.
select throws_ok(
  $$update consents set granted = true
    where student_id = '5c222222-0000-0000-0000-000000000002'$$,
  '42501', null,
  'parent cannot update the other family''s consent row'
);

-- Negative: the table cannot be emptied either. TRUNCATE bypasses RLS entirely, so a revoke is
-- the only thing that stops it -- without this the table would still be wipeable in one
-- statement despite INSERT/UPDATE being closed. (Repo-wide, this defect is issue #28; here it
-- is closed for this one table so "inert" is true of it.)
select throws_ok(
  $$truncate table consents$$,
  '42501', null,
  'parent cannot TRUNCATE the consents table'
);

-- Negative: Teacher gets zero rows directly (RPC-only per ADR-0019).
select tests.clear_authentication();
select tests.authenticate_as(:'v_teacher'::uuid, 'teacher', 'class', gen_random_uuid());
select is((select count(*) from consents)::int, 0, 'teacher direct select on consents returns zero rows');

select tests.clear_authentication();
select * from finish();
rollback;

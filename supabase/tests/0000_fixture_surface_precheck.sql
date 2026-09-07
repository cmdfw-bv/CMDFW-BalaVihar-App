-- Sorts first in the suite, deliberately.
--
-- The pgTAP fixture surface installs from supabase/seed/00_test_fixtures.sql, which only
-- `supabase db reset` loads (ADR-2026-09-07-test-fixtures-never-in-migrations). If seeding
-- was skipped, every one of the other test files fails with `schema "tests" does not exist`
-- and none of them says why. This file raises one explanatory error instead.
--
-- The check runs in a plain DO block BEFORE any pgTAP call on purpose: when the surface is
-- missing, pgTAP is missing too, so `select plan(1)` would itself fail with an unrelated
-- "function plan(integer) does not exist" and bury the real cause.
do $$
begin
  if to_regnamespace('tests') is null
     or not exists (select 1 from pg_extension where extname = 'pgtap') then
    raise exception using
      message = 'pgTAP fixture surface is missing — the test suite cannot run',
      detail  = 'The `tests` schema and/or the `pgtap` extension are not installed in this database.',
      hint    = 'They install from supabase/seed/00_test_fixtures.sql, which loads only during '
                || '`supabase db reset` — not with --no-seed, not with [db.seed] enabled = false, '
                || 'and never via `supabase db push`. Run `supabase db reset` and retry. '
                || 'See .docs/adr/2026-09-07-test-fixtures-never-in-migrations.md';
  end if;
end $$;

begin;
select plan(1);

select pass('fixture surface present — tests schema + pgtap extension installed from the seed path');

select * from finish();
rollback;

-- Cloud fixture-absence check — spec AC#6, ADR-2026-09-07-test-fixtures-never-in-migrations.
--
-- Run against a CLOUD project after migrations are applied:
--     psql "$DB_URL" -f supabase/checks/cloud_fixture_absence.sql
--
-- This is a BLOCKING step, not a report. Production provisioning (#9 §4.5) is not complete
-- until it passes. The failure it exists to catch is a provisioning run that dies between
-- 20260709022932 (creates the fixture surface) and 20260907120000 (drops it): the account
-- factory is then left installed indefinitely, and a half-applied migration run does not
-- announce where it stopped.
--
-- Holds no credentials. Takes the connection string from the caller's environment.
-- Expected on a healthy cloud database: one line, "cloud fixture-absence check: PASS".
do $$
declare
  -- The ::text casts on every append are load-bearing: `text[] || 'literal'` is ambiguous
  -- and Postgres resolves it to array_cat, which then fails parsing the string as an array.
  v_problems text[] := '{}';
  v_routines text;
begin
  if to_regnamespace('tests') is not null then
    v_problems := v_problems || 'the `tests` schema exists'::text;
  end if;

  if exists (select 1 from pg_extension where extname = 'pgtap') then
    v_problems := v_problems || 'the `pgtap` extension is installed'::text;
  end if;

  -- Searched across ALL schemas, not `public` alone: pgTAP installs into `extensions`, and a
  -- helper could be recreated anywhere. Name-based, because the point is the capability, not
  -- the address.
  select string_agg(format('%I.%I', n.nspname, p.proname), ', ' order by n.nspname, p.proname)
    into v_routines
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.proname in ('create_supabase_user', 'authenticate_as', 'clear_authentication');

  if v_routines is not null then
    v_problems := v_problems || format('fixture routines present: %s', v_routines)::text;
  end if;

  if array_length(v_problems, 1) > 0 then
    raise exception using
      message = 'cloud fixture-absence check: FAIL',
      detail  = array_to_string(v_problems, '; '),
      hint    = 'A cloud database must carry no pgTAP test-fixture surface. If a provisioning '
                || 'run was interrupted between 20260709022932 and 20260907120000, re-run '
                || '`supabase db push` to apply the drop, then re-run this check. '
                || 'See .docs/adr/2026-09-07-test-fixtures-never-in-migrations.md';
  end if;

  raise notice 'cloud fixture-absence check: PASS — no tests schema, no pgtap extension, no fixture routines';
end $$;

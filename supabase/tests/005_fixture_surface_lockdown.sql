-- AC#5 (spec: test-fixture-isolation) — the fixture surface keeps its lockdown wherever it
-- exists. This item MOVES the helpers off the migration path; it does not relax them, and it
-- must not silently over-tighten them either. So this asserts the INTENDED shape, both
-- directions: the two fabricating helpers are unreachable by the Data API roles, and
-- clear_authentication keeps the narrow `authenticated` grant the suite depends on.
--
-- ADR-2026-09-07-test-fixtures-never-in-migrations.
begin;
select plan(8);

-- The two helpers that can fabricate identity: unreachable by either Data API role.
select ok(
  not has_function_privilege('anon', 'tests.create_supabase_user(text)', 'execute'),
  'anon cannot execute tests.create_supabase_user'
);
select ok(
  not has_function_privilege('authenticated', 'tests.create_supabase_user(text)', 'execute'),
  'authenticated cannot execute tests.create_supabase_user'
);
select ok(
  not has_function_privilege('anon', 'tests.authenticate_as(uuid, text, text, uuid)', 'execute'),
  'anon cannot execute tests.authenticate_as'
);
select ok(
  not has_function_privilege('authenticated', 'tests.authenticate_as(uuid, text, text, uuid)', 'execute'),
  'authenticated cannot execute tests.authenticate_as'
);

-- PUBLIC's implicit execute grant is revoked. A NULL proacl means default privileges, which
-- for a function means PUBLIC *can* execute — so a null ACL is a failure here, not a pass.
select ok(
  (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'tests'
      and p.proname in ('create_supabase_user', 'authenticate_as')
      and (
        p.proacl is null
        or exists (select 1 from unnest(p.proacl) a where a::text like '=%')
      )
  ) = 0,
  'PUBLIC holds no execute grant on either fabricating helper (ACL explicit, no "=" entry)'
);

-- Schema-level reachability.
select ok(
  not has_schema_privilege('anon', 'tests', 'usage'),
  'anon has no USAGE on the tests schema'
);

-- The deliberate exceptions, asserted so a future over-tightening breaks loudly rather than
-- taking the suite down with it: authenticate_as flips the transaction's current_user to
-- `authenticated`, so the suite's own clear_authentication() call runs as that role.
select ok(
  has_schema_privilege('authenticated', 'tests', 'usage'),
  'authenticated retains USAGE on tests (needed by clear_authentication)'
);
select ok(
  has_function_privilege('authenticated', 'tests.clear_authentication()', 'execute'),
  'authenticated retains execute on tests.clear_authentication (clears claims, cannot escalate)'
);

select * from finish();
rollback;

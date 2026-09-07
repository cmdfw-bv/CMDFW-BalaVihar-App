# System — test-fixture isolation — Implementation Plan

> Spec: [test-fixture-isolation.md](test-fixture-isolation.md) · Governing ADR: [ADR-2026-09-07-test-fixtures-never-in-migrations](../../adr/2026-09-07-test-fixtures-never-in-migrations.md) · Issue [#66](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/66)

**Stage:** 2 — Development. `/plan` ✓ → `/migration` ✓ → `/build` ✓ → `/test` ✓ (all 2026-09-07) → `/deploy-staging` → `/promote`.

Branch: `mehtamaulik-creator/system-keep-pgtap-test-helpers-out-of-cloud-dbs` (this worktree).

---

## Global Constraints

- **`supabase/migrations/20260709022932_enable_pgtap_and_test_helpers.sql` is never edited.** It is the record of what staging ran (ADR Decision 2). Any diff touching that file is a plan violation, not a shortcut — the whole point of the chosen option over the rejected one.
- **TDD, non-negotiable #4.** Every guard is written and confirmed **RED** before the code that makes it green. Where a test asserts *existing* behavior (the AC#5 lockdown), it cannot go red on arrival — so its proof is a **mutation**: break the thing it guards, confirm red, revert. A test that has never been observed failing is not evidence.
- **The fixture helper bodies move verbatim** (ADR Decision 4). Same function bodies, same `REVOKE`/`GRANT` set, same explanatory comments. This item relocates the surface; it does not redesign, tighten, or relax it. A diff that "improves" a helper while moving it is out of scope.
- **Verification runs on an isolated Supabase stack** — distinct `project_id` + 553xx ports — never the shared local stack. Concurrent worktrees share one Docker stack, and a `db reset` here would clobber another session's schema and seed mid-work.
- **Nothing in this plan touches a cloud database.** The `migration-guard` hook blocks remote pushes by design (it fired during `/architect` on a `--help` invocation, correctly). Applying to staging is `/deploy-staging`, a separately human-authorized stage.
- **The CI guard fails CLOSED.** A scan that cannot run — unreadable directory, thrown error, zero files matched — fails the build. A guard that silently passes when broken is worse than no guard, because it is trusted.
- **No credentials anywhere.** The cloud check (Task 7) takes a connection string as an argument and embeds nothing. It is committed SQL, not a script holding a secret.
- **Out of scope, do NOT build here:** hook enforcement of `--include-seed` (belongs to `cicd-pipeline`), #28's grant hardening, any change to `seed.sql`'s 8 call sites, replacing the fixture mechanism with the Auth Admin API.

**Shared seam (§12.6):** `supabase/migrations/**` and `supabase/config.toml`. The new migration takes timestamp `20260907120000`, later than every migration on `main` (`20260817120000`). If another worktree lands a migration first, this one still sorts correctly — the drop is order-independent, since nothing between July and now depends on the `tests` schema (verified: the only other mention is a comment in `20260729093000`).

---

## Task 1 — RED: unit tests for the migration scan

**File:** `scripts/__tests__/migration-fixture-checks.test.ts`

Tests the pure module before it exists. Cases, each a distinct failure the guard must catch:

| Case | Expectation |
|---|---|
| `create extension pgtap` in a migration | flagged, file named |
| `create extension if not exists pgtap with schema extensions` | flagged (the real historical form) |
| `create schema tests` / `create schema if not exists tests` | flagged |
| `create or replace function tests.foo()` | flagged |
| `create function tests . foo ()` (odd whitespace) | flagged |
| The allowlisted historical file `20260709022932_*` | **not** flagged |
| A migration that only **drops** (`drop schema if exists tests cascade`) | **not** flagged — removal is the fix, not the offence |
| `-- create schema tests` in a comment | not flagged |
| A migration mentioning `tests.authenticate_as` only inside a comment | not flagged |
| Empty migration set | **throws** — fail-closed; zero files means the scan is broken, not clean |

Run: `npm test -- migration-fixture-checks` → confirm RED (module missing).

## Task 2 — GREEN: the scan module + CLI wrapper

**Files:** `scripts/_migration-fixture-checks.js` (pure), `scripts/check-migration-fixtures.js` (I/O).

Matches the `_secret-checks.js` / `check-secrets.js` split already in the repo: a pure, unit-tested predicate module plus a thin wrapper that reads the directory, calls it, prints, and sets the exit code.

The allowlist is a single named constant holding exactly one entry — `20260709022932_enable_pgtap_and_test_helpers.sql` — with a comment saying why it cannot be removed. Detection is **creation-specific**: `create extension … pgtap`, `create schema … tests`, `create … function tests.…`. Comment lines are stripped before matching.

Failure output names the offending file, the matched line, and points at the ADR, so the person who trips it learns the rule rather than deleting the check.

Run: `npm test -- migration-fixture-checks` → GREEN. Then `node scripts/check-migration-fixtures.js` against the real tree → passes (only the allowlisted file creates fixtures today).

## Task 3 — Wire the guard into CI

**File:** `.github/workflows/ci.yml` — one step in `app-tests`, beside `check-unistyles-config.js`. That job needs no Docker, so the guard runs in ~seconds on every PR.

**Red-proof:** temporarily add a scratch migration that creates `schema tests`, run the step, confirm it fails naming that file, delete it.

## Task 4 — RED: the two new pgTAP files

**Files:** `supabase/tests/0000_fixture_surface_precheck.sql`, `supabase/tests/005_fixture_surface_lockdown.sql`

`0000_` sorts first in the suite. It raises one explanatory error, in a plain `DO` block **before any pgTAP call**, if the fixture surface is absent — deliberately not using `plan()`/`ok()`, because when the surface is missing pgTAP itself is missing and `plan()` would fail with its own unhelpful error. When healthy it emits a normal 1-test TAP plan.

`005_` is the AC#5 lockdown assertion: `EXECUTE` denied to `public`/`anon`/`authenticated` on `create_supabase_user` and `authenticate_as`; `anon` holds no `USAGE` on `tests`; `clear_authentication` retains its narrow `authenticated` grant (asserting the *intended* shape, not merely "locked down", so a future over-tightening is caught too).

**Red-proofs** (both are characterization tests over existing behavior, so both need mutation):
- `005_`: `grant execute on function tests.create_supabase_user(text) to anon;` → confirm RED → roll back.
- `0000_`: reset with `--no-seed` → confirm it fails with the explanatory sentence and not `schema "tests" does not exist`.

## Task 5 — `/migration`: the drop

**File:** `supabase/migrations/20260907120000_drop_test_fixture_surface.sql`

```sql
drop schema if exists tests cascade;
drop extension if exists pgtap;
```

`cascade` on the schema (bounded — takes the three helpers, nothing else depends on them). **No** `cascade` on the extension: a surprise dependency must fail loudly rather than silently take an app object with it. Both `if exists`, so it succeeds on staging (has them), a fresh cloud push (created moments earlier), and a database that never had them.

Header comment states why `20260709022932` was not edited and links the ADR — the create-then-drop pair will otherwise puzzle whoever reads production's history.

## Task 6 — `/build`: relocate the fixture surface

**Files:** `supabase/seed/00_test_fixtures.sql` (new), `supabase/config.toml`

The helper file is `20260709022932`'s body, verbatim, with a new header comment explaining that it lives in the seed path deliberately and must never be moved back. `config.toml` gains the ordered declaration:

```toml
sql_paths = ["./seed/00_test_fixtures.sql", "./seed/seed.sql"]
```

Order is documented CLI behavior, not lexicographic luck — `seed.sql` calls `tests.create_supabase_user()` at 8 sites and would fail against an unseeded fixture surface.

## Task 7 — The blocking cloud check (AC#6)

**File:** `supabase/checks/cloud_fixture_absence.sql`

Committed SQL an operator runs against a linked project: asserts no `tests` schema (`to_regnamespace`), no `pgtap` row in `pg_extension`, and no routine named `create_supabase_user` / `authenticate_as` / `clear_authentication` in **any** schema (`pg_proc`, not `public` alone — pgTAP lives in `extensions`). Raises on any hit; prints one confirmation line when clean.

Recorded as a **blocking** step in the `cloud-environment-provisioning` (#9) row and cross-referenced from this spec. Not run here — no cloud credentials, and that is `/deploy-staging`'s job.

## Task 8 — `/test`: full verification on an isolated stack

1. Throwaway stack: distinct `project_id`, 553xx ports, own Docker network.
2. `supabase db reset` → migrations create, then drop, then the seed reinstalls; `seed.sql`'s 8 calls succeed.
3. `supabase test db` → **28 files** green (26 existing + 2 new).
4. `--no-seed` run → confirm the single legible failure from `0000_`.
5. Both mutation proofs from Task 4, each confirmed red then reverted.
6. `npm test`, `npm run typecheck`, `npm run lint`, `node scripts/check-secrets.js`, `node scripts/check-trackers.js`, `node scripts/gen-adr-index.mjs --check`.
7. Tear the stack down.

## Task 9 — Docs, commit, PR

Spec + `_index.md` status → Built/Tested with the measured counts. Commit the Stage-1 docs and the implementation separately, so the decision record reads independently of the code. PR references #66 and quotes the ADR's Decision 1 as the rule the guard defends.

---

## Test plan

| AC | Discharged by |
|---|---|
| 1 | Task 5 (drop migration) + Task 7 (the check that proves the end state) |
| 2 | Task 5 — staging converges via the migration path at `/deploy-staging` |
| 3 | Task 8.2–8.3 — reset + 28 files green + seed's 8 calls succeed |
| 4 | Tasks 1–3 — unit tests, real-tree run, and the scratch-migration red-proof |
| 5 | Task 4 `005_` + its mutation proof |
| 6 | Task 7 + the #9 runbook step |

**Deliberately not tested here:** that a *cloud* database ends up clean. No cloud credentials in this stage; that is `/deploy-staging`, and AC#6 is the step that proves it there.

---

## Results (measured 2026-09-07)

Verified on an isolated stack — `project_id = bv-fixture-isolation-verify`, 553xx ports, own Docker network. The shared stack (12 containers, 5432x) was confirmed running before and after, and never reset.

| Check | Result |
|---|---|
| `supabase db reset` | Migrations create → drop (`drop cascades to 3 other objects` — exactly the three helpers), then both seed files load in declared order; `seed.sql`'s 8 calls succeed |
| `supabase test db` | **28 files / 352 tests, PASS** (26 pre-existing + 2 new) |
| Guard unit tests | 18/18, confirmed RED before the module existed |
| Guard against real tree | Clean, 35 migrations scanned |
| Guard red-proof | Planted scratch migration → failed, naming file, both lines, and the object created |
| `005_` mutation proof | `grant execute … to anon` → **RED** (`Failed test 1: anon cannot execute tests.create_supabase_user`) → reverted → PASS |
| `0000_` red-proof | `db reset --no-seed` → the single explanatory error with DETAIL + HINT, not `schema "tests" does not exist` |
| Cloud absence check | PASS on a migrations-only DB (exit 0); FAIL naming all three findings on a seeded one (exit 3) |
| `vitest` | 91 files / 701 tests pass |
| `typecheck` · `lint` | clean |
| `check-secrets` · `check-trackers` · `check-unistyles-config` · `check-migration-fixtures` · `gen-adr-index --check` | all pass |

### Two deviations from this plan, both recorded rather than quietly absorbed

1. **AC#1 turned out to be locally provable, contrary to the plan's "deliberately not tested here".** `supabase db reset --no-seed` produces exactly a cloud-shaped database — every migration applied, no seed file loaded. Running `cloud_fixture_absence.sql` against that state proves the migration path alone leaves no fixture surface, without any cloud credentials. The plan understated what was verifiable; AC#1 now has a local proof *and* the blocking cloud step, not just the latter.
2. **The cloud check had a real bug, found only by testing its failure path.** `text[] || 'literal'` is ambiguous in Postgres and resolved to `array_cat`, which then failed parsing the string as an array — so on a database that *did* carry the fixtures, the check errored instead of reporting them. Fixed with explicit `::text` casts (now commented as load-bearing). Worth noting as a process point: had the check only ever been exercised against a clean database, it would have shipped looking green and failed open on the exact case it exists to catch.

## Sign-off

- `/plan` ✓ 2026-09-07
- `/migration` ✓ 2026-09-07 — `20260907120000_drop_test_fixture_surface.sql`
- `/build` ✓ 2026-09-07 — seed relocation, guard, 2 pgTAP files, cloud check, CI wiring
- `/test` ✓ 2026-09-07 — table above
- `/deploy-staging` · `/promote` — pending (staging still carries the fixture surface until the drop is applied there)

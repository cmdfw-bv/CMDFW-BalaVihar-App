# System — test-fixture isolation (test helpers never reach a cloud database)

> **owner:** System · **consumers:** every UoW carrying pgTAP coverage (26 test files today) + [cloud-environment-provisioning](_index.md) (#9) + [cicd-pipeline](cicd-pipeline.md) · **scope:** infra / test-fixture surface — no app table, policy, or claim changes · **governing ADR:** [ADR-2026-09-07-test-fixtures-never-in-migrations](../../adr/2026-09-07-test-fixtures-never-in-migrations.md) · **covers:** issue [#66](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/66); doc 3 §6 (schema is code), §11.3 (adversarial RLS testing), §12.1 (GOVERN gates)

**Stage:** 2 — Built + tested (2026-09-07); `/deploy-staging` pending. Design trail: `/refine` ✓ (2026-09-07) → `/architect` ✓ (2026-09-07, ADR recorded) → `/design` ✓ (2026-09-07, below) → human sign-off ✓ (2026-09-07) → `/plan` ✓ ([plan](test-fixture-isolation.plan.md)).

---

## Requirements (refined)

### User story

**As the** System, **I want** the pgTAP test-fixture surface — the `tests` schema, its three helper functions, and the `pgtap` extension itself — installed only on local and CI databases and never on a cloud one, **so that** no cloud database, least of all the production project that will hold minors' PII, carries a `SECURITY DEFINER` function able to fabricate a confirmed `auth.users` row.

### What the fixture surface is

`supabase/migrations/20260709022932_enable_pgtap_and_test_helpers.sql` installs four things:

| Object | What it does | Who needs it |
|---|---|---|
| `extension pgtap` | The assertion library the whole RLS suite is written against | `supabase test db` |
| `tests.create_supabase_user(text)` | `SECURITY DEFINER`; `INSERT`s straight into `auth.users` with a fixed fake bcrypt hash and `email_confirmed_at = now()`, bypassing GoTrue entirely | 26 pgTAP files + `supabase/seed/seed.sql` (8 call sites) |
| `tests.authenticate_as(uuid, text, text, uuid)` | Fabricates `request.jwt.claims` and flips the transaction to the `authenticated` role | 26 pgTAP files |
| `tests.clear_authentication()` | Clears the fabricated claims and resets the role | 26 pgTAP files |

Because these ship in a **migration**, they inherit the migration contract: applied uniformly to every environment, in order, forever. They are live in cloud staging today (all migrations applied per #9's handoff) and would be applied unchanged to production project B the moment it is created.

### Why this is needed (and what it is not)

It is **not** a live hole, and the brief should not overstate it. The existing defenses are real and were deliberate:

- `EXECUTE` is revoked from `public`, `anon`, and `authenticated` on `authenticate_as` and `create_supabase_user`.
- `tests` is absent from `config.toml`'s `api.schemas`, so PostgREST offers no route to it.
- Only the owner (`postgres`) and equivalently-privileged roles retain `EXECUTE`.

An ordinary authenticated user cannot reach these functions today. The item is filed because an **auth-user factory resident in a production database is a standing escalation primitive**: it converts any future service-role key leak, any over-broad grant, or any `SECURITY DEFINER` mistake from a bounded unauthorized *read* into full account fabrication — attacker mints a confirmed account, then signs in as anyone. The function has no job to do in production, and the cost of removing it is lowest **before** production exists (#9 §4.5).

### Acceptance criteria

1. **A freshly provisioned cloud database** — every migration applied via `supabase db push`, no seed — ends with no `tests` schema, no `pgtap` extension, and no routine named `create_supabase_user`, `authenticate_as`, or `clear_authentication` in any schema. _(Reworded at `/architect`: the issue asked for this as a pgTAP test, which is not buildable — the database the suite runs against is the one that must have the fixtures. Discharged instead by AC#4 + AC#6.)_
2. **Cloud staging converges on that same end state** through the migration path alone. No Studio surgery, no hand-run SQL against a cloud project (non-negotiable #3).
3. **The local and CI path is unchanged in outcome.** `supabase db reset` followed by `supabase test db` runs the full pgTAP suite green (26 files), and `seed.sql`'s 8 `create_supabase_user()` calls still succeed.
4. **A regression guard fails CI** if any future migration reintroduces `pgtap`, the `tests` schema, or a `tests.*` helper under `supabase/migrations/`, naming the offending file. Without this, the next contributor who needs a fixture helper does the obvious thing and puts it back in a migration.
5. **The lockdown is preserved wherever the helpers do still exist.** `EXECUTE` stays revoked from `public`/`anon`/`authenticated`; `tests` stays out of `api.schemas`. This item removes the helpers from cloud; it does not relax them locally.
6. **The cloud end state is verified by a blocking step**, not on demand. An operator-run check against the linked project — staging now, production B at creation — asserts the AC#1 shape, and production provisioning is **not complete until it passes**. _(Raised from "verifiable on demand" at `/architect`: the failure mode that matters is a provisioning run interrupted between the create migration and the drop migration, which leaves the factory in place indefinitely and announces nothing. A check that is optional does not catch that.)_

### Edge cases

- **Seeding disabled.** If the helpers move to the seed path, then `supabase db reset --no-seed` (or `[db.seed] enabled = false`) leaves a database where the whole suite fails. It must fail with one legible message, not 26 files each reporting `schema "tests" does not exist`.
- **Seed file ordering.** `[db.seed] sql_paths` is an ordered list; `seed.sql` calls the helper at line 42, so any helper file must load strictly before it.
- **A developer's existing local stack.** Someone who does not reset keeps the old objects. Harmless — it converges on the next `db reset` — but it means "works on my machine" is not evidence here.
- **Shared local Docker stack.** Concurrent worktrees share one local Supabase stack; a `db reset` run to verify this item clobbers whatever another worktree has loaded. Verification needs an isolated stack (distinct `project_id` + ports), not the shared one.
- **Extension drop dependencies.** `drop extension pgtap` fails if anything depends on it; the drop must be written so a database that never had it, and one that does, both succeed.
- **Transient existence on a fresh cloud push.** If the original migration is left intact and a later one drops the objects, a fresh production push creates and then drops them inside the same run. Whether that window is acceptable is an `/architect` question, not a `/refine` one.
- **Two ids for one thing.** The pgTAP extension lives in schema `extensions`, not `public`; an absence check that only looks at `public` proves nothing.

### Priority

**POC-core.** Must land before Supabase project B (production) is created — #9 §4.5 is the step that creates it. After that point this stops being cheap hardening and becomes a change against a database holding real families' data.

### Consumers (cross-persona)

- Every UoW with pgTAP coverage — the helpers are how those suites create and impersonate users. Any change to how they are installed is felt by all 26 files.
- **cloud-environment-provisioning (#9)** — owns production project B's creation; AC#1 is a precondition on that step.
- **cicd-pipeline** — gains the AC#4 regression guard as a new check.

### Access scope (§5.4)

**None.** No table, policy, RLS predicate, auth-hook claim, or role/scope shape changes. The item moves test-only objects between install paths and adds a CI check. It touches access control only in the sense that it removes a latent escalation primitive from cloud databases.

### Explicitly out of scope (so a later item picks it up)

- **#28** — hardening default `TRUNCATE`/privilege grants on public-schema tables. Same "cloud defaults differ from local" family, separate item.
- **Replacing the fixture mechanism.** Provisioning cloud test data through the Auth Admin API instead of a database function is a different, larger decision. This item keeps the local mechanism exactly as it is and only changes where it is installed.
- **Rewriting `seed.sql`** to not need `create_supabase_user()`. The 8 call sites stay; the function stays available to them locally.
- **Retro-auditing whether the helpers were ever called in staging.** Worth knowing, but it is an operations question for #9, not a code change here.

---

## Open questions for `/architect` — resolved

1. **Migration history.** → **Drop forward; applied history stays immutable.** `20260709022932` is never edited; a new migration drops the surface; local/CI reinstall it from the seed path. Decided by Maulik, 2026-09-07, after an options review. The rejected alternative (neutering the original file) would have removed the transient window on a fresh production push at the cost of a migration log that no longer describes what staging executed. Recorded as ADR-2026-09-07 Decision 2–4.
2. **The shape of the proof.** → **Three checks, not one.** A static CI scan over `supabase/migrations/` (AC#4, the durable regression guard); an in-suite pgTAP assertion that the lockdown still holds where the fixtures do exist (AC#5); and a blocking operator-run cloud check (AC#6). The issue's single pgTAP test is dropped as unbuildable, and AC#1/#6 are reworded above.
3. **Governing ADR.** → **Yes.** [ADR-2026-09-07-test-fixtures-never-in-migrations](../../adr/2026-09-07-test-fixtures-never-in-migrations.md). The decision carves a class of object out of the *migrations apply uniformly to every environment* invariant, which is exactly the kind of thing that gets silently undone if it is not written down. #66's stale "ADR-0038" citation is corrected to point here.

---

## Architect review — sign-off

**Signed off 2026-09-07.** The brief is buildable as reworded. Three findings fed back into it:

- **CLI behavior was verified, not assumed** (as #66 asks). `supabase db push` does not run seeds by default but has an opt-in `--include-seed`; `db reset --linked` does run them. So the seed path is not *structurally* unreachable from cloud — it is absent from the default, automated path, and reachable only by an explicit flag that no runbook uses. The spec must not claim impossibility, and the ADR states the rule as Decision 5.
- **AC#6 was raised from advisory to blocking.** The interrupted-provisioning case is the real exposure, not the happy-path window.
- **No access-scope review needed.** The item changes no table, policy, predicate, claim, or role/scope shape; §5.4 impact is nil. It touches access control only by *removing* a latent escalation primitive. No `rls-adversarial-tester` pass is required beyond confirming the existing suite stays green — which AC#3 already demands.

---

## Design (detailed spec)

### The mechanism in one line

Three objects move from a migration (applied everywhere, forever) to the seed path (loaded only by `supabase db reset`), and a new migration removes them from the environments that already have them.

### Artifacts

| # | Artifact | Purpose |
|---|---|---|
| 1 | `supabase/migrations/20260907120000_drop_test_fixture_surface.sql` | Converges every environment on "no fixture surface". Staging loses the objects; a fresh cloud project creates them in `20260709022932` and drops them here in the same run; local/CI drop them here and reinstall from the seed path. |
| 2 | `supabase/seed/00_test_fixtures.sql` | The fixture surface, relocated verbatim — `pgtap`, `schema tests`, the three helpers, and their `REVOKE`s. Never loaded by `db push`. |
| 3 | `supabase/config.toml` — `[db.seed] sql_paths` | Declares the helper file **ahead of** `seed.sql`, which depends on it at 8 call sites. Order is documented CLI behavior. |
| 4 | `supabase/tests/0000_fixture_surface_precheck.sql` | Sorts first in the suite. Raises one explanatory error if the surface is missing, instead of 26 files each reporting `schema "tests" does not exist`. |
| 5 | `supabase/tests/005_fixture_surface_lockdown.sql` | AC#5 — asserts `EXECUTE` is still revoked from `public`/`anon`/`authenticated` on the two fabricating helpers, and that `anon` holds no `USAGE` on `tests`. |
| 6 | `scripts/_migration-fixture-checks.js` + `scripts/check-migration-fixtures.js` + `scripts/__tests__/migration-fixture-checks.test.ts` | AC#4 — the CI regression guard. Pure module + thin I/O wrapper + unit tests, matching the `_secret-checks.js` / `check-secrets.js` idiom already in the repo. |
| 7 | `supabase/checks/cloud_fixture_absence.sql` + runbook step | AC#6 — the blocking operator check, run against a linked project. |
| 8 | `.github/workflows/ci.yml` | Wires artifact 6 into the `app-tests` job (no Docker needed), beside `check-unistyles-config.js`. |

### 1 · The drop migration

```sql
-- ADR-2026-09-07: test-only DB objects install via the seed path, never a migration.
-- 20260709022932 is deliberately NOT edited — it is the record of what staging ran.
drop schema if exists tests cascade;
drop extension if exists pgtap;
```

`cascade` on the **schema** is correct and bounded — it removes the three helpers and nothing else, because nothing outside `tests` depends on them. `cascade` on the **extension** is deliberately *not* used: pgTAP lives in `extensions`, and a surprise dependency should fail loudly rather than silently cascade into an app object. Both statements are `if exists`, so the migration succeeds on a database that has the objects (staging), one that created them moments earlier in the same run (fresh cloud), and one that never had them.

### 2 · The seed helper file

The three function bodies, the `create schema`, the `create extension`, the `grant usage ... to authenticated`, and all four `REVOKE`/`GRANT` statements move across **unchanged**. This item relocates the fixture surface; it does not redesign or relax it, and the long comments explaining why `clear_authentication` keeps its `authenticated` grant travel with it.

### 3 · Behavior — what each caller sees

| Path | Before | After |
|---|---|---|
| `supabase db reset` (local) | Migration installs fixtures; seed uses them | Migration installs then drops them; seed file reinstalls, then `seed.sql` uses them |
| `supabase test db` (local/CI) | Green, 26 files | Green, 28 files (precheck + lockdown added) |
| `supabase db push` (cloud) | **Installs the fixture surface** | Applies the drop; end state carries no fixture surface |
| `supabase db push --include-seed` | Would install fixtures + ~60 fabricated users | Unchanged and still catastrophic — barred by rule (ADR Decision 5), not by mechanism |
| `supabase test db --linked` | Would run against cloud | Fails: pgTAP absent. Intended — §11.3 testing is local/CI |

### 4 · Data & RLS impact

**None.** No table, column, policy, predicate, index, trigger, RPC, auth-hook claim, or role/scope shape is touched. `auth.users` is not modified — the migration removes a function that *could write* to it. Existing rows in every environment are untouched, and no data is migrated, copied, or deleted.

### 5 · UI

**None.** No client surface.

### 6 · Edge cases — how each is handled

- **`--no-seed` / seeding disabled** → artifact 4 raises one explanatory error naming the cause and the fix, before any pgTAP function is called (so it works even though `plan()` itself is missing).
- **Seed ordering** → explicit array order in `sql_paths`; a glob is deliberately not used, since lexicographic luck is not a contract.
- **Stale local stack** → converges on the next `db reset`; verification must therefore run on a reset stack, not a warm one.
- **Shared local Docker stack across worktrees** → verification runs on an isolated stack (distinct `project_id` + ports), never the shared one.
- **Extension drop dependency** → non-cascading drop surfaces it as a loud failure.
- **Interrupted cloud provisioning** → AC#6's blocking check; this is the case it exists for.
- **pgTAP lives in `extensions`, not `public`** → the absence check (artifact 7) queries `pg_extension` by name and `pg_proc` across *all* schemas, not `public` alone.

### 7 · Out of scope (own later UoWs)

- **#28** — public-schema `TRUNCATE`/privilege grant hardening.
- **Replacing the fixture mechanism** with Auth Admin API-provisioned cloud test data.
- **Rewriting `seed.sql`** to not need `create_supabase_user()`.
- **Hook enforcement of `--include-seed`** — ADR Decision 5 states the rule and names the hook family that should carry it; wiring it into `.claude/hooks/` is a `cicd-pipeline` change, not this item's.

### 8 · Consumers (cross-reference, not duplicated — §12.12)

- All 26 existing pgTAP files: unchanged source, unchanged behavior. AC#3 is the proof.
- **cloud-environment-provisioning (#9)**: gains AC#6 as a blocking runbook step before production B is declared ready. **Landed in this PR** — `cloud-environment-provisioning.md` §4.5 now spells prod-B creation as three steps with the absence check blocking the third, plus an unticked acceptance box. It lands here rather than in #88 because the check file and the ADR exist only on this branch; a step added in #88 would have cited files not yet on `main`. Staging is remediated separately by **#89**, the rehearsal for the same operation against real data.
- **cicd-pipeline**: gains artifact 6 as an `app-tests` step.

---

## Sign-off

- `/refine` ✓ 2026-09-07
- `/architect` ✓ 2026-09-07 — ADR-2026-09-07-test-fixtures-never-in-migrations
- `/design` ✓ 2026-09-07
- **Human sign-off:** ✓ 2026-09-07 (Maulik) — design approved as written; `/plan` authorized
- `/plan` ✓ · `/migration` ✓ · `/build` ✓ · `/test` ✓ — 2026-09-07, 28 pgTAP files / 352 tests green, 91 vitest files / 701 tests green ([plan](test-fixture-isolation.plan.md))
- `/deploy-staging` — pending: cloud staging still carries the fixture surface until this migration is applied there, followed by the blocking `cloud_fixture_absence.sql` check


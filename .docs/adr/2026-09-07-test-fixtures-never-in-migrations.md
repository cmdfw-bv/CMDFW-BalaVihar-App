# ADR-2026-09-07-test-fixtures-never-in-migrations: Test-only database objects install via the seed path, never a migration

**Status:** Closed · **Category:** Infra/Process · **Date:** 2026-09-07 · **Deciders:** Maulik (issue [#66](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/66), option chosen 2026-09-07 after an options review in-session)

### Context

`supabase/migrations/20260709022932_enable_pgtap_and_test_helpers.sql` installs the pgTAP extension, the `tests` schema, and three fixture helpers. One of them, `tests.create_supabase_user(text)`, is `SECURITY DEFINER` and `INSERT`s directly into `auth.users` — fabricating a confirmed account with a fixed fake bcrypt hash, bypassing GoTrue entirely. Its sibling `tests.authenticate_as()` fabricates `request.jwt.claims`.

Because they ship in a **migration**, they inherit the migration contract — *applied uniformly to every environment, in order, forever*. They are live in cloud staging today, and would be applied unchanged to production project B the moment #9 §4.5 creates it: a database holding real minors' data (non-negotiable #6).

This is **hardening, not a live hole**, and the existing defenses were deliberate: `EXECUTE` is revoked from `public`, `anon`, and `authenticated`; the `tests` schema is absent from `config.toml`'s `api.schemas`, so PostgREST offers no route to it; only the owner (`postgres`) retains `EXECUTE`. No ordinary authenticated user can reach these functions.

The objection is about **blast radius, not reachability**. An auth-user factory resident in a production database is a standing escalation primitive: it converts any future service-role key leak, over-broad grant, or `SECURITY DEFINER` mistake from a bounded unauthorized *read* into full account fabrication — mint a confirmed account, then sign in as anyone. The function has no job to do in production, and removing it is cheapest **before** production exists.

Two constraints shape the solution:

1. **`supabase/seed/seed.sql` calls `tests.create_supabase_user()` at 8 sites.** The function cannot simply be deleted; it must remain present wherever the seed runs.
2. **Staging already applied the migration.** Any fix has to converge an existing database, not just shape new ones.

Verified against Supabase CLI 2.107.0 rather than assumed (issue #66 explicitly warns against assuming CLI behavior):

- `supabase db push` does **not** run seed files by default. It has an opt-in `--include-seed` flag.
- `supabase db reset --linked` **does** run seeds, and drops all user-created entities first.
- `[db.seed] sql_paths` is processed **in declared order** (documented behavior, not incidental).

### Options Considered

- **Drop forward; leave applied history intact (chosen)** — keep `20260709022932` byte-for-byte as the record of what ran; add a new migration dropping the `tests` schema and the `pgtap` extension; reinstall both from a seed-path file that only local/CI ever loads. Pros: the migration log stays a truthful record of what every environment executed (non-negotiable #3); every environment converges on the same end state through one ordered path; no environment-conditional logic to get subtly wrong. Cons: a fresh production push creates and then drops the objects within one run — see Consequences for the failure mode that matters.
- **Neuter the original migration as well** — rewrite `20260709022932`'s body to a no-op so a fresh production database never creates the objects at all, plus the drop migration to converge staging. Pros: no transient window anywhere. Cons: the file on disk stops describing what staging actually executed, so the migration log becomes a partly fictional record and a future reader diffing repo against staging finds an unexplained discrepancy. Rejected: a decision *log* that is edited after the fact stops being evidence, and this repo's non-negotiable #3 leans on migration history being exactly that.
- **Guard the function bodies** — leave the migration alone; make `create_supabase_user`/`authenticate_as` raise unless a local-only marker is present. Cons: the `SECURITY DEFINER` function still exists in production, which is the actual objection; and a guard predicate is one bad condition away from being no guard, with nothing to notice. Rejected as the weakest of the three.

### Decision

1. **Test-only database objects are installed through the seed path, never through a migration.** This is the durable invariant. It applies to the pgTAP extension, the `tests` schema, and any future fixture helper — anything whose only consumer is a test or a local seed.
2. **`20260709022932` is never edited.** It stands as the record of what staging ran.
3. **A new migration drops `schema tests cascade` and `extension pgtap`**, written so it succeeds both on a database that has them (staging) and one that never did (a fresh production push, where the create-then-drop happens in one run). Every environment converges on "absent" through the same ordered path.
4. **A seed-path file reinstalls the fixture surface for local and CI**, declared in `[db.seed] sql_paths` strictly ahead of `seed.sql` (which depends on it at 8 call sites). The helper definitions and their `REVOKE`s move across unchanged — this ADR relocates the fixture surface, it does not redesign or relax it.
5. **Seeding is never pointed at a cloud project.** `supabase db push --include-seed` and `supabase db reset --linked` are the two commands that would carry the fixture surface (and ~60 fabricated auth users) into a cloud database. Neither appears in any runbook; this ADR makes that a stated rule rather than an implicit habit, and it is enforced by the migration-guard hook family (§12.1) rather than by memory.
6. **The regression guard is a CI check, not a convention.** A static scan over `supabase/migrations/` fails the build, naming the offending file, if any migration reintroduces pgTAP, the `tests` schema, or a `tests.*` helper. Decision 1 is otherwise one contributor away from being undone: the obvious place to put a new fixture helper is exactly where the old one was.
7. **Production provisioning is not complete until the cloud end-state check passes.** An operator-run check asserting no `tests` schema, no `pgtap` extension, and no fixture routine in any schema is a **blocking** step in #9's runbook — not a post-hoc verification.

### Consequences

- **The failure mode that matters is an interrupted provisioning run, not the happy path.** On a fresh production push the objects exist between the create migration and the drop migration. If that run dies in between — timeout, network drop, Ctrl-C — the database is left holding the factory indefinitely, and a half-applied run does not announce where it stopped. Decision 7 exists specifically to catch this; that is why the check blocks rather than reports. On the happy path the window is seconds, on a database with no users, no data, and no application traffic, where the only party who can act is the operator already holding the database password.
- **The pgTAP suite now depends on seeding.** `supabase db reset --no-seed`, or `[db.seed] enabled = false`, yields a database where all 26 test files fail. The seed helper file must fail with one legible message rather than 26 files each reporting `schema "tests" does not exist`.
- **`supabase test db --linked` against a cloud project will fail** once the drop lands, because pgTAP will not be there. That is the intended shape, not a regression — adversarial RLS testing runs against local/CI, per §11.3.
- **Local `db reset` now creates, drops, and reinstalls the fixture surface** on every run. Cost is milliseconds; correctness is unaffected.
- **A reader of production's migration history will see a create followed by a drop** and wonder why. This ADR is the answer, and the drop migration comments point at it.
- **Issue #66 cites "ADR-0038" as governing; that citation is wrong** — ADR-0038 is `class-meetings-generated-by-trigger`, and no ADR describing local-only test fixtures existed. This ADR is the real one; #66 is corrected to reference it.
- **#66's stated acceptance criterion is not buildable as worded.** It asks for a pgTAP test proving a cloud-shaped database has no `tests` schema, but the database the suite runs against is precisely the one that must have it. The proof is redistributed across Decisions 6 and 7 plus an in-suite assertion that the lockdown holds where the helpers do exist.
- **Scope held:** no table, policy, RLS predicate, auth-hook claim, or role/scope shape changes. Complements #28 (public-schema grant hardening), same "cloud defaults differ from local" family. Supersedes nothing.

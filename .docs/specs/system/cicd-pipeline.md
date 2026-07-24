# System — CI/CD pipeline

> **owner:** System · **consumers:** all (delivery pipeline — every persona UoW merges through this) · **scope:** CI/CD + migration-guard/promotion gates · **governing ADR:** [ADR-0024](../../adr/0024-cicd-github-actions-branch-protection.md) · **covers:** doc 3 §6.3 (migration workflow), §12.1 (GOVERN hooks), §12.3 (Promotion stage), §12.6 (convergence funnel)

**Stage:** 1 — Design ✓ (this section). `/refine` ✓ → `/architect` ✓ (ADR-0024) → `/design` ✓ (ADR-0025 addendum) → `/plan` ✓ ([cicd-pipeline.plan.md](cicd-pipeline.plan.md)) → Built. Next is `/test`.

---

## Requirements (refined)

### User story
**As the** System, **I want** a GitHub Actions CI workflow that independently re-runs the pgTAP RLS suite, app unit/integration tests, and a secret/PII scan on every pull request, and blocks merging to `main` (and `staging`) until it's green, **so that** the delivery pipeline's safety gates hold even when a maintainer or Claude Code session skips, forgets, or can't run `/test` locally — closing the gap left by the existing `.claude/hooks/` gates, which only fire *inside* a Claude Code session and key off local, gitignored marker files (`.claude/.tests-passed`, `.claude/.rls-tests-passed`) that a direct GitHub edit or a different machine never produces.

### Why this is needed (not duplicate work)
`migration-guard` and `pr-guard` (`.claude/hooks/`) already gate *local* actions — pushing a remote migration, or running `gh pr create` — but only within a Claude Code session, and only by trusting a marker file no one outside that session can see or verify. Nothing today stops:
- A PR opened by editing directly on github.com (no Claude session, no hook).
- A stale marker from an earlier, now-changed source tree (hooks re-check the content hash, but only if a hook fires at all).
- A human clicking "Merge" on GitHub without re-running `/test`.

CI is the **server-side, non-bypassable** version of the same guarantee doc 3 §11.3/§12.1 already commits to — enforced by GitHub itself, not by trusting the local tool-call stream.

### Acceptance criteria
1. **Workflow trigger.** A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every `pull_request` targeting `main` or `staging` — using the default `opened`/`synchronize`/`reopened` event types so the **full suite runs the moment a PR is opened** and again on every push to that PR branch — and on every direct push to `main`/`staging`.
2. **App tests.** Runs `npm ci` (pinned lockfile install, matches repository-bootstrap's engine-strict pin), then `npm run lint`, `npm run typecheck`, `npm test` (vitest). Any failure fails the job.
3. **Local Supabase + pgTAP.** Spins up the local Supabase stack in the runner (Supabase CLI + Docker, same as `supabase start` / `db reset` locally), applies all `supabase/migrations/*.sql`, seeds via `supabase/seed/`, then runs the pgTAP suite in `supabase/tests/` via the project's existing test entry point. Any failing pgTAP test fails the job. This is the CI-side mirror of what `/test` step 1 and the `rls-adversarial-tester` subagent's pass/fail already gate locally (§12.4) — CI proves it independent of any Claude session having run.
4. **Secret/PII backstop scan.** A step that scans the PR diff for service-role-key / VAPID-private-key / SES-credential patterns and obvious PII-shaped payloads outside `netlify/functions/`, independent of the local `secret-scan` hook (doc 3 §3, §12.1 non-negotiable #2). Fails the job on a hit.
5. **Required status check.** GitHub branch protection on `main` (and `staging`) requires this workflow green before merge is allowed — configured as part of this UoW, not left as a follow-up. No PR can merge red, regardless of what any local hook did or didn't catch.
6. **No secrets committed for CI itself.** Whatever CI needs (e.g., a Supabase CLI access token if cloud-linking is ever required for this workflow — not expected, since this runs entirely against a throwaway local/Dockerized Supabase instance, not staging/prod) lives in **GitHub Actions repo secrets**, never in the workflow YAML or committed files. If no secret is needed (current expectation — everything runs local/ephemeral in the runner), state that explicitly in `/design` rather than provisioning one speculatively.
7. **Fast enough to not block flow.** Non-technical maintainers rely on this running unattended; document the expected runtime and cache `node_modules`/npm where straightforward, but do not over-engineer caching if it adds fragility — correctness over speed for a 50–150-user pilot.
8. **Failure legibility.** A red CI run's GitHub check summary names which stage failed (lint/typecheck/unit/pgTAP/secret-scan) so a non-technical maintainer or Claude Code session knows where to start, mirroring `/test`'s "log each failure as a GitHub issue" convention (doc 3 §12.3) — `/design` decides whether CI itself opens the issue or whether that stays a human/Claude follow-up.
9. **Converges with Promotion, doesn't replace it.** This item does **not** change `/deploy-staging` or `/promote` behavior (still human-approved, still gated by the local `migration-guard` hook for the actual prod migration push, §12.1). It adds the merge-time gate *before* a PR can even land on `main` — the funnel doc 3 §12.6 describes.

### Edge cases
- **Docker unavailable in the runner** → use `supabase/setup-cli` (or equivalent official action) with GitHub-hosted runner's built-in Docker; if pgTAP setup itself is flaky in CI, that's a `/build`/`/plan`-stage risk to flag, not a reason to skip the check.
- **Migration-only PRs with no app code changes** → still run the full workflow; a migration alone can break RLS regardless of app code.
- **Docs-only PRs (`.docs/**`, `*.md`)** → `/design` may propose a path-filtered fast path (skip pgTAP/app tests, keep secret-scan) — flag as an open design question, not decided here.
- **Long-running or flaky pgTAP suite** → CI failure must be actionable (which test, which file), not a bare non-zero exit.
- **Branch protection lockout** → whoever configures branch protection needs GitHub repo-admin rights; note as a one-time human setup step, not something Claude Code can do unattended (no `gh` API scope for repo settings is assumed available by default).
- **Fork PRs / external contributors** → not expected for this 3-maintainer team, but if it ever happens, secrets must never be exposed to a fork's workflow run (GitHub's default `pull_request` trigger already protects secrets from forks — confirm in `/design`).

### Priority
**POC-core, foundational** (per issue #8 / `_index.md`) — doc 3 §6.3 names the migration-guard gate as part of the migration workflow, and §12.6 names Promotion as the convergence funnel; both currently rely entirely on trust in local Claude Code sessions. This closes that gap before more parallel feature UoWs converge on `main`.

### Consumers (cross-persona)
**All** — every persona feature UoW's PR into `main` passes through this gate. No persona-specific behavior.

### Access scope (§5.4)
**N/A — infra/pipeline.** No tables, rows, or RLS policies are created. This UoW runs *against* the existing RLS/pgTAP suite as a consumer/enforcer, not a producer of schema.

### Explicitly out of scope (so a later item picks it up)
- Cloud Supabase project A/B provisioning + per-context env wiring (§7.1–§7.2) — separate `cloud-environment-provisioning` item, already tracked in `_index.md`.
- Changing `/deploy-staging` / `/promote` mechanics — those stay human-invoked, local, `gh`-CLI-based.
- Native (EAS) build CI — post-POC (§7.3).
- Sentry/error-monitoring wiring — separate `error-monitoring-infra` item.

---

## Open questions for `/architect` — resolved

1. **ADR needed?** Yes — recorded as **[ADR-0024](../../adr/0024-cicd-github-actions-branch-protection.md)**, extending (not superseding) ADR-0008. Required branch-protection status checks move enforcement from "local hook, trust-based" to "GitHub-enforced, non-bypassable" — a real shift in the delivery system's security model, worth recording even though the *intent* (§6.3/§11.3/§12.1) was always this.
2. **No cloud Supabase credentials expected** — confirmed consistent with §6.4 (seed data is synthetic, generated fresh) and §7.1 (local = Supabase CLI/Docker, throwaway). Architect sign-off agrees with the brief's expectation; final confirmation stays with `/design` per acceptance criterion #6 — if `/design` finds a credential is actually needed, that reopens AC#6 and ADR-0024's "no secrets" consequence.

## Architect review — sign-off

- **Owner/consumers/scope** (§12.12): sound as stated — System-owned, all-persona consumer, infra/pipeline scope, no RLS/table surface. No changes.
- **Residency/minors'-data check:** CI touches only synthetic seed data (§6.4), never real minors' data, so the GitHub-hosted runner's region is not a residency-guard concern (§3) — recorded as an explicit ADR-0024 consequence so this isn't re-litigated later.
- **Precondition flagged for `/design`:** branch-protection configuration is a one-time human repo-admin step (already noted as an edge case in this brief) — carry it forward as an explicit `/design` deliverable/handoff, not a silent assumption.
- **No bounce-back needed.** Brief is sufficiently specified to proceed to `/design`.

---

## Scope addendum (recorded at `/design` — ADR-0025)

Two `.docs/CI_rules.md` items not in the original ACs above are folded into this UoW, per [ADR-0025](../../adr/0025-cicd-residency-scan-and-codeowners.md) — both local hooks already claim this coverage exists (`residency-guard.js`/`secret-scan.js` comments cite `CI_rules.md` §2.1/§2.4), so shipping CI without them would leave that claim false for residency specifically (`secret-scan.js`'s half is already covered by AC#4 above):

10. **Residency/tracker-dependency scan.** A CI job scans `package.json`/lockfile dependencies against an analytics/marketing-SDK denylist, and source text for tracker hostnames, reusing `residency-guard.js`'s existing denylist as the single source of truth. Fails closed. Required status check like ACs 2–4.
11. **CODEOWNERS-required review.** A `CODEOWNERS` file requiring review on `supabase/migrations/**`, `supabase/tests/**`, `netlify/functions/**`, enforced via branch protection's "Require review from Code Owners" — configured as part of the same one-time human repo-admin step as AC#5.

Explicitly **not** folded in (see ADR-0025 consequences): a pgTAP "coverage floor" check (new policy/table without a matching test fails the build) — a heuristic diff-parsing check with real false-positive risk, left as a `CI_rules.md` open item, not built here.

---

## Design (detailed spec)

> **Design decisions captured this pass:**
> 1. **Four parallel required jobs, not one monolithic job** — `app-tests`, `db-and-rls`, `secrets-pii`, `residency-scan` — so a red GitHub check names the failing stage directly (AC#8) without parsing a single job's combined log.
> 2. **Secret scanning: gitleaks CLI binary directly, not the `gitleaks-action` wrapper.** The wrapper's PR-annotation features require a paid `GITLEAKS_LICENSE` for GitHub-Organization-owned repos. This repo was originally a personal-account repo (`mehtamaulik-creator/CMDFW-BalaVihar---Pilot-App`), so the wrapper's free tier would have applied at the time this decision was made — but it has since been transferred to the `cmdfw-bv` org and renamed to `cmdfw-bv/CMDFW-BalaVihar-App` (2026-07-23), so the paid-license gate would now actually apply if we ever switched off the raw CLI to the wrapper. No code change is needed today since we already run the CLI directly, but pinning to the raw CLI is what keeps the license question from ever becoming load-bearing. The open-source `gitleaks` CLI itself (MIT-licensed) has no such gate; running it directly keeps ADR-0024's "no CI secrets expected" consequence true.
> 3. **No docs-only fast path.** Every job runs on every PR regardless of which paths changed — AC#7 already prioritizes correctness over speed for a 50–150-user pilot, and a path filter risks silently skipping RLS/app tests on a PR that *should* have included a migration but didn't.
> 4. **CI does not auto-file GitHub issues on failure (AC#8).** The check summary names the failing stage; a maintainer or the next Claude Code session files the issue via `/test`'s existing convention. Avoids issue-spam from reruns/force-pushes on the same PR and the de-dup logic that would require.
> 5. **No CI secrets of any kind are provisioned.** Every job runs against ephemeral, local, or repo-committed state — confirms ADR-0024 AC#6 and ADR-0025's consequence.

### Workflow structure (`.github/workflows/ci.yml`)

**Trigger:**
```yaml
on:
  pull_request:
    branches: [main, staging]
    # default types: opened, synchronize, reopened — full suite on open + every push to the PR branch
  push:
    branches: [main, staging]
```

**Jobs (all four required as branch-protection status checks; `secrets-pii` and `db-and-rls` also excluded from admin bypass per `CI_rules.md` §4 — security-critical, no one waves them through):**

| Job | Steps | Maps to |
|---|---|---|
| `app-tests` | `actions/setup-node@v4` (node-version from `.nvmrc`, `cache: npm`) → `npm ci` → `npm run lint` → `npm run typecheck` → `npm test` (vitest) | AC#2 |
| `db-and-rls` | `supabase/setup-cli@v1` → `supabase start` → `supabase db reset` (applies `supabase/migrations/*.sql` + `supabase/seed/`) → `supabase test db` (runs `supabase/tests/*.sql` pgTAP) | AC#3 |
| `secrets-pii` | checkout with `fetch-depth: 0` (full history) → install pinned `gitleaks` CLI binary → `gitleaks detect --redact --exit-code 1` over history + working tree → a short Node script porting `secret-scan.js`'s VAPID-regex + decode-JWT-and-check-`role=service_role` logic (gitleaks can't express "decode base64, inspect JSON payload") → path/extension block for `*.csv`/`*.xlsx`/`*.xls`/`enrollment*`/`roster*`/`*.vcf`/`.env*` (except `.env.example`) outside `supabase/seed/` | AC#4, ADR-0024 |
| `residency-scan` | `node scripts/check-trackers.js` — imports `residency-guard.js`'s existing tracker-hostname denylist (single source, no drift) and additionally checks `package.json`/lockfile dependency names against an analytics/marketing-SDK denylist | ADR-0025 |

Every job runs with `set -euo pipefail` (or the Action-equivalent) — a check that can't run must fail closed, not silently pass (mirrors `CI_rules.md` §1.1).

**Caching:** `actions/setup-node@v4`'s built-in `cache: npm` keyed on `package-lock.json` — no extra caching action; Docker/Supabase image layers are not cached (AC#7: don't over-engineer for a pilot-scale PR volume).

**Expected runtime:** jobs run in parallel; `db-and-rls` (Docker pull + migrations + pgTAP) is the long pole at roughly 2–4 min, `app-tests` roughly 1–3 min, `secrets-pii`/`residency-scan` roughly &lt;1 min each — total wall-clock roughly 3–5 min per PR push, well within AC#7's "fast enough to not block flow."

### Behavior — the maintainer-facing surface

1. Opening or pushing to a PR against `main`/`staging` triggers all four jobs automatically — no maintainer action.
2. GitHub's PR checks list shows each job by name; a red job's summary states which command failed (lint/typecheck/`npm test`/pgTAP file/gitleaks finding/tracker-scan finding) — satisfies AC#8's failure-legibility requirement without any custom summary-formatting step (GitHub's native per-job status already provides this once jobs are split, per design decision #1).
3. Branch protection on `main` and `staging` requires all four green before the "Merge" button is enabled — configured by a human repo-admin as a one-time step (handoff below), not built by this UoW's code.
4. A maintainer or Claude Code session sees a red check, reads the named failing job, and either fixes it or (per `/test`'s convention) files a GitHub issue before debugging — CI does not do this automatically (design decision #4).

**One-time human handoff (repo-admin required, cannot be done by Claude Code unattended — no `gh` API scope for repo settings assumed by default):**
- Branch protection on `main` and `staging`: require a pull request before merging; require status checks `app-tests`, `db-and-rls`, `secrets-pii`, `residency-scan` to pass; require branches to be up to date before merging; require review from Code Owners; do not allow administrator bypass on `db-and-rls`/`secrets-pii`.
- Fill in a real GitHub handle/team in `CODEOWNERS` (shipped with a placeholder `@<maintainer-handle>` — inventing a specific handle isn't this UoW's call).

### Data & RLS impact
**None — this UoW produces no schema/RLS.** It runs the *existing* pgTAP suite (`supabase/tests/`) against migrations already in the repo, as a consumer/enforcer (per the original brief's Access scope section). `db-and-rls`'s `supabase db reset` uses only `supabase/seed/`'s synthetic data (§6.4) — no real minors' data ever reaches a CI runner.

### UI
**N/A.** No app screens. The only "UI" is GitHub's native PR-checks list and branch-protection merge-button gating — no custom dashboard or summary formatting is built.

### Edge cases
- **Docker unavailable in the runner** → `supabase/setup-cli` + the GitHub-hosted runner's built-in Docker daemon (confirmed available on `ubuntu-latest`); not expected to be flaky, but if pgTAP setup itself proves unreliable in CI, that's a `/build`-stage risk to fix, not a reason to skip the check.
- **Migration-only PRs** → still run all four jobs; a migration alone can break RLS regardless of app-code changes (per original brief).
- **Docs-only PRs** → no fast path (design decision #3) — full suite always runs.
- **Long-running or flaky pgTAP suite** → `supabase test db`'s native per-file/per-test output is already actionable; no extra wrapping needed.
- **Branch protection / CODEOWNERS handle not yet configured** → both are one-time human repo-admin steps, explicitly handed off above, not silently assumed done.
- **Fork PRs** → not expected for this 3-maintainer team; GitHub's default `pull_request` trigger already withholds secrets from fork-run workflows — moot regardless, since no job in this design uses a secret.
- **gitleaks binary install fails / version yanked** → pin an exact release tag; a failed install step fails the job closed (per `CI_rules.md` §1.1), never silently skips the scan.
- **New synthetic seed file matches the PII path/extension denylist** (e.g. a `.csv` fixture) → excluded only when it lives under `supabase/seed/`; anywhere else, the same filename still fails the job.
- **`residency-scan` denylist drift** → the script imports `residency-guard.js`'s existing constant rather than maintaining a second copy, so the local hook and CI can't silently disagree.

### Out of scope (own later UoWs / explicitly not adopted)
- Cloud Supabase project A/B provisioning + per-context env wiring (§7.1–§7.2) — separate `cloud-environment-provisioning` item.
- Changing `/deploy-staging`/`/promote` mechanics — stay human-invoked, local, `gh`-CLI-based. **`CI_rules.md` §2.2/§5's CI-driven `deploy-prod` job is not adopted** (ADR-0025 consequence) — superseded prior art, not a pending item.
- Native (EAS) build CI — post-POC (§7.3).
- Sentry/error-monitoring wiring — separate `error-monitoring-infra` item.
- pgTAP "coverage floor" script (new policy/table without a matching test fails the build) — `CI_rules.md` §2.3's idea, explicitly not folded in (ADR-0025) given its false-positive risk; remains a `CI_rules.md` open item.
- Auto-filing GitHub issues from CI on failure (design decision #4).

### Consumers (cross-reference, not duplicated — §12.12)
Every persona feature UoW's PR into `main` passes through this gate — no persona-specific behavior. `csv-enrollment-import` and `auth-hook-and-identity` (both already `/test`-green and awaiting `/promote`/`/deploy-staging`) are the first PRs this gate will apply to once merged.

---

## Sign-off
- [x] **Human sign-off on this design, incl. ADR-0025 scope addendum** (2026-07-11, shree.srinivas@outlook.com) → ready for **`/plan`**.

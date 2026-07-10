# CI Rules — Enforcing the Non-Negotiables in CI (Future)

**Date:** 2026-06-19
**Status:** **Planned / future — NOT yet implemented.** There is no `.github/workflows/` in the repo today. This document specifies the CI layer to build when the team is ready. Until it exists, the [`.claude/` hooks](../.claude/settings.json) are the *only* automated checks, and they run **only inside a Claude Code session** — see "Why CI" below.

> **Why a separate doc:** the project's non-negotiables (RLS, no secrets/PII, US residency, TDD — [3_ARCHITECTURE.md](3_ARCHITECTURE.md) §12.1) are currently enforced by local PreToolUse hooks. Those hooks fire only when Claude Code is the thing making the edit. Any commit made another way — the GitHub web UI, a teammate's IDE, a direct `git push` — bypasses every check. CI runs regardless of *who* or *what* made the change, so it is where the non-negotiables become real gates instead of session-local reminders.

---

## 1. The enforcement model — three layers, one principle

The principle: **a control is only as strong as the layer that can't be skipped.** Defense in depth, outermost-in:

| Layer | Runs when | Role | Failure mode |
|---|---|---|---|
| **`.claude/` hooks** (today) | Only during a Claude Code session | Fast local *preview* — catch mistakes early, give the builder immediate feedback | **Fail-open** (never brick a session) |
| **CI** (this doc) | On every push / pull request, for everyone | The real **merge gate** — nothing reaches `main` without passing | **Fail-closed** (a broken check blocks the merge) |
| **Database RLS** (always) | On every query in prod | Last line — access is enforced in Postgres no matter what client code does (§5) | Default-deny |

CI is the middle layer and the one this doc defines. Local hooks stay as a convenience; **CI is authoritative.** Where the two disagree, CI wins.

### 1.1 The single most important difference: CI fails **closed**
The local hooks deliberately `exit 0` on any internal error so a session is never bricked. **CI must do the opposite.** If a check cannot run — bad input, missing tool, thrown error — the job must **fail the build**, not pass it. A check that silently passes on error is worse than no check, because the team will trust it. Every job below runs with `set -euo pipefail` (or equivalent) and treats "couldn't determine" as "blocked."

---

## 2. Required checks (each maps to a non-negotiable)

Every check below must be a **required status check** on `main` (see §4). Each hardens a local hook that we have verified is bypassable in its current form.

### 2.1 Secret + PII scan — *no secrets or PII in Git* (§12.1 #2, §3, §11)
**Replaces / hardens:** [`secret-scan.js`](../.claude/hooks/secret-scan.js), which only matches four exact key formats, misses a bare key token, and never inspects shell commands (`git add .env`).

- **Secrets:** run a dedicated scanner (e.g. `gitleaks`) over the **diff and full history of the PR branch**, not just changed file *content*. This catches keys added by any means, including a file staged via the shell.
- **PII files:** block by path/extension anything that commonly carries enrollment data or minors' names — `*.csv`, `*.xlsx`, `*.xls`, `enrollment*`, `roster*`, `*.vcf`. Synthetic seed data belongs only in `supabase/seed/` and must be reviewed.
- **Env files:** block any `.env*` except `.env.example` (values stripped).
- **Fail-closed:** any finding fails the job; the scanner failing to run also fails the job.

> Secrets live **only** in `netlify/functions/` env vars (the service-role key, VAPID private key, SES creds) — never in the repo, per [functions-secrets rule](../.claude/rules/functions-secrets.md). CI enforces the "never in the repo" half.

### 2.2 Migration gate — *prod migration requires a passing RLS suite* (§6.3, §11.3)
**Replaces / hardens:** [`migration-guard.js`](../.claude/hooks/migration-guard.js), which (verified) only blocks when the command literally contains the string `prod`, and is bypassed by `supabase db push --project-ref <ref>` or `--linked`. It also trusts a context-free `.claude/.rls-tests-passed` marker that can be stale.

CI removes the string-matching entirely. **Production is deployed by CI, not by a human running `supabase db push`.** The gate becomes:

1. On a PR that touches `supabase/migrations/**`, spin up a disposable Postgres, run `supabase db reset` (applies all migrations + seed).
2. Run the **full pgTAP RLS suite** (`supabase/tests/**`) — see §2.3.
3. **Only the production deploy job** (triggered on merge to `main`, gated on the green test job) runs the prod migration push against the prod project ref, which is stored as a CI secret. No human invokes the prod push; there is no string to match or marker to forge.
4. Every migration PR must include its matching pgTAP test, or the job fails ([migration skill](../.claude/skills/migration/SKILL.md) step 2).

### 2.3 RLS adversarial tests — *access control is RLS, minors' data must not leak* (§5, §11.3)
**New in CI (no local hook equivalent — [`schema-guard.js`](../.claude/hooks/schema-guard.js) is advisory-only and never blocks).**

- Run the pgTAP suite covering **role × scope** for all 7 personas, including **after an active-role switch** (the [`rls-adversarial-tester`](../.claude/agents/rls-adversarial-tester.md) scenarios).
- The suite must assert **no cross-scope read/write**, with explicit coverage that minors' data is never exposed outside the authorized scope.
- **Coverage floor:** a migration that adds a table/policy without a corresponding role×scope test fails the job (default-deny applies to test coverage too).
- This is the **highest-severity gate.** It is required and cannot be overridden by review.

### 2.4 Residency / tracker scan — *US residency, no marketing or analytics trackers* (§3, §10.4)
**Replaces / hardens:** [`residency-guard.js`](../.claude/hooks/residency-guard.js), which (verified) only scans `.ts/.js` file *content* against a hardcoded domain list — it misses any non-listed tracker and any tracker added via `package.json`.

- Scan **dependencies** (`package.json` / lockfile) against a denylist of analytics/marketing SDKs, not just source text.
- Scan source for tracker hostnames, but treat the denylist as a floor — pair it with a **review requirement** for any newly added third-party network call (§2.6), since no static list is complete.
- Any new external processor must be US-resident under DPA; document it in the PR. CI flags new outbound hosts for human confirmation rather than pretending the list is exhaustive.

### 2.5 Test suite + TDD evidence — *TDD is non-negotiable* (§12.1 #4)
- Run the full app unit/integration suite (`npm test`) **and** the pgTAP suite. All green required.
- The suite is the gate; CI does not try to police "test written first," but a PR that adds implementation with **no accompanying test** for new behavior should be flagged for review (§2.6). TDD discipline is enforced by the [build](../.claude/skills/build/SKILL.md) / [test](../.claude/skills/test/SKILL.md) skills + human review; CI enforces "tests exist and pass."

### 2.6 Required human review on security-critical changes (§12)
- Use a `CODEOWNERS` file to require review on: `supabase/migrations/**`, `supabase/tests/**`, the auth hook, `netlify/functions/**`, and any change touching `consents` / `audit_log`.
- This is the CI-level home of the "plan → ask → human-validate" principle: critical decisions are deferred to a human, enforced by branch protection, not by trust.

---

## 3. Mapping: local hook → CI check

| Non-negotiable (§12.1) | Local hook (today) | Verified weakness | CI check (this doc) |
|---|---|---|---|
| No secrets / PII in Git | `secret-scan.js` | 4 regexes only; misses bare token + shell-staged files; no PII | §2.1 secret + PII scan (history + paths) |
| Prod migration needs RLS tests | `migration-guard.js` | matches literal `prod`; bypassed by `--project-ref` / `--linked`; stale marker | §2.2 CI-owned deploy gated on §2.3 |
| RLS is the access control | `schema-guard.js` (advisory) | never blocks | §2.3 pgTAP role×scope, required + coverage floor |
| US residency / no trackers | `residency-guard.js` | `.ts/.js` content only; fixed domain list | §2.4 dep + source scan + review |
| TDD | (none) | — | §2.5 suite green + new-code-needs-test review |
| Minors' data minimized + audited | (none, partial in schema-guard) | advisory | §2.3 + §2.6 CODEOWNERS on consent/audit |

---

## 4. Branch protection (the part that makes checks mandatory)

Status checks only matter if they're **required**. On the GitHub repo settings for `main`:

- **Require a pull request before merging** — no direct pushes to `main`.
- **Require status checks to pass before merging**, and mark each §2 job as **required** (especially §2.3 RLS tests).
- **Require branches to be up to date before merging** — checks run against the merge result, not a stale branch.
- **Require review from Code Owners** (§2.6).
- **Do not allow bypass** for administrators on the security-critical checks. The whole point is that no single person — including a maintainer — can wave a change through.

Without branch protection, every job in §2 is just advice. This section is what turns advice into a gate.

---

## 5. Implementation skeleton (for when CI is built)

Illustrative only — a GitHub Actions starting point. Pin action versions and store all credentials (prod project ref, deploy tokens) as repository secrets, never in the workflow file.

```yaml
# .github/workflows/ci.yml  (FUTURE — not yet present)
name: ci
on:
  pull_request:
  push:
    branches: [main]

jobs:
  secrets-pii:                 # §2.1
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pin>
        with: { fetch-depth: 0 }     # full history for secret scan
      - name: gitleaks
        run: gitleaks detect --redact --exit-code 1
      - name: block PII / env files
        run: |
          set -euo pipefail
          if git diff --name-only origin/main... | grep -E '\.(csv|xlsx?|vcf)$|^enrollment|^roster|\.env($|\.)'; then
            echo "::error::PII or env file detected"; exit 1
          fi

  db-and-rls:                  # §2.2 + §2.3 + §2.5 (pgTAP)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pin>
      - run: supabase start
      - run: supabase db reset            # apply migrations + seed
      - run: supabase test db             # pgTAP role × scope — REQUIRED
      # coverage floor: fail if a new policy/table lacks a matching test (custom script)

  residency:                   # §2.4
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pin>
      - run: node scripts/check-trackers.js   # scans deps + source, fails closed

  app-tests:                   # §2.5
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pin>
      - run: npm ci
      - run: npm test

  deploy-prod:                 # §2.2 — runs ONLY on merge to main, after gates pass
    needs: [secrets-pii, db-and-rls, residency, app-tests]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production    # add required reviewers on this environment too
    steps:
      - uses: actions/checkout@<pin>
      - run: supabase db push --project-ref "${{ secrets.SUPABASE_PROD_REF }}"
      - run: npx netlify deploy --prod
```

---

## 6. Notes for non-technical maintainers

- **You don't run these checks — GitHub does, automatically, on every pull request.** Green check = safe to merge. Red check = do not merge; read the message or ask Claude to explain it.
- **CI is the seatbelt; the `.claude/` hooks are the dashboard warning light.** The light helps while you drive, but the seatbelt is what actually protects you. Until CI exists, you only have the warning light — and it can be bypassed.
- **Never turn off a required check to "get unblocked."** A red RLS check (§2.3) means a change could expose someone's data — most importantly a child's. Stop and get review.
- **The prod deploy is fully automated (§2.2/§5).** Nobody should be running the prod migration push by hand once CI exists. If you find yourself doing that, something is wrong — ask first.

---

## 7. Open items before building this

1. Confirm the test commands (`supabase test db`, `npm test`) match the scripts that land with the app code (none exist yet — the repo currently has no `package.json` or `supabase/`).
2. Decide the secret-scanner tool (`gitleaks` assumed) and add its config.
3. Write `scripts/check-trackers.js` to scan dependencies, not just source text (closing the verified `residency-guard.js` gap).
4. Author the `CODEOWNERS` file (§2.6).
5. Add the RLS coverage-floor script so a new policy without a test fails the build (§2.3).

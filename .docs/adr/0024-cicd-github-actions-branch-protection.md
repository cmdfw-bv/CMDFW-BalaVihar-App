# ADR-0024: CI/CD — GitHub Actions required status check as server-side enforcement layer (extends ADR-0008)

**Status:** Closed · **Date:** 2026-07-11 · **Deciders:** Project owner + architect

### Context
The local GOVERN hooks (`secret-scan`, `migration-guard`, `schema-guard`, `residency-guard`, `pr-guard` — §12.1) only fire **inside a Claude Code session** and key off gitignored local marker files (`.claude/.tests-passed`, `.claude/.rls-tests-passed`). Nothing today stops a PR opened by editing directly on github.com, a stale marker from an earlier source tree, or a human clicking "Merge" without re-running `/test`. ADR-0008 chose local hooks specifically for "no external CLI dependency" — a reasonable trade-off then, but it leaves the safety guarantees doc 3 §6.3/§11.3/§12.1 already commit to (RLS tests must pass before merge) unenforced for any path that doesn't go through a Claude Code session.

### Options Considered
- **GitHub Actions workflow + required branch-protection status check (chosen)** — Pros: native to the GitHub host already in use, no new vendor or cost; runs lint/typecheck/unit tests, the pgTAP RLS suite (ephemeral local/Dockerized Supabase in the runner), and a secret/PII backstop scan independent of any local session or marker file; GitHub itself blocks the merge button, closing the trust gap. Cons: adds a CI-runner dependency (Docker + Supabase CLI in-runner) and a one-time repo-admin setup step (branch protection requires repo-admin rights).
- **Status quo — local hooks only, trust every session runs `/test`** — Cons: this is exactly the gap the item exists to close; a direct GitHub edit or a human clicking Merge bypasses every local hook. Rejected.
- **Third-party CI (CircleCI, Travis, etc.)** — Cons: a second CI vendor, added cost, and another external processor to residency-vet (§3) for no benefit over GitHub Actions, which is already native to the repo host. Rejected.

### Decision
Adopt **GitHub Actions** (`.github/workflows/ci.yml`) as a **required status check** on `main` and `staging`, running app lint/typecheck/unit tests, the pgTAP RLS suite against an ephemeral local/Dockerized Supabase instance, and a secret/PII backstop scan, on every `pull_request` and direct push to those branches. This **extends ADR-0008, does not supersede it** — local hooks keep giving in-session fast feedback; CI is the non-bypassable backstop for every path that doesn't go through a Claude Code session. Enforcement moves from purely local/trust-based (ADR-0008) to a second, GitHub-enforced layer, closing the gap named in doc 3 §6.3/§11.3/§12.1.

### Consequences
- CI runs only against **synthetic seed data** (§6.4) — never real minors' data — so the GitHub-hosted runner's region is not a residency concern; §3's residency-guard targets processors handling real PII, and this workflow never receives any.
- Configuring branch protection is a **one-time human repo-admin step**, not something Claude Code can do unattended (no `gh` API scope for repo settings assumed by default) — a precondition for `/design` to hand to a maintainer, not a follow-up to skip.
- **No GitHub Actions secrets are expected** — current design runs everything local/ephemeral in the runner. If `/design` finds a cloud Supabase credential is actually needed, that reopens spec acceptance criterion #6 and this ADR's "no secrets" consequence should be revisited (not silently provisioned).
- Fork PRs are out of scope for this 3-maintainer team; GitHub's default `pull_request` trigger already withholds secrets from fork-run workflows, so no extra hardening is needed unless that changes.

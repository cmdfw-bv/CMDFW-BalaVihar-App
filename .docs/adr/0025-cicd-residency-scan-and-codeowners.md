# ADR-0025: CI residency/tracker-dependency scan + CODEOWNERS-required review (ADR-0024 addendum)

**Status:** Closed · **Date:** 2026-07-11 · **Deciders:** Project owner + architect

**Governs:** System → `cicd-pipeline` (`.docs/specs/System/cicd-pipeline.md`). Extends ADR-0024; does not supersede it — GitHub Actions as the required-status-check enforcement layer stands unchanged. This addendum closes a gap discovered during `/design`, folding two `.docs/CI_rules.md` items into this UoW's scope that ADR-0024's original acceptance criteria hadn't listed.

### Context
Two local hooks already promise a CI backstop that ADR-0024's brief didn't actually scope:
- `residency-guard.js` (`.claude/hooks/residency-guard.js:4`): *"AND package.json (tracker SDK dependencies). Best-effort early warning — full coverage is CI (`.docs/CI_rules.md` §2.4)."* — a dependency/source tracker scan, matching `CI_rules.md` §2.4.
- `secret-scan.js` (`.claude/hooks/secret-scan.js:3`): *"Best-effort early warning — full coverage is CI/gitleaks (`.docs/CI_rules.md` §2.1)."* — already covered by ADR-0024 AC#4 and this item's design; not part of this addendum.

`residency-guard.js` is advisory-only and never blocks (per its own doc, `CI_rules.md`'s mapping table §3) — so without a CI-side residency/tracker job, non-negotiable #5 (US residency, no marketing/analytics trackers, doc 3 §3) has **no non-bypassable enforcement layer at all**, unlike every other non-negotiable this pipeline covers. `CI_rules.md` §2.6 also names CODEOWNERS-required review on security-critical paths (`supabase/migrations/**`, `supabase/tests/**`, `netlify/functions/**`) as part of the same enforcement model — a human-review gate this pipeline otherwise lacks.

Both were left out of ADR-0024's brief because `/refine`/`/architect` scoped strictly to issue #8's stated acceptance criteria (app tests, pgTAP, a generic secret/PII scan, required status check) and didn't cross-check against `CI_rules.md`'s fuller enforcement-model table. Raised and confirmed with the project owner during `/design`.

### Options Considered
- **Fold both into this UoW now (chosen)** — Pros: closes the residency-guard.js gap in the same pass that stands up CI at all, so the two hook comments' "full coverage is CI" claim becomes true rather than aspirational the moment this ships; CODEOWNERS is a small, purely path-based branch-protection addition with no new runtime job. Cons: expands this UoW's `/build` surface by one new script (`scripts/check-trackers.js`) and one static file (`CODEOWNERS`) beyond ADR-0024's original AC list.
- **Leave both as a separate follow-up backlog item, correct the hook comments/`CI_rules.md` to not overclaim** — Pros: keeps this UoW exactly matched to what `/architect` signed off on. Cons: ships CI with non-negotiable #5 still enforced only by an advisory local hook — the same trust gap ADR-0024 exists to close for every *other* non-negotiable would remain open for residency/trackers; rejected as inconsistent given the hooks already assume this coverage exists.

### Decision
Add two items to the `cicd-pipeline` CI/CD design, both required GitHub-side gates alongside ADR-0024's original three:
1. A `residency-scan` job running `node scripts/check-trackers.js` — scans `package.json`/lockfile dependency names against an analytics/marketing-SDK denylist, and source text for tracker hostnames, **reusing the same denylist source `residency-guard.js` already defines** (single source of truth, no drift between the local hook and CI). Fails closed.
2. A `CODEOWNERS` file requiring review on `supabase/migrations/**`, `supabase/tests/**`, and `netlify/functions/**`, enforced via the branch-protection "Require review from Code Owners" setting (a one-time human repo-admin step, same handoff category as the required-status-check configuration ADR-0024 already named).

### Consequences
- `scripts/check-trackers.js` is a new `/build` deliverable for this item (not yet written) — `/plan` sequences it alongside the workflow YAML.
- `CODEOWNERS` needs a real GitHub handle/team filled in by a human before it's meaningful — shipped with a placeholder (`@<maintainer-handle>`), same pattern as the branch-protection handoff; not invented here.
- The "coverage floor" idea in `CI_rules.md` §2.3 (a new RLS policy/table without a matching pgTAP test fails the build) is a heuristic, diff-parsing check with real false-positive risk — **explicitly not folded in by this addendum**; stays a `CI_rules.md` open item, not silently dropped.
- CI-driven production deploy (`CI_rules.md` §2.2/§5's `deploy-prod` job) is **not** adopted by this addendum or by ADR-0024 — `/deploy-staging`/`/promote` remain human-invoked, unchanged. `CI_rules.md`'s deploy-prod skeleton is superseded prior art, not a pending item.

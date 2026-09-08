# ADR-2026-07-30-staging-builds-from-main: Staging deploys from `main` (no staging branch); prod deferred

**Status:** Closed · **Category:** Infra/Process · **Date:** 2026-07-30 · **Deciders:** #65 architect review (2026-07-30); formally recorded as an ADR and landed via #88 (2026-09-08) — its originally-intended number "ADR-0037" was never written and later collided (see [ADR-2026-08-21-adr-identifier-scheme](2026-08-21-adr-identifier-scheme.md))

### Context
[ADR-0006](0006-hosting-environments.md) decided a two-context Netlify model (its Decision: *"prod/staging deploy contexts"*), which **doc 3 §7** then elaborated into a long-lived **`staging` git branch** driving the staging deploy (`main` → prod, `staging` → staging). That branch was **never created**, and in practice every unit of work converges on `main`. Meanwhile a real staging environment was stood up during #9 (Netlify site + cloud Supabase project A, `cmdfw-bv-staging`), and it builds from `main`. The recorded deploy topology no longer matches reality, and #65 needs a defined one to verify against.

### Options Considered
- **Staging builds from `main`, no staging branch (chosen)** — the Netlify production context builds from `main`; the prod context waits for a second Supabase project.
  - *Pros:* matches how the team actually works (converge on `main`); no dead branch to drift or maintain; staging always reflects latest `main`; simplest possible topology.
  - *Cons:* every merge to `main` auto-deploys to staging (acceptable — staging is synthetic); preview-deploys share the staging database (acceptable under the synthetic-data rule).
- **Create the `staging` branch as originally documented** — `main` → prod, `staging` → staging.
  - *Pros:* separates staging and prod code lines.
  - *Cons:* a long-lived branch nobody uses → drift + extra merges; contradicts the converge-on-`main` practice; the branch never existed, so this is net-new overhead for no observed need.
- **Tags/releases drive staging.**
  - *Pros:* controlled.
  - *Cons:* overkill for a synthetic staging that should track `main` continuously.

### Decision
1. **Staging (the Netlify production context) builds from `main`.** No `staging` branch.
2. **Preview-deploys share the staging Supabase database** — safe *only* because staging holds **synthetic data, never real records** (the synthetic-seed strategy is #65's, recorded with that work).
3. **The prod deploy context is deferred** until Supabase **project B** exists.
4. **Prod promotion trigger is explicitly OPEN — deferred to when project B is created.** Prod will almost certainly also build from `main` (single source of truth), but via a **controlled promotion** (a manual `/promote` step or a git tag), **not** auto-deploy-on-every-merge — because prod holds real minors' data (non-negotiable #6). The exact trigger is recorded here as an open decision so it isn't lost in prose.

### Consequences
- **Supersedes the deploy-context decision of [ADR-0006](0006-hosting-environments.md)** (its *"prod/staging deploy contexts"*) and the staging-branch model in doc 3 §7. **ADR-0006's other decisions stand** — two free Supabase projects, Netlify, single US region, secrets-only-on-Functions. (Per §12.10 we supersede, never edit; ADR-0006 is only *partially* superseded, so its Status is left unchanged and this ADR is the record of what changed.)
- **Doc 3 §7 text must be corrected** — the §7.1 table, §7.2 text, and §7.1 mermaid diagram still describe the staging-branch model; they are now wrong. That correction is tracked as **#65 AC#10** (not done in this ADR's PR).
- The staging URL tracks `main` continuously — the demo environment is always the latest merged code.
- Because previews share the staging DB, a destructive action in a preview hits staging — tolerable only under the synthetic-data rule; would be unacceptable for prod (hence prod gets its own project + controlled promotion).
- No app schema, RLS, auth-hook, or PII surface change — this is delivery topology only.

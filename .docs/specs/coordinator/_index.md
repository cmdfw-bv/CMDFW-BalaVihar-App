# Coordinator — persona backlog

Session/center-level persona (doc 2). Scope = session: all classes in own session/center; approvals in own session (§5.4).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [compliance-dashboard](compliance-dashboard.md) | POC-core | Coordinator | Coordinator (own session) | session — all classes in own session, RPC/RLS-enforced | `/build` ✓ (2026-07-24 — all 11 tasks of [compliance-dashboard.plan.md](compliance-dashboard.plan.md) built and manually verified against the running app + local Supabase) → `/test` ✓ (2026-07-30, re-run 2026-08-16: pgTAP 25 files/319, vitest 75/495) → **PR #50 in review** — two rounds; ADR-0036 reconciliation + the class_meetings population fix. Next is `/deploy-staging` |

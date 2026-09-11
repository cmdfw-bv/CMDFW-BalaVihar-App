# Coordinator — persona backlog

Session/center-level persona (doc 2). Scope = session: all classes in own session/center; approvals in own session (§5.4).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [compliance-dashboard](compliance-dashboard.md) | POC-core | Coordinator | Coordinator (own session) | session — all classes in own session, RPC/RLS-enforced | `/build` ✓ (2026-07-24 — all 11 tasks of [compliance-dashboard.plan.md](compliance-dashboard.plan.md) built and manually verified against the running app + local Supabase) → `/test` ✓ (2026-07-30, re-run 2026-08-17: pgTAP 25 files/**324**, vitest 78/**518**) → **merged 2026-09-06** (`725c2fb`, PR #50; issue #23 closed) — four review rounds; ADR-0036 reconciliation, the `class_meetings` population fix (ADR-0038), a fail-closed `coalesce` on both new authorization guards, and round 4's meeting-date gate coverage + docs triage. Next is `/deploy-staging` — **prerequisite:** staging has no shipped path that creates a session or class, so a maintainer must create the first ones by hand before the first CSV import (ADR-0038 Context) |

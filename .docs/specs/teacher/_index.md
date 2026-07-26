# Teacher — persona backlog

Class-scoped staff persona: owns own-class roster, attendance, class updates, and comment moderation (§5.4 scope = class).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [attendance-ui](attendance-ui.md) | POC-core | Teacher | Teacher (primary); Coordinator/BV Coordinator/Admin indirectly via compliance rollups | mark + submit attendance UI on `mark_attendance_for_staff` (ADR-0021); own-class scope | `/build` ✓ (2026-07-24 — [plan doc](attendance-ui.plan.md), `lib/attendance/*` + screen built TDD, verified end-to-end against local Supabase) — next: `/test` |

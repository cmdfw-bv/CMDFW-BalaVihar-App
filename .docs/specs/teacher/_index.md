# Teacher — persona backlog

Class-scoped staff persona: owns own-class roster, attendance, class updates/homework, and comment moderation (§5.4: Teacher = class scope).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [attendance-ui](attendance-ui.md) | POC-core | Teacher | Teacher (primary); Coordinator/BV Coordinator/Admin indirectly via compliance rollups | mark + submit attendance UI on `mark_attendance_for_staff` (ADR-0021); own-class scope | `/build` ✓ (2026-07-24 — [plan doc](attendance-ui.plan.md), `lib/attendance/*` + screen built TDD, verified end-to-end against local Supabase) — next: `/test` |
| [class-update-and-home-feed](class-update-and-home-feed.md) | POC-core | Teacher | Student (own class), Parent (own children's classes), Coordinator/BV Coordinator/Admin (oversight read — class updates + all comments, public and private, ADR-0032), System (`notifications-infra` — `push-send` second caller, ADR-0033) | Teacher=class (post) · Student=self (read/comment) · Parent=own-children (read/comment) · Coordinator=session/BV Coordinator·Admin=org (oversight read) | `/architect` ✓ (ADR-0032, ADR-0033) → `/design` ✓ (signed off 2026-07-24) — next `/plan` |

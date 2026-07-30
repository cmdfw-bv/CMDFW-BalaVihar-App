# Teacher — persona backlog

Class-scoped staff persona: owns own-class roster, attendance, class updates/homework, and comment moderation (§5.4: Teacher = class scope).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [attendance-ui](attendance-ui.md) | POC-core | Teacher | Teacher (primary); Coordinator/BV Coordinator/Admin indirectly via compliance rollups | mark + submit attendance UI on `mark_attendance_for_staff` (ADR-0021); own-class scope | `/test` ✓ (2026-07-25, PR #49 merged — 414/414 vitest, 193/193 pgTAP; see `UAT.md`) — next: `/deploy-staging` |
| [class-update-and-home-feed](class-update-and-home-feed.md) | POC-core | Teacher | Student (own class), Parent (own children's classes), Coordinator/BV Coordinator/Admin (oversight read — class updates + all comments, public and private, ADR-0032), System (`notifications-infra` — `push-send` second caller, ADR-0033) | Teacher=class (post) · Student=self (read/comment) · Parent=own-children (read/comment) · Coordinator=session/BV Coordinator·Admin=org (oversight read) | `/test` ✓ (2026-07-25 — see `UAT.md`) → PR #48 open, code review 2026-07-29 → review fixes applied 2026-07-28 — next: re-review, then `/deploy-staging`. **Open:** enrollment-`status` access convention deferred to `/architect` (see spec's Open questions) |

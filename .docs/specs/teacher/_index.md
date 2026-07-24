# Teacher — persona backlog

Owns class-scoped capabilities: attendance, class updates/homework, roster, comment moderation (§5.4: Teacher = class scope).

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [class-update-and-home-feed](class-update-and-home-feed.md) | POC-core | Teacher | Student (own class), Parent (own children's classes), Coordinator/BV Coordinator/Admin (oversight read — class updates + all comments, public and private, ADR-0030), System (`notifications-infra` — `push-send` second caller, ADR-0031) | Teacher=class (post) · Student=self (read/comment) · Parent=own-children (read/comment) · Coordinator=session/BV Coordinator·Admin=org (oversight read) | `/architect` ✓ (ADR-0030, ADR-0031) → `/design` ✓ (signed off 2026-07-24) — next `/plan` |
| teacher-attendance-ui | POC-core | Teacher | Student (own %), Parent (children %), Coordinator (class compliance) | Teacher=class | Not started — issue #20 |


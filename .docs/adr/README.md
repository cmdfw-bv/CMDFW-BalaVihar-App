# Architecture Decision Records

**Status:** Living decision log — append new ADRs as decisions are made. **Never edit a Closed ADR; supersede it** with a new one that references it. Generated/maintained via the `/architect` skill (3_ARCHITECTURE §12.10).

Authoritative architecture: [3_ARCHITECTURE.md](../3_ARCHITECTURE.md). Requirements: [1_GREENFIELD_POC_PROPOSAL.md](../1_GREENFIELD_POC_PROPOSAL.md) · [2_POC_FEATURE_SCOPE.md](../2_POC_FEATURE_SCOPE.md).

## Index

| ID | Decision | Status | Date |
|---|---|---|---|
| [ADR-0001](0001-frontend-expo.md) | Frontend: Expo (React Native + RN-Web), TypeScript | Closed | 2026-06-16 |
| [ADR-0002](0002-backend-supabase.md) | Backend: Supabase (Postgres/RLS, US region) | Closed | 2026-06-16 |
| [ADR-0003](0003-access-control-rls.md) | Access control enforced at the database layer (RLS) | Closed | 2026-06-16 |
| [ADR-0004](0004-multipersona-auth-hook.md) | Multi-persona resolution via Postgres Custom Access Token Hook | Closed | 2026-06-16 |
| [ADR-0005](0005-auth-magic-link.md) | Auth: magic link (passwordless), provisioned accounts | Closed | 2026-06-16 |
| [ADR-0006](0006-hosting-environments.md) | Hosting: Netlify + 2 free Supabase projects; local+staging+prod | Closed | 2026-06-16 |
| [ADR-0007](0007-chat-poc-core.md) | Real-time chat is POC-core via Supabase Realtime Broadcast-from-DB | Closed | 2026-06-16 |
| [ADR-0008](0008-delivery-system.md) | Delivery: Claude Code skills + enforcing hooks; SDD + AI-DLC | Closed | 2026-06-16 |
| [ADR-0009](0009-aws-hosting-future.md) | Org-owned AWS/EC2 self-host is a documented future path, not POC | Closed | 2026-06-16 |
| [ADR-0010](0010-design-tooling-open-design.md) | Design tooling: Open Design (local-first); artifacts exported into repo | Closed | 2026-06-16 |
| [ADR-0011](0011-styling-unistyles.md) | Styling: Unistyles 3 + generated theme from design-tokens.json | Closed | 2026-06-16 |
| [ADR-0012](0012-animation-reanimated-moti.md) | Animation: Reanimated engine + Moti declarative layer (future gamification) | Closed | 2026-06-16 |
| [ADR-0013](0013-refine-architect-design-sequence.md) | Sequential refine → architect-review → design for every feature item | Closed | 2026-06-16 |

## How to read an ADR

Each record has: **Status · Date · Deciders**, then **Context · Options Considered (with Pros/Cons) · Decision · Consequences**. A Closed ADR is immutable; changing a decision means a new ADR that supersedes the old one.

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
| [ADR-0014](0014-access-ux-role-derived-nav-conditional-switcher.md) | Access UX: four states, no permission-denied, role-derived nav, conditional switcher | Closed | 2026-06-20 |
| [ADR-0015](0015-chat-access-model.md) | Chat access: grade-band membership, participant ladder, @mentions, no open student DMs | Closed | 2026-06-20 |
| [ADR-0016](0016-notification-preferences.md) | Notification preferences: per-channel levels (All/Mentions/Muted) with role-aware defaults | Closed | 2026-06-20 |
| [ADR-0017](0017-chat-governance-deferred.md) | Chat governance gate: moderation + retention deferred post-pilot under interim safeguards | Closed | 2026-06-20 |
| [ADR-0018](0018-family-household-model.md) | Family/household data model: one family per student, multiple guardians per household | Closed | 2026-07-08 |
| [ADR-0019](0019-minors-record-read-audit.md) | Minors'-record read-audit: hybrid RPC for cross-scope reads, plain RLS for self/parent | Closed | 2026-07-08 |
| [ADR-0020](0020-teacher-attendance-write-audit-trigger.md) | Teacher attendance-write audit trigger (ADR-0019 addendum): closes RETURNING-as-read bypass | Superseded by ADR-0021 | 2026-07-09 |
| [ADR-0021](0021-teacher-attendance-write-rpc.md) | Teacher attendance-write via SECURITY DEFINER RPC: fixes broken UPDATE/INSERT-RETURNING under RLS | Closed | 2026-07-09 |
| [ADR-0022](0022-csv-import-auth-provisioning-boundary.md) | CSV import: DB transaction commits first, auth provisioning runs after commit (DB-first boundary) | Closed | 2026-07-11 |
| [ADR-0023](0023-active-role-storage-and-switch.md) | Active-role storage (`is_active` + partial unique index), RPC-based switch, hook-only auto-activation | Closed | 2026-07-10 |
| [ADR-0024](0024-cicd-github-actions-branch-protection.md) | CI/CD: GitHub Actions required status check as server-side enforcement layer (extends ADR-0008) | Closed | 2026-07-11 |
| [ADR-0025](0025-cicd-residency-scan-and-codeowners.md) | CI residency/tracker-dependency scan + CODEOWNERS-required review (ADR-0024 addendum) | Closed | 2026-07-11 |
| [ADR-0026](0026-user-role-approval-tiering-and-audit.md) | user-role-approval: tiered privilege-escalation guard on the first `user_roles` write path; grant/revoke audited via structured log, not `audit_log` | Closed | 2026-07-11 |
| [ADR-0027](0027-role-switcher-label-active-role-agnostic-self-scope-read.md) | Role-switcher labels are an active-role-agnostic self-scope read (ADR-0019 addendum): extends the unaudited exemption to SECURITY DEFINER reads proven identity-scoped by adversarial test | Closed | 2026-07-17 |
| [ADR-0028](0028-push-dispatch-client-invoked.md) | Push dispatch is client-invoked (after a `messages` insert), not a DB trigger/`pg_net` — no new extension/secret surface | Closed | 2026-07-21 |
| [ADR-0029](0029-sankalp-component-kit-single-owner-full-library.md) | Sankalp component kit ships as one System-owned unit — full-library exception to §12.12 per-capability ownership (presentational porting only; data-wiring stays with each owning persona) | Closed | 2026-07-18 |
| [ADR-0030](0030-class-update-comment-privacy-column-flag.md) | Class-update comment privacy: column-flag RLS (`is_private`/`target_parent_id`) with scope-derived Coordinator/BV Coordinator/Admin oversight read access — extends ADR-0015 with a lighter shape, no participant table | Closed | 2026-07-24 |
| [ADR-0031](0031-push-send-discriminated-event-reference.md) | `push-send` contract extended to a discriminated `{message_id}`/`{class_update_id}` request body so `class-update-and-home-feed` can be its second caller (ADR-0028 addendum) | Closed | 2026-07-24 |

## How to read an ADR

Each record has: **Status · Date · Deciders**, then **Context · Options Considered (with Pros/Cons) · Decision · Consequences**. A Closed ADR is immutable; changing a decision means a new ADR that supersedes the old one.

> ⚠️ **DRAFT — SUPERSEDED.** The authoritative source of truth for this project is **[1_GREENFIELD_POC_PROPOSAL.md](1_GREENFIELD_POC_PROPOSAL.md)**, which explicitly supersedes this document (see its Status line). Retained for history only; do not treat as current.

# 12 — POC Feature Scope & Stack Review (Greenfield)

**Date:** 2026-06-13 (rev. 2 — corrected: greenfield, requirements-only)
**Source of requirements:** Master Feature Map (https://famous-semifreddo-4e90b0.netlify.app), captured via Playwright 2026-06-13.
**Companion docs:** `10_ARCHITECTURE_CHALLENGE.md` (review of the vibe-coded ADRs), `11_STACK_PROPOSAL.md` (greenfield stack + costs).

> **Framing (important):** This is **greenfield**. The feature-map page is treated **strictly as a business-requirements catalog** — features and personas only. The `APP` / `PORTAL` split and the `BUILT` / `PLANNED` / `BACKLOG` tags on that page came from a **throwaway scratch POC built for board buy-in** and have **no bearing** on this work. There is **no existing codebase, schema, auth, or data** to consolidate, migrate, or reuse. The vibe-coded architecture docs (00–08, ADRs) are **draft inputs to be challenged**, not settled decisions.

**POC personas (6):** Student · Parent · Teacher · Coordinator (session) · BV Coordinator (org) · Admin.
**Deferred personas (2):** Substitute · Volunteer.

---

## 1. What the requirements actually describe

A **community-engagement + operations platform** for a weekly children's program — not an attendance app. The requirement themes:

- **Feeds & communication:** announcements, class updates, two-way comments (public + private), notifications (push + email)
- **Operations:** attendance, absence reporting, substitute workflow, compliance dashboards, roster/enrollment management, approval workflows
- **Org management:** multi-center rollups, role/persona assignment, syllabus management
- **Engagement (later):** gamification/karma, HS social feed (BV Connect), daily inspiration, polls, events, AI-drafted announcements

"Remove duplicates" = the catalog lists some requirements more than once (the same capability appeared under both scratch surfaces); below, each is stated **once** as a single business requirement.

---

## 2. POC requirement scope per persona (deduped, requirements-only)

"POC core" = needed to prove value. "Defer" = a real requirement, scheduled later. (No build-status implied — greenfield.)

### Student
- **POC core:** home feed (announcements + class updates) · own class info · attendance stats (present/absent/%) · two-way comments (public + private) · notifications/alerts
- **Defer:** karma/gamification · BV Connect social feed (HS 9–12) · daily inspiration · satsang feed

### Parent
- **POC core:** children list with attendance % · home feed · two-way comments · notifications · view events
- **Defer:** full parent engagement module · self-serve onboarding

### Teacher
- **POC core:** mark & submit attendance · report absence to coordinator (date/reason/notes) · post class update (+ optional homework) · view class roster · moderate comments
- **Defer:** AI announcement drafting · polls · calendar/syllabus · training video · daily quote

### Coordinator (session/center-level)
- **POC core:** compliance dashboard (per-class attendance + update tracking) · teacher-absence alerts · center-scoped announcements · roster management · approve/reject users in own session · **multi-persona** (e.g., a parent who is also a coordinator)
- **Defer:** substitute workflow (depends on deferred Substitute persona)

### BV Coordinator (org-level)
- **POC core:** org-wide metrics across centers · per-center breakdown · org-wide absence list · org-wide announcements · cross-session user approval
- **Defer:** syllabus management · social-feed moderation

### Admin
- **POC core:** full org dashboard · user/role management (assign with session context, approve, reject) · error monitoring · sees all announcements
- **Defer:** user deletion / data purge · syllabus upload

### Cross-cutting (required for the POC)
- **Auth + onboarding:** coordinator/admin-provisioned accounts (no minor self-registration) · enrollment import
- **Notifications:** push + email
- **Security:** row-level access control on all tables · multi-persona resolution

---

## 3. Greenfield stack review against the **full** requirements

Does the proposed Expo + Supabase stack (`11_STACK_PROPOSAL.md`) satisfy a community platform, not just attendance? Yes.

| Business requirement | Stack component | Fit |
|---|---|---|
| Cross-platform UI (web + native) for all personas | **Expo (RN + RN-Web)** | ✅ one codebase, native fast-follow |
| Relational data + per-row access for minors (COPPA) | **Supabase Postgres + RLS** | ✅ decisive |
| Multi-persona (parent + coordinator on one account) | **Postgres auth hook** sets `active_role` claim | ✅ SQL, no Deno (validated) |
| Feeds (announcements / class updates) | Supabase query + poll-on-focus (realtime optional) | ✅ (see §4) |
| Two-way comments (public/private + moderation) | Postgres + RLS | ✅ |
| Dashboards (compliance, org/per-center metrics) | SQL aggregation, RLS-safe | ✅ |
| Role/approval/enrollment workflows | Postgres + RLS + minimal server route | ✅ |
| Notifications (push web + native, email) | Web Push (VAPID) + Expo Push + Resend | ✅ |
| AI announcement drafting (deferred) | Claude API (Haiku — `claude-haiku-4-5`) | ✅ small cost |
| File/syllabus upload (deferred) | Supabase Storage | ✅ when needed |
| Gamification / social feed (deferred) | Postgres + RLS | ✅ later |

**Verdict:** no requirement in the catalog forces a different backend or a second codebase. Expo + Supabase covers the whole platform.

---

## 4. Two greenfield design decisions this review settles

1. **Auth = password-primary + magic-link recovery** — recommended **on its merits** (not because anything exists): for a weekly app on an iOS PWA, password re-login costs no email and sidesteps findings C1/C2 (`10_ARCHITECTURE_CHALLENGE.md`). This **supersedes draft ADR-008** (magic-link-first).
2. **Realtime = optional for the POC, decide at launch scale** — including realtime for the feed is fine at POC scale; finding C3 (Pro = 500 concurrent connections) only bites near full-enrollment Sunday peak. Recommend building the feed **poll-first** and adding realtime only if the UX needs it, to keep the POC simple and the cost predictable.

---

## 5. POC cost (greenfield) — see `11_STACK_PROPOSAL.md` §6 for the full model

- **POC: $0** — Supabase Free, Netlify Free, Resend Free, Sentry Free, Expo/EAS Free.
- **~800-user launch: ~$25/mo** (Supabase Pro) + named cliffs (DB 500 MB/pause, email 100/day, OTA 1K MAU).
- **New small lines from the full feature set:** Claude API for AI drafting (pennies, deferred → $0 in POC); Supabase Storage for syllabus (deferred → $0 in POC).

---

## 6. Thinnest end-to-end POC slice (greenfield build, proves all 6 personas)

1. **Admin** provisions users for one center (enrollment import) and assigns roles.
2. **Teacher** marks attendance + posts a class update.
3. **Student** and **Parent** see it in their feed and comment.
4. **Coordinator** sees the live compliance dashboard for that center.
5. **BV Coordinator** sees it rolled up across centers.

Success = this loop works with per-persona row-level access enforced, including one parent-who-is-also-coordinator. Everything else layers on after.

---

## 7. Open items (greenfield)
1. **Schema design:** define the canonical relational model from requirements (centers → sessions → classes → enrollments → attendance → students → families). I can draft this next.
2. **Synthetic seed:** generate realistic test data from scratch for POC testing (no reuse of prior scratch data).
3. **Realtime:** OK to build the feed **poll-first**, add realtime only if needed (§4)?
4. **Auth:** confirm password-primary + magic-link recovery, superseding ADR-008 (§4)?
5. **Substitute/Volunteer:** confirmed deferred — any pilot dependency that pulls them in earlier?

# 2 — POC Feature Scope

**Date:** 2026-06-13 (refined 2026-06-16)
**Status:** Authoritative. Derived from and consistent with **[1_GREENFIELD_POC_PROPOSAL.md](1_GREENFIELD_POC_PROPOSAL.md)** — stack decisions, constraints, cost model, and data-model additions live there; this document covers per-persona feature scope, stack fit, and the thinnest POC slice.

> **Framing:** This is **greenfield**. The feature-map page is treated **strictly as a business-requirements catalog** — features and personas only. The `APP` / `PORTAL` split and the `BUILT` / `PLANNED` / `BACKLOG` tags came from a throwaway scratch POC built for board buy-in and have **no bearing** on this work. There is **no existing codebase, schema, auth, or data**. The vibe-coded architecture docs (00–08, ADRs) are draft inputs to be challenged, not settled decisions.

**POC personas (6):** Student · Parent · Teacher · Coordinator (session) · BV Coordinator (org) · Admin.
**Deferred personas (2):** Substitute · Volunteer.

---

## 1. What the requirements actually describe

A **community-engagement + operations platform** for a weekly children's program — not an attendance app. Requirement themes:

- **Feeds & communication:** announcements, class updates, two-way comments (public + private), notifications (push + email)
- **Operations:** attendance, absence reporting, substitute workflow, compliance dashboards, roster/enrollment management, approval workflows
- **Org management:** multi-center rollups, role/persona assignment, syllabus management
- **Engagement (later):** gamification/karma, HS social feed (BV Connect), daily inspiration, polls, events, AI-drafted announcements

---

## 2. POC requirement scope per persona (deduped, requirements-only)

"POC core" = needed to prove value. "Defer" = a real requirement, scheduled later.

### Student *(grade 9+, HS)*
- **POC core:** home feed (announcements + class updates) · own class info · attendance stats (present/absent/%) · two-way comments (public + private) · notifications/alerts · class chat — membership by grade: HS (Gr 9+) students join their own class chat alongside teacher + parents (with `@Parents` / `@Students` / `@individual` mentions); KG–Gr 8 class chat is teacher ↔ parents. **No open student-to-student DMs.** (ADR-0015)
- **Defer:** karma/gamification · BV Connect social feed (broader HS social feed — distinct from class chat and P2P DMs) · daily inspiration · satsang feed

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
- **Auth + onboarding:** coordinator/admin-provisioned accounts (no minor self-registration) · magic-link (passwordless) as the primary login method · enrollment import (CSV baseline)
- **Notifications:** Web Push (VAPID) for the PWA + email via AWS SES (US region, DPA)
- **Privacy & compliance:** parental + media consent capture (timestamped) · retention/deletion policy + delete mechanism · audit log on access to minors' records
- **Security:** row-level access control on all tables · multi-persona resolution — one account, multiple scoped roles, active-role switch (each role carries a different access scope: own children → own class → own session → org-wide)
- **Chat governance (required before POC ships):** who-can-DM-whom policy · message moderation/report mechanism · message retention policy — HS students are still minors; these must be defined before student P2P chat goes live

---

## 3. Stack fit against the full requirements

Does the Expo + Supabase stack satisfy a community platform, not just attendance? Yes.

| Business requirement | Stack component | Fit |
|---|---|---|
| Cross-platform UI (web + native) for all personas | **Expo (RN + RN-Web), TypeScript** | ✅ one codebase, native fast-follow |
| Relational data + per-row access for minors (COPPA) | **Supabase Postgres + RLS** | ✅ decisive |
| Multi-persona (one account, multiple scoped roles) | **Postgres auth hook** sets `active_role` claim (SQL, no Deno) | ✅ |
| Feeds (announcements / class updates) | Supabase query + poll-on-focus | ✅ |
| Two-way comments (public/private + moderation) | Postgres + RLS | ✅ |
| Dashboards (compliance, org/per-center metrics) | SQL aggregation, RLS-safe | ✅ |
| Role/approval/enrollment workflows | Postgres + RLS + minimal US-region Node/TS serverless function (Netlify Functions) | ✅ |
| Push notifications (PWA) | Web Push VAPID + service worker + `push_subscriptions` table | ✅ |
| Email notifications | AWS SES (US region, DPA) | ✅ |
| Real-time chat (class group + student P2P) | Supabase Realtime (Broadcast + `messages` / `conversations` tables + RLS) — chat governance gate must be satisfied before shipping | ✅ |
| Consent + audit + retention | Postgres tables (`consents`, `audit_log`) + RLS + scheduled deletion job | ✅ |
| AI announcement drafting (deferred) | Claude API — deferred + privacy-gated; $0 during POC | ✅ |
| File/syllabus upload (deferred) | Supabase Storage | ✅ when needed |
| Gamification / social feed (deferred) | Postgres + RLS | ✅ later |

**Verdict:** no requirement in the catalog forces a different backend or a second codebase. Expo + Supabase covers the whole platform.

---

## 4. POC cost snapshot

See **[1_GREENFIELD_POC_PROPOSAL.md §8](1_GREENFIELD_POC_PROPOSAL.md)** for the full model with named cliffs and rollout thresholds.

| Stage | Total/mo |
|---|---|
| **POC (50–150 users, 1 center)** | **~$0** — Supabase Free · Netlify Free · AWS SES free tier · Sentry Free (US region) · Expo/EAS Free |
| **Rollout (~800 users, multi-center)** | **~$25–45** — Supabase Pro ($25) · Netlify Personal ($9 insurance) · SES (~$1) |

Additions from the full feature set at POC scale: **$0** — AI drafting and Supabase Storage are deferred.

> ⚠️ **Supabase Realtime is now POC core** (class group chat + student P2P). Free tier = 200 concurrent connections. Fits 50–150 pilot users, but monitor; upgrade path is Supabase Pro ($25/mo, 500 concurrent).

---

## 5. Thinnest end-to-end POC slice (proves all 6 personas)

1. **Admin** provisions users for one center (CSV enrollment import) and assigns roles.
2. **Teacher** marks attendance + posts a class update.
3. **Student & Parent** receive a **PWA push notification** ("New update in your class"), open the app, see it, and comment.
4. **Student** sends a message in the class group chat; **Teacher** sees it. One student sends another a direct message.
5. **Coordinator** sees the live compliance view for the session.
6. **BV Coordinator** sees it rolled up (degenerate single-session rollup — validates the role/screens + RLS scoping, not real cross-center aggregation).

**Success =** the loop works with per-row access enforced per persona, including **a single account holding multiple roles across the Parent → Teacher → Coordinator → BV Coordinator span** (switching active role, with correctly scoped access each time), an **audit entry** on minors'-data access, and a **PWA push delivered to an installed home-screen PWA** (incl. iOS 16.4+).

**Explicit POC non-goals** (so a passing POC isn't mistaken for launch-ready): scale/peak load · native builds & native push (FCM/APNs) · member-system API sync (POC uses CSV import) · gamification/social/AI features.

---

## 6. Open items

1. **Schema design:** define the canonical relational model (centers → sessions → classes → enrollments → attendance → students → families) plus the privacy/multi-role/push additions described in `1_GREENFIELD_POC_PROPOSAL.md §10`.
2. **Synthetic seed:** generate realistic test data from scratch for POC testing (no reuse of any prior scratch data).
3. ~~**Which member/enrollment system?** Determines CSV-only vs API sync and field mapping.~~ **Resolved 2026-06-20:** **CSV-only for the POC** (matches the §5 thinnest slice); member-system API sync is deferred. Schema is designed for CSV enrollment import now.
4. **Chat governance:** who-may-chat-whom **resolved** by ADR-0015; message **moderation/report** + **retention** are **deferred post-pilot** under interim safeguards (ADR-0017 — adult-presence oversight via the participant ladder, no open student DMs, messages purged at pilot close). Revisit before any rollout / go-live.
5. **Substitute/Volunteer:** confirmed deferred — any pilot dependency that pulls them in earlier?

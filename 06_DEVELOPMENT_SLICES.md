# Development Slices & Sequencing
### CMDFW Bala Vihar App — Document 6 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Approved — governs build order and scope of each development slice  

---

## Table of Contents

1. [Principles](#1-principles)
2. [Phase Overview](#2-phase-overview)
3. [Phase 0 — Foundation](#3-phase-0--foundation)
4. [Phase 1 — Core Launch Features](#4-phase-1--core-launch-features)
5. [Phase 2 — Post-Launch](#5-phase-2--post-launch)
6. [Phase 3 — Growth](#6-phase-3--growth)
7. [Dependency Map](#7-dependency-map)
8. [Slice Sizing Reference](#8-slice-sizing-reference)

---

## 1. Principles

**Each slice is independently deployable.** When a slice is done, it can be merged and deployed to staging without needing any other in-progress slice. Slices are sequenced so that each one builds on a stable, tested foundation.

**Slices are vertically integrated.** Each slice delivers a complete, working increment of user value — schema change + RLS policy + hook + screen + error handling + tests. Horizontal slices ("build all the screens first, then add RLS") are prohibited. A feature with no security is not a feature.

**A slice is not done until the DoD is satisfied.** Every slice references the applicable Definition of Done categories from `05_DEFINITION_OF_DONE.md`. These are not optional.

**Slice size targets one developer-week or less.** If a slice is estimated larger, it must be split. Slices that span multiple weeks create integration risk and make it hard to validate incrementally.

---

## 2. Phase Overview

```
Phase 0 — Foundation          ~2 weeks
  Environment setup, schema, auth skeleton, design system

Phase 1 — Core Launch         ~10 weeks
  All features required before any real users are onboarded
  Slices 1-01 through 1-14

Phase 2 — Post-Launch         ~6 weeks
  Features to complete within the first month of real usage
  Slices 2-01 through 2-05

Phase 3 — Growth              ~8 weeks
  New personas and advanced features
  Slices 3-01 through 3-06
```

**Total estimated duration:** ~26 weeks from a clean start for a single developer.  
This estimate assumes full days of focused development. Part-time development scales proportionally.

---

## 3. Phase 0 — Foundation

These slices must be complete before any Phase 1 feature slice begins. They establish the structural skeleton every other slice depends on.

---

### Slice 0-01: Repository & Environment Setup

**Goal:** A running app skeleton that connects to Supabase and deploys to Netlify.

**What to build:**
- New Expo project with `expo-router`, TypeScript strict mode, ESLint (`no-explicit-any: error`), Prettier
- `src/` folder structure as defined in `04_ARCHITECTURE.md` Section 10
- `src/lib/supabase.ts` — Supabase client with SecureStore adapter (magic link-ready, `detectSessionInUrl: true` for web)
- `src/lib/sentry.ts` — Sentry init with environment tagging
- `src/theme/index.ts` — full design token system (colors, spacing, typography, shadows) from prototype
- Three Supabase projects created: `balvihar-dev`, `balvihar-stage`, `balvihar-prod`
- `.env.local` configured for dev; Netlify env vars set for staging and production
- `netlify.toml` configured
- GitHub repo connected to Netlify; auto-deploy on push to `main` and `staging`
- GitHub Actions CI workflow: TypeScript check + lint + test

**What is explicitly not in this slice:**
- No screens beyond a placeholder "Loading..." root
- No database schema
- No auth flow

**DoD categories:** D-01, D-02, H-02, H-03, H-05

**Done when:** `npx expo start` runs locally with no errors; pushing to `staging` branch triggers a successful Netlify deploy; CI passes.

---

### Slice 0-02: Database Schema & Seed Data

**Goal:** The complete production schema exists in all three environments, with seed data in development.

**What to build:**
- Write `/database/migrations/001_initial_schema.sql` — all 18 tables, constraints, foreign keys, triggers (`handle_new_user`, `enforce_single_current_year`)
- Write `/database/migrations/002_rls_policies.sql` — all RLS policies per `01_SECURITY_AND_COMPLIANCE.md` Section 6.2
- Write `/database/migrations/003_indexes.sql` — all 15 indexes from `02_DATA_MODEL.md` Section 6
- Write `/database/migrations/004_views.sql` — `v_class_roster`, `v_attendance_summary`
- Write `/database/migrations/005_helper_functions.sql` — `my_role()`, `my_center_id()`, `my_org_id()`, `current_academic_year()` updated for JWT claims per ADR-004
- Apply all migrations to `balvihar-dev`, `balvihar-stage`, `balvihar-prod`
- Write `/database/seeds/dev_seed.sql` — full synthetic dataset per `02_DATA_MODEL.md` Section 8 (includes prior academic year, multi-persona users, multi-teacher classes)
- Apply seed to `balvihar-dev` only
- Run `npx supabase gen types typescript` → commit `src/types/database.types.ts`

**What is explicitly not in this slice:**
- No app code changes
- No seed data on staging or production

**DoD categories:** F-01 through F-09 (all), B-07, B-08

**Done when:** All migrations apply cleanly to all three environments with no errors; `database.types.ts` is generated and committed; seed data is visible in the dev Supabase dashboard; staging and production have schema but no data.

---

### Slice 0-03: Authentication Shell

**Goal:** A user can log in via magic link, land on a placeholder home screen, and sign out.

**What to build:**
- `app/(auth)/login.tsx` — email input, "Send Magic Link" button, loading state
- `app/(auth)/check-email.tsx` — confirmation screen with resend (60s rate limit)
- `app/_layout.tsx` — `onAuthStateChange` listener; routes to `/(auth)` or `/(app)` based on session; detects unprovisioned email (no profile row) and signs out with error message
- `src/context/AuthContext.tsx` — `user`, `profile`, `isLoading`; no persona logic yet
- `app/(app)/_layout.tsx` — placeholder tab navigator (single "Home" tab)
- `app/(app)/home/index.tsx` — placeholder screen: "Welcome, [name]" + Sign Out button
- Magic link redirect URI configuration per `04_ARCHITECTURE.md` Section 5.1

**What is explicitly not in this slice:**
- No persona picker
- No role-aware navigation
- No data fetching beyond profile load

**DoD categories:** A-01, A-02, B-03, B-04, C-01, C-02, C-04, C-07, D-01, D-02, H-01, H-04

**Done when:** Test user can receive a magic link, tap it, land on the placeholder home screen, and sign out. Unprovisioned email shows correct error. CI passes.

---

### Slice 0-04: Multi-Persona Auth & Navigation Shell

**Goal:** The persona picker works and the tab navigator shows the correct tabs per active persona.

**What to build:**
- `set_active_persona` Supabase Edge Function (per `ARCHITECTURE_DECISIONS.md` ADR-004 Implementation Notes)
- Updated `my_role()` and `my_center_id()` helper functions using JWT `app_metadata` with `COALESCE` fallback
- `app/(auth)/persona-picker.tsx` — persona tiles, ordered by `display_order`
- `src/context/AuthContext.tsx` updated — `activePersona`, `personas`, `switchPersona()`
- `app/(app)/_layout.tsx` updated — full tab set, visibility gated by `activePersona.role`
- Tab configuration table (role → visible tabs) implemented as a typed config object, not scattered conditionals

**Tab visibility matrix:**

| Tab | central_admin | local_admin | teacher | parent | student | volunteer | substitute |
|---|---|---|---|---|---|---|---|
| Feed | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| My Class | — | — | ✅ | — | ✅ | — | — |
| My Children | — | — | — | ✅ | — | — | — |
| Dashboard | ✅ | ✅ | — | — | — | — | — |
| Events | ✅ | ✅ | — | ✅ | — | — | — |
| Opportunities | — | — | — | — | — | ✅ | ✅ |
| Notifications | — | — | — | — | ✅ | — | — |
| Profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**DoD categories:** A-01, A-02, A-03, B-01, B-03, B-04, C-01, C-02, D-01, D-02, D-05, D-06, H-01

**Done when:** Each of the 7 test users logs in, sees the correct persona picker (or skips it if single persona), and sees the correct tabs. Persona switch from Profile tab works without re-login. CI passes.

---

## 4. Phase 1 — Core Launch Features

Each slice below depends on Phase 0 being complete. Within Phase 1, slices are sequenced so that foundational data (classes, rosters) is built before features that display it (attendance, updates).

---

### Slice 1-01: Home Feed

**PRD reference:** F-03  
**Dependencies:** 0-04 (auth + nav)

**Goal:** Every persona sees a role-appropriate, paginated, real-time feed.

**What to build:**
- `src/hooks/useFeed.ts` — loads announcements + class updates filtered by persona; pagination (page size 20); Realtime subscription on `announcements` and `class_updates` (cleanup on unmount)
- `src/components/feed/AnnouncementCard.tsx` — title, body (collapsible at 3 lines), poster name, time, audience badges
- `src/components/feed/ClassUpdateCard.tsx` — grade badge, teacher name, date, content preview, homework indicator, comment count
- `app/(app)/feed/index.tsx` — skeleton loading, empty state, error state with retry, "load more" at scroll bottom
- Realtime re-fetch on insert (not append — per `04_ARCHITECTURE.md` Section 7.1)

**What is explicitly not in this slice:**
- No tapping into full class update detail (Slice 1-04)
- No comments (Slice 1-05)
- No announcements composer (Slice 1-07)

**DoD categories:** A-01, A-02, A-03, B-01, B-02, B-04, B-10, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, G-01, G-04, H-01, H-02

**Done when:** Teacher sees class updates for their class and teacher-targeted announcements. Parent sees class updates for their children's classes and parent-targeted announcements. Student does not see teacher-targeted announcements. Feed paginates and updates in real-time. All error/loading/empty states render.

---

### Slice 1-02: Teacher Class Roster & My Class Tab

**PRD reference:** F-04 (roster view), F-05 (partial)  
**Dependencies:** 0-04

**Goal:** Teacher sees their class roster and basic class info.

**What to build:**
- `src/hooks/useMyClass.ts` — loads teacher's class assignments, enrolled students (via `v_class_roster`), handles multiple teachers per class
- `src/components/attendance/RosterRow.tsx` — student name, attendance status toggle (Present / Absent / Excused)
- `app/(app)/my-class/index.tsx` — class info header (grade, session, center), student roster list, skeleton/empty/error states
- Student view: `app/(app)/my-class/index.tsx` shows own class info and personal attendance summary (read-only)

**What is explicitly not in this slice:**
- No attendance submission (Slice 1-03)
- No class update posting (Slice 1-04)

**DoD categories:** A-01, A-03, A-04, A-06, B-01, B-02, B-05, C-01 through C-06, D-01 through D-09, E-01, E-02, E-03, G-02, G-05, H-01, H-02

**Done when:** Teacher sees their roster with student names. A teacher with two assigned classes sees both. `.single()` is absent from all `class_teachers` queries. Teacher cannot see another class's roster. Student sees their own class info only.

---

### Slice 1-03: Attendance Submission

**PRD reference:** F-04  
**Dependencies:** 1-02 (roster)

**Goal:** Teacher can take attendance, submit it, and correct a prior submission. Parent and student can view attendance history.

**What to build:**
- `src/hooks/useAttendance.ts` — load existing attendance for a session date; upsert submission; date picker (past Sundays in current academic year only)
- `src/components/attendance/AttendanceGrid.tsx` — per-student status buttons (P/A/E), submitted banner
- `app/(app)/my-class/attendance.tsx` — date selector, roster with status toggles, "Submit" button
- Parent view in `app/(app)/my-children/index.tsx` — per-child attendance percentage and session history
- Student view in `app/(app)/my-class/index.tsx` — own attendance percentage and session history
- Academic year stamping on all inserts (`A-05`)

**DoD categories:** A-01 through A-07 (A-04, A-05, A-06 especially), B-01, B-02, B-03, B-04, B-05, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, F-01 through F-09, G-02, G-03, H-01, H-02  
**Feature-specific DoD:** See `05_DEFINITION_OF_DONE.md` Section 4 (no feature-specific additions for attendance, but A-04, A-05, G-03 are critical)

**Done when:** Teacher submits attendance for 20 students in under 2 minutes. Re-opening the same date shows existing records. Academic year is stamped on every row. Parent sees correct percentage. Teacher cannot submit for a future date. Teacher cannot submit for another class.

---

### Slice 1-04: Class Updates & Full Update View

**PRD reference:** F-05  
**Dependencies:** 1-02 (roster), 1-01 (feed cards exist)

**Goal:** Teacher posts a class update; enrolled families read it in full.

**What to build:**
- `src/hooks/useClassUpdates.ts` — load updates for a class; create/edit/delete
- `app/(app)/my-class/update.tsx` — form (date, content, homework); edit mode pre-fills; delete confirmation
- `app/(app)/feed/[id].tsx` — full class update detail screen (content, homework, comment count placeholder)
- Tapping a `ClassUpdateCard` in the feed navigates to the detail screen
- Academic year stamping on inserts (`A-05`)
- `ON DELETE SET NULL` behaviour verified: deleting a teacher profile does not delete their class updates

**DoD categories:** A-01, A-02, A-03, A-04, A-05, B-01, B-02, B-03, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, F-08, G-02, H-01, H-02

**Done when:** Teacher posts an update; it appears in the feed within 3 seconds. Parent taps the card and reads the full update. Teacher cannot post for a class they are not assigned to. Editing replaces content without a duplicate. Deleting removes the update and does not orphan comments (cascade).

---

### Slice 1-05: Comments on Class Updates

**PRD reference:** F-06  
**Dependencies:** 1-04 (full update view)

**Goal:** Parents and teachers comment on class updates; private/public visibility; teacher moderation.

**What to build:**
- Schema: `/database/migrations/006_comments.sql` — `class_update_comments` table: `id`, `update_id`, `author_id`, `body`, `is_private`, `is_deleted`, `created_at`; RLS policies; index on `update_id`
- `src/hooks/useComments.ts` — load comments for an update; create; delete own; teacher delete any
- `src/components/comments/CommentThread.tsx` — comment list, input, private badge, "removed" placeholder
- `src/components/comments/CommentInput.tsx` — text input, Private toggle (hidden for students)
- Update `app/(app)/feed/[id].tsx` to include `CommentThread`
- Soft delete: `is_deleted = true` — renders "This comment was removed", never hard-deletes

**DoD categories:** A-01, A-02, A-03, B-01, B-02, B-03, B-04, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, F-01 through F-09, G-02, G-05, H-01, H-02  
**Feature-specific DoD:** All items in `05_DEFINITION_OF_DONE.md` Section 4 — Comments

**Done when:** Parent posts public comment visible to all enrolled families. Parent posts private comment visible only to them and the teacher. Student cannot post private comment (UI hidden and RLS blocks direct insert). Teacher deletes a comment; it shows "removed" placeholder. Comment count on feed card increments in real-time.

---

### Slice 1-06: Teacher Absence Reporting

**PRD reference:** F-07  
**Dependencies:** 1-02 (My Class tab exists)

**Goal:** Teacher reports an upcoming absence; can view and cancel their own absences.

**What to build:**
- `src/hooks/useAbsences.ts` — load own absences; create; delete (if no sub assignment exists)
- `app/(app)/my-class/absence.tsx` — form (future date picker, reason dropdown, notes); upcoming absences list; cancel button with guard
- Coordinator real-time notification via Realtime subscription on `teacher_absences` (coordinator receives this in Slice 1-09)

**DoD categories:** A-01, A-02, A-03, B-01, B-02, B-03, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, F-08, G-02, H-01, H-02

**Done when:** Teacher can report a future absence and see it in their list. Past date is rejected. Duplicate date is rejected. Teacher can cancel an absence with no sub assignment. Teacher cannot cancel after a sub assignment exists.

---

### Slice 1-07: Announcements — Post & Display

**PRD reference:** F-09  
**Dependencies:** 1-01 (feed exists)

**Goal:** Coordinator and Central Admin post targeted announcements; all personas see correctly filtered announcements in their feed.

**What to build:**
- `src/hooks/useAnnouncements.ts` — create announcement; edit; delete own
- `src/components/feed/AnnouncementComposer.tsx` — modal form: title, body, audience multi-select, center scope selector (admin only)
- Composer trigger: "+ Announcement" button in Dashboard header (built in Slice 1-09) and a temporary button in Profile tab for testing
- Academic year stamping on inserts (`A-05`)
- Update feed hook to reload on new announcement insert (already in Slice 1-01 via Realtime)

**What is explicitly not in this slice:**
- No Dashboard UI (Slice 1-09) — composer is tested via Profile tab button for now

**DoD categories:** A-01, A-02, A-03, A-05, B-01, B-02, B-03, B-05, B-06, B-10, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, F-08, G-02, H-01, H-02  
**Feature-specific DoD:** All items in `05_DEFINITION_OF_DONE.md` Section 4 — Announcements

**Done when:** Coordinator-posted "Teachers only" announcement is visible to teachers at that center, invisible to parents and students. Coordinator cannot set `center_id = NULL` via direct API call. Admin can post org-wide. Academic year is stamped.

---

### Slice 1-08: Events & Volunteer Signups

**PRD reference:** F-10  
**Dependencies:** 0-04 (nav shell)

**Goal:** Coordinators create events; volunteers and parents sign up and cancel.

**What to build:**
- `src/hooks/useEvents.ts` — load upcoming and past events; create/edit/delete (coordinator); signup/cancel (volunteer/parent)
- `src/components/events/EventCard.tsx` — title, date, time, location, signup count, signed-up badge
- `src/components/events/EventForm.tsx` — create/edit form with center scope selector
- `app/(app)/events/index.tsx` — upcoming list, past events section, create button (coordinator/admin only)
- `app/(app)/opportunities/index.tsx` — same event list for volunteer/substitute persona; volunteer history section

**DoD categories:** A-01, A-02, A-03, B-01, B-02, B-05, B-06, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, F-08, G-01, G-02, G-05, H-01, H-02

**Done when:** Coordinator creates event. Volunteer signs up and sees "Signed Up ✓". Cancelling sets status to `cancelled` (record preserved). Coordinator sees volunteer names. Coordinator cannot create event for another center.

---

### Slice 1-09: Coordinator Dashboard

**PRD reference:** F-11  
**Dependencies:** 1-03 (attendance), 1-04 (updates), 1-06 (absences), 1-07 (announcements composer)

**Goal:** Coordinator sees center health at a glance: compliance summary, absence alerts, announcement composer.

**What to build:**
- `src/hooks/useCoordinatorDashboard.ts` — loads compliance data using `lastSundayISO()` (never MAX); absence alerts with sub request status; all scoped to coordinator's center
- `src/components/dashboard/ComplianceRow.tsx` — class name, attendance indicator, update indicator
- `src/components/dashboard/AbsenceCard.tsx` — teacher name, date, sub status badge, action buttons
- `app/(app)/dashboard/index.tsx` — center header, compliance section, absence alerts section, announcement composer button
- Realtime subscription on `teacher_absences` and `substitute_assignments` for live updates

**DoD categories:** A-01, A-02, A-03, A-07, B-01, B-02, B-05, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, G-02, G-04, H-01, H-02  
**Feature-specific DoD:** All items in `05_DEFINITION_OF_DONE.md` Section 4 — Coordinator Compliance Dashboard

**Done when:** Compliance date shows last Sunday regardless of data presence. Indicators are correct in all four states (both/one/neither submitted). Coordinator at Richardson sees no data from Plano. Absence cards update in real-time.

---

### Slice 1-10: Substitute Request Workflow

**PRD reference:** F-08  
**Dependencies:** 1-09 (coordinator dashboard), 1-06 (absences exist)

**Goal:** Full substitute lifecycle — from open to confirmed or declined and reassigned.

**What to build:**
- `src/hooks/useSubstitute.ts` — load open requests; volunteer; withdraw volunteer; coordinator assign; substitute accept/decline; coordinator reassign
- `src/components/substitute/SubRequestCard.tsx` — class, date, status badge, volunteer count, action buttons per status
- `src/components/substitute/VolunteerList.tsx` — modal showing volunteer names with "Assign" button
- Update `app/(app)/dashboard/index.tsx` — absence cards trigger sub request creation; sub status updates live
- Update `app/(app)/opportunities/index.tsx` — open sub requests for substitutes with "I'm Available" and accept/decline

**DoD categories:** A-01, A-02, A-03, B-01, B-02, B-03, B-05, B-06, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, G-04, H-01, H-02  
**Feature-specific DoD:** All items in `05_DEFINITION_OF_DONE.md` Section 4 — Substitute Request Workflow

**Done when:** Full lifecycle works end-to-end without page refresh. Decline + reassign path works. Coordinator cannot manage sub requests outside their center. Substitute cannot see confirmed assignments they are not assigned to.

---

### Slice 1-11: Central Admin Dashboard

**PRD reference:** F-12  
**Dependencies:** 1-09 (coordinator dashboard patterns)

**Goal:** Central admin sees org-wide metrics across all centers; can drill into center detail.

**What to build:**
- `src/hooks/useAdminDashboard.ts` — aggregate metrics per center; all absences and sub requests org-wide
- `src/components/dashboard/CenterCard.tsx` — center name, enrollment, attendance rate, open sub count, compliance rate
- `app/(app)/dashboard/index.tsx` — role-switches between coordinator view and admin view based on `activePersona.role`
- Academic year selector (read-only for prior years) — `src/components/dashboard/YearSelector.tsx`

**DoD categories:** A-01, A-02, A-03, B-01, B-02, C-01 through C-06, D-01 through D-10, E-01, E-02, E-03, G-01, G-02, H-01, H-02

**Done when:** Central admin sees all three centers. Per-center metrics are correct. Year selector shows prior year data read-only. Drilling into a center shows the coordinator view scoped to that center (read-only for admin).

---

### Slice 1-12: Academic Year Management

**PRD reference:** F-16  
**Dependencies:** 0-02 (schema has `academic_years` table)

**Goal:** Central admin can open a new academic year; all records are stamped correctly; year selector works.

**What to build:**
- `src/hooks/useAcademicYear.ts` — load current year; load all years; create new year (admin only)
- `app/(app)/dashboard/academic-year.tsx` — year management screen: current year display, "Open New Year" form, year list
- `enforce_single_current_year` trigger verified
- Year selector propagated to coordinator and admin dashboard hooks

**DoD categories:** A-01, A-02, A-05, B-01, B-03, C-01 through C-06, D-01 through D-10, E-01, F-01 through F-09, H-01, H-02  
**Feature-specific DoD:** All items in `05_DEFINITION_OF_DONE.md` Section 4 — Academic Year Management

**Done when:** Opening a new year sets exactly one `is_current = true`. Prior year data is unaffected. Year selector on dashboard shows historical data. Insert to a closed year is rejected.

---

### Slice 1-13: User Provisioning (Admin)

**PRD reference:** F-15 (Phase 1 portion)  
**Dependencies:** 0-03 (auth shell)

**Goal:** Coordinator can provision new user accounts without accessing the Supabase dashboard.

**What to build:**
- `app/(app)/dashboard/provision-user.tsx` — form: full name, email, role, center (coordinator's center pre-filled), `is_substitute` toggle
- Calls a Supabase Edge Function `provision_user` that uses the service role key server-side to call `supabase.auth.admin.inviteUserByEmail()`, then creates the `profiles` and `user_roles` rows
- Edge Function validates that a `local_admin` caller can only provision users for their own center
- Result: user receives a magic link invitation email; logs in for the first time
- Bulk CSV import path: admin uploads a CSV; Edge Function processes rows and calls provisioning for each

**What is explicitly not in this slice:**
- No self-registration (Phase 2)

**DoD categories:** A-01, A-02, A-03, B-03, B-05, B-06, B-07, B-08, C-01 through C-06, D-01 through D-10, E-01, E-03, H-01, H-02

**Done when:** Coordinator provisions a new parent account; user receives email and logs in with magic link; correct role and center are set. Coordinator cannot provision a user for a different center. Service role key is only in the Edge Function, not the client.

---

### Slice 1-14: Profile Tab & Sign Out

**PRD reference:** F-17  
**Dependencies:** 0-04 (auth context)

**Goal:** Every user can view their profile, edit their display name, switch persona, and sign out.

**What to build:**
- `app/(app)/profile/index.tsx` — full name, email, role label, center, active academic year; edit name; "Switch Persona" button (multi-persona users only); Sign Out
- "Switch Persona" navigates to `/(auth)/persona-picker`; after selection returns to `/(app)`
- Notifications tab placeholder (`app/(app)/notifications/index.tsx`) — empty state screen

**DoD categories:** A-01, A-02, A-03, B-01, C-01, C-04, C-05, D-01, D-02, H-01, H-02

**Done when:** Display name edit persists. Sign out clears session and returns to login. Persona switch works without re-login. Users without multiple personas do not see the "Switch Persona" button. Notifications tab shows empty state.

---

## 5. Phase 2 — Post-Launch

These slices are built after the first real users are onboarded. They should be completed within the first month of live usage.

---

### Slice 2-01: Self-Registration with Coordinator Approval

**PRD reference:** F-15 (Phase 2 portion)  
**Dependencies:** 1-13 (provisioning exists), 1-09 (coordinator dashboard)

**What to build:**
- "Request Access" link on login screen
- Registration form: name, email, phone (optional), center, role (parent / teacher / volunteer — no student)
- Pending registrations section in coordinator dashboard with Approve / Reject
- 14-day expiry on pending registrations
- Schema: add `status` column to `profiles` (`active` / `pending`)

**Done when:** Pending user cannot access data until approved. Student role unavailable in self-registration form. Coordinator approves — user can log in. Reject — account removed.

---

### Slice 2-02: Push Notifications

**PRD reference:** F-18  
**Dependencies:** 1-10 (substitute workflow), 1-07 (announcements), 1-04 (class updates)

**What to build:**
- Schema: `push_tokens` table
- Permission request on first login
- Token registration (Web Push VAPID for PWA)
- Supabase Edge Functions for each trigger event (new sub request, assignment, class update, announcement)
- Profile tab toggle to disable notifications

**Done when:** Coordinator receives push when teacher reports absence. Substitute receives push when assigned. Parent receives push when class update is posted.

---

### Slice 2-03: Wired Notifications Tab

**PRD reference:** F-19  
**Dependencies:** 2-02 (push infrastructure), 1-01 (feed)

**What to build:**
- In-app notification records table
- Notifications tab: list of unread/read notifications with type icon, summary, timestamp
- Tapping a notification deep-links to the relevant content
- Unread badge on tab icon

---

### Slice 2-04: Phone OTP Login (Optional)

**PRD reference:** F-01 extension  
**Dependencies:** 0-03 (auth shell)

**What to build:**
- Twilio integration in Supabase Auth
- Phone number input option on login screen (alongside email magic link)
- DPA with Twilio confirmed (see `01_SECURITY_AND_COMPLIANCE.md` Section 3.3)

---

### Slice 2-05: Playwright Baseline Test Suite

**PRD reference:** NFR (quality)  
**Dependencies:** All Phase 1 slices complete on staging

**What to build:**
- Playwright installed and configured against the staging environment
- `storageState` credential files for each of the 7 Phase 1 personas
- Test suite covering:
  1. Magic link login for each persona (7 tests)
  2. Teacher marks and submits attendance
  3. Full substitute lifecycle (absence → request → volunteer → assign → accept)
  4. Coordinator compliance dashboard date correctness
  5. Announcement audience isolation (post to teachers; verify parent cannot see it)
- CI integration: Playwright runs on push to `staging`

---

## 6. Phase 3 — Growth

These slices are built 3+ months after launch, once the core system is stable and the user base is established.

---

### Slice 3-01: Board Member Persona & Dashboard

**PRD reference:** F-13  
**Dependencies:** 1-11 (admin dashboard patterns), 1-12 (academic year)

**What to build:**
- `board_member` role added to schema
- RLS policies: read-only access to aggregate views only; blocked from individual records
- Board member dashboard: enrollment totals, weekly attendance rate chart, year-over-year comparison, compliance rate trend
- `board_member` audience value added to announcements

---

### Slice 3-02: Acharya Persona

**PRD reference:** F-14  
**Dependencies:** 1-02 (class roster), 1-07 (announcements)

**What to build:**
- `acharya` role added to schema with RLS policies
- Classes tab (read-only roster)
- Lesson plan upload (Supabase Storage `lesson-plans` bucket)
- Teacher's My Class tab updated to show lesson plan link for current week
- Announcements: Acharya can post to `teacher` and `local_admin` audiences only

---

### Slice 3-03: Training Resources

**PRD reference:** F-20  
**Dependencies:** 3-02 (Acharya persona)

**What to build:**
- `training_resources` table and RLS
- Resources tab (visible to teacher and acharya personas)
- Acharya can add/edit/delete resources
- Teachers see resources read-only

---

### Slice 3-04: Volunteer History

**PRD reference:** F-10 extension  
**Dependencies:** 1-08 (events)

**What to build:**
- "Past Contributions" section in Opportunities tab
- Profile tab: contribution summary card

---

### Slice 3-05: Expanded Playwright Coverage

**Dependencies:** 2-05 (baseline suite), all Phase 1 complete

**What to build:**
- Tests for all 9 personas (adding Board Member and Acharya)
- Comment thread tests (public, private, teacher deletion)
- Multi-persona switch test
- Year selector test (prior year data)
- Registration and approval flow test

---

### Slice 3-06: Audit Logging

**PRD reference:** NFR  
**Dependencies:** All Phase 1 complete

**What to build:**
- `audit_log` table: `user_id`, `action`, `table_name`, `record_id`, `old_values` (jsonb), `new_values` (jsonb), `created_at`
- Trigger-based logging on key tables: `profiles` (update), `attendance` (insert/update), `announcements` (insert/delete), `enrollments` (insert/delete)
- Admin-only read view in the dashboard

---

## 7. Dependency Map

```
0-01 (repo/env)
  └── 0-02 (schema)
        └── 0-03 (auth shell)
              └── 0-04 (persona + nav)
                    │
                    ├── 1-01 (feed) ──────────────────────────────┐
                    │                                             │
                    ├── 1-02 (roster) ──────────────────────┐    │
                    │     └── 1-03 (attendance) ────────┐    │    │
                    │     └── 1-04 (class updates) ─────┤    │    │
                    │           └── 1-05 (comments)     │    │    │
                    │     └── 1-06 (absences) ──────────┤    │    │
                    │                                   │    │    │
                    ├── 1-07 (announcements) ───────────┤    │    │
                    │                                   │    │    │
                    ├── 1-08 (events) ──────────────────┤    │    │
                    │                                   │    │    │
                    │         ┌─────────────────────────┘    │    │
                    │         ▼                              │    │
                    ├── 1-09 (coordinator dashboard) ────────┘    │
                    │     └── 1-10 (sub workflow)                  │
                    │     └── 1-11 (admin dashboard)               │
                    │     └── 1-12 (academic year mgmt)            │
                    │                                             │
                    ├── 1-13 (user provisioning)                  │
                    └── 1-14 (profile + sign out) ────────────────┘

Phase 1 complete
  ├── 2-01 (self-registration)
  ├── 2-02 (push notifications) → 2-03 (notifications tab)
  ├── 2-04 (phone OTP — optional)
  └── 2-05 (Playwright baseline)

Phase 2 complete
  ├── 3-01 (board member)
  ├── 3-02 (acharya) → 3-03 (training resources)
  ├── 3-04 (volunteer history)
  ├── 3-05 (expanded Playwright)
  └── 3-06 (audit logging)
```

---

## 8. Slice Sizing Reference

| Slice | Estimated Size | Rationale |
|---|---|---|
| 0-01 | 3 days | Configuration-heavy, no product logic |
| 0-02 | 3 days | Schema writing + migration verification across 3 environments |
| 0-03 | 3 days | Auth flow, deep link handling, unprovisioned email edge case |
| 0-04 | 4 days | Edge Function, JWT claims, tab visibility matrix |
| 1-01 | 4 days | Pagination + Realtime + 2 card components + 3 states |
| 1-02 | 3 days | Roster hook + component + multi-teacher handling |
| 1-03 | 4 days | Upsert logic + date picker + parent/student views + academic year |
| 1-04 | 3 days | CRUD hook + form + detail screen |
| 1-05 | 4 days | New table + RLS + soft delete + private visibility |
| 1-06 | 2 days | Simple CRUD with guard on delete |
| 1-07 | 3 days | Composer modal + audience multi-select + RLS WITH CHECK |
| 1-08 | 4 days | Events CRUD + signup/cancel + volunteer history |
| 1-09 | 4 days | Compliance logic + absence cards + real-time updates |
| 1-10 | 5 days | 5-state lifecycle + 3 user perspectives + real-time |
| 1-11 | 3 days | Aggregate queries + center drill-down + year selector |
| 1-12 | 2 days | Year management form + trigger verification |
| 1-13 | 4 days | Edge Function + invite flow + CSV import |
| 1-14 | 2 days | Profile display + edit + persona switch |
| **Phase 0+1 total** | **~60 days** | **~12 weeks for a single developer** |

---

*Next document: [07_TEST_PLAN.md](07_TEST_PLAN.md) — Test cases mapped to each slice, covering happy paths, edge cases, error states, and RLS boundary tests.*

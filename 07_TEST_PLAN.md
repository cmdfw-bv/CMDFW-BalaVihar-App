# Test Plan
### CMDFW Bala Vihar App — Document 7 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Approved — all test cases must pass before a slice moves from staging to production  

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Test Environments & Credentials](#2-test-environments--credentials)
3. [Device Matrix](#3-device-matrix)
4. [Test Suite Structure](#4-test-suite-structure)
5. [Phase 0 Tests — Foundation](#5-phase-0-tests--foundation)
6. [Phase 1 Tests — Core Features](#6-phase-1-tests--core-features)
7. [RLS Security Test Suite](#7-rls-security-test-suite)
8. [Regression Checklist](#8-regression-checklist)
9. [Playwright Automation Targets](#9-playwright-automation-targets)
10. [Defect Severity Definitions](#10-defect-severity-definitions)

---

## 1. Testing Philosophy

**Test the contract, not the implementation.** Tests verify that the system does what the PRD and security plan say it should do — not that it's implemented in a particular way. A test that breaks when you rename a variable is a bad test.

**RLS must be tested at the API layer, not the UI layer.** The application layer is UX only (ADR-005). A feature whose security has only been verified by clicking around the app is not tested. Every security-relevant feature must be verified by querying Supabase directly using different user credentials.

**Test the sad paths as carefully as the happy paths.** The happy path works because you built it to work. The sad paths — expired links, missing data, wrong roles, network failures — reveal whether the system is actually robust.

**Each test case is atomic.** Each test case has: a precondition, an action, and an expected result. Tests do not depend on each other's side effects. The test environment can be reset to a known state using the dev seed.

---

## 2. Test Environments & Credentials

All manual testing is performed against the **staging** environment (`balvihar-stage` Supabase project). Never test against production.

### Test Accounts

All test accounts use the magic link flow. The staging Supabase project must have these accounts provisioned before testing begins.

| Email | Persona(s) | Center | Notes |
|---|---|---|---|
| `admin@test.com` | Central Admin | — | Org-wide access |
| `coordinator.richardson@test.com` | Coordinator, Parent, Volunteer | Richardson | 3 personas — tests multi-persona picker |
| `coordinator.plano@test.com` | Coordinator | Plano | Single persona |
| `coordinator.frisco@test.com` | Coordinator | Frisco | Single persona |
| `teacher.one@test.com` | Teacher, Substitute | Richardson | 2 personas; assigned to Grade 5 + Grade 6 |
| `teacher.two@test.com` | Teacher | Richardson | Single persona; assigned to Grade 7 |
| `parent.one@test.com` | Parent | Richardson | 2 children enrolled (Grade 5, Grade 6) |
| `parent.two@test.com` | Parent, Volunteer | Plano | 2 personas; 1 child enrolled |
| `student.one@test.com` | Student | Richardson | Child of parent.one; enrolled Grade 5 |
| `sub@test.com` | Teacher, Substitute | Richardson | `is_substitute = true` |
| `volunteer@test.com` | Volunteer | Frisco | Single persona |
| `unprovisioned@test.com` | — | — | This email must NOT have a profiles row |

### Magic Link Testing Procedure

Because magic links require email access, the staging Supabase project must be configured with a test email provider that captures outbound emails without delivering them (e.g. Supabase's built-in email log in the Auth dashboard, or Inbucket for local testing).

For manual testing: use the Supabase Auth dashboard → Users → "Send magic link" to generate a link directly, bypassing email delivery.

---

## 3. Device Matrix

Every Phase 1 feature must be tested on at minimum:

| Device / Browser | Required | Notes |
|---|---|---|
| iOS Safari — PWA installed (Add to Home Screen) | ✅ Required | Primary mobile target |
| Android Chrome — PWA installed | ✅ Required | Primary Android target |
| Desktop Chrome | ✅ Required | Coordinator/Admin primary surface |
| Desktop Safari | ✅ Required | Mac users |
| iOS Safari — browser (not installed) | ⚠️ Spot-check | Some users won't install |
| Android Chrome — browser (not installed) | ⚠️ Spot-check | |

**Minimum screen widths to verify:** 375px (iPhone SE), 390px (iPhone 14), 768px (iPad), 1280px (desktop).

---

## 4. Test Suite Structure

Tests are organized by slice. Each slice section contains:

- **Happy path tests** — the feature works as intended
- **Edge case tests** — boundary conditions, empty states, unusual inputs
- **Error state tests** — network failures, invalid inputs, expired tokens
- **Security tests** — RLS boundary verification (these also appear in the consolidated RLS suite in Section 7)

**Test case ID format:** `T-[slice]-[sequence]`  
Example: `T-103-05` = Slice 1-03, test case 5.

**Pass/fail notation:**
- ✅ Pass
- ❌ Fail (blocks deployment)
- ⚠️ Known issue (must be logged, may not block if severity is Low)
- N/A Not applicable to this configuration

---

## 5. Phase 0 Tests — Foundation

### Slice 0-03: Authentication Shell

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-003-01 | User `parent.one@test.com` exists in `profiles` | Enter email, tap "Send Magic Link" | App shows "Check your email" screen displaying the email address |
| T-003-02 | Magic link received | Tap the magic link | App opens and navigates to home screen (or persona picker) |
| T-003-03 | User is authenticated | Tap "Sign Out" on Profile tab | Session cleared; app returns to login screen |
| T-003-04 | User is on "Check your email" screen | Wait 60 seconds, tap "Resend link" | New magic link sent; confirmation shown |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-003-05 | Valid magic link | Wait 61 minutes; tap the link | App shows "This link has expired. Request a new one." |
| T-003-06 | Valid magic link | Tap the link twice | Second tap shows "This link has already been used. Request a new one." |
| T-003-07 | On "Check your email" screen | Tap "Resend link" immediately (< 60s) | Button is disabled; countdown timer visible |
| T-003-08 | — | Enter `unprovisioned@test.com`; receive and tap magic link | App shows "This email is not registered. Contact your coordinator." User is signed out. |
| T-003-09 | User is authenticated; session expires (simulate by revoking in Supabase dashboard) | Attempt any navigation in the app | Redirected to login with "Your session has expired — please sign in again" |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-003-S01 | Without any JWT, query `SELECT * FROM profiles` directly via Supabase client | Returns empty array (not a 403 — RLS returns empty by design) |
| T-003-S02 | With an expired JWT, query any table | Returns empty array or auth error |

---

### Slice 0-04: Multi-Persona Auth & Navigation

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-004-01 | `coordinator.richardson@test.com` has 3 personas | Log in | Persona picker shows 3 tiles: Coordinator, Parent, Volunteer |
| T-004-02 | Persona picker visible | Select "Parent · Richardson" | App loads with: Feed, My Children, Events, Profile tabs visible; Dashboard tab absent |
| T-004-03 | Active persona is Parent | Navigate to Profile; tap "Switch Persona" | Persona picker appears |
| T-004-04 | On persona picker | Select "Coordinator · Richardson" | App reloads with coordinator tabs; no re-login required |
| T-004-05 | `teacher.one@test.com` has 2 personas | Log in | Persona picker shows 2 tiles: Teacher, Substitute |
| T-004-06 | `admin@test.com` has 1 persona | Log in | Persona picker is skipped; app loads directly with admin tabs |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-004-S01 | Authenticated as `parent.one@test.com` (parent persona active); directly query `SELECT * FROM class_teachers` | Returns empty (parent has no class teacher access) |
| T-004-S02 | Authenticated as any non-admin; query `SELECT * FROM profiles WHERE id != auth.uid()` | Returns only the rows RLS permits for that role |

---

## 6. Phase 1 Tests — Core Features

### Slice 1-01: Home Feed

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-101-01 | `teacher.one@test.com` active as Teacher | Open Feed tab | Feed shows class updates for Grade 5 and Grade 6 (teacher's classes) + teacher-targeted announcements |
| T-101-02 | `parent.one@test.com` active as Parent | Open Feed tab | Feed shows class updates for Grade 5 and Grade 6 (parent's children's classes) + parent-targeted announcements |
| T-101-03 | `student.one@test.com` active as Student | Open Feed tab | Feed shows class updates for Grade 5 only + student-targeted announcements |
| T-101-04 | Feed has > 20 items | Scroll to bottom of feed | "Load more" triggers; next 20 items append; scroll position preserved |
| T-101-05 | `coordinator.plano@test.com` posts a new announcement to "Parents" | Monitor `parent.one@test.com` feed (Richardson) | Announcement does NOT appear (different center) |
| T-101-06 | `coordinator.richardson@test.com` posts a new announcement to "Parents" | Monitor `parent.one@test.com` feed | Announcement appears within 3 seconds (Realtime) without refresh |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-101-07 | Fresh account with no data | Open Feed tab | Empty state: "Nothing here yet — check back after Sunday's session" |
| T-101-08 | Device goes offline after feed loads | Scroll the already-loaded feed | Loaded content remains visible; "You're offline" banner appears |
| T-101-09 | Announcement body is 500 characters | View in feed | Body truncates at 3 lines with "Read more" tap target |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-101-S01 | Authenticated as `student.one@test.com`; query `SELECT * FROM announcements WHERE 'teacher' = ANY(audience)` | Returns empty (RLS filters by active role) |
| T-101-S02 | Authenticated as `parent.one@test.com`; query `SELECT * FROM class_updates` (no filter) | Returns only updates for Grade 5 and Grade 6 (parent's children's classes) |
| T-101-S03 | Unauthenticated; query `SELECT * FROM announcements` | Returns empty |

---

### Slice 1-02: Teacher Class Roster

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-102-01 | `teacher.one@test.com` assigned to Grade 5 and Grade 6 | Open My Class tab | Both classes visible; can toggle between them |
| T-102-02 | Grade 5 selected | View roster | All enrolled students listed alphabetically by last name |
| T-102-03 | `student.one@test.com` active as Student | Open My Class tab | Shows own class info (Grade 5) and personal attendance summary; no roster of other students |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-102-S01 | Authenticated as `teacher.one@test.com`; query `SELECT * FROM enrollments WHERE class_id = [grade-7-id]` | Returns empty (Grade 7 is teacher.two's class) |
| T-102-S02 | Authenticated as `parent.one@test.com`; query `SELECT * FROM enrollments WHERE student_id = [student-two-id]` | Returns empty (not parent.one's child) |

---

### Slice 1-03: Attendance

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-103-01 | `teacher.one@test.com` on My Class tab | Tap "Take Attendance"; select last Sunday | Roster appears with status buttons (P/A/E) per student; all unset |
| T-103-02 | All students marked | Tap "Submit Attendance" | "✓ Submitted" banner appears; records saved |
| T-103-03 | Attendance already submitted for last Sunday | Open attendance for same date | Existing records shown pre-filled; can be corrected |
| T-103-04 | Attendance submitted | `parent.one@test.com` opens My Children tab | Attendance percentage updated; session row visible in history |
| T-103-05 | `student.one@test.com` opens My Class tab | View personal attendance | Percentage and session-by-session history visible |
| T-103-06 | Teacher submits attendance | Verify `academic_year` column | Row has `academic_year = current_academic_year()` value |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-103-07 | On attendance date picker | Select a date two weeks in the future | Date is not selectable (future dates blocked) |
| T-103-08 | On attendance date picker | Select a Sunday from the prior academic year | Date is not selectable (closed year blocked) |
| T-103-09 | Class has 0 enrolled students | Open attendance | Empty state: "No students enrolled in this class" |
| T-103-10 | Attendance submitted mid-session; one student leaves early | Re-open same date; change one status | Upsert updates only that student's record; others unchanged |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-103-S01 | Authenticated as `teacher.one@test.com`; attempt INSERT into `attendance` with `class_id = [grade-7-id]` | Rejected by RLS WITH CHECK |
| T-103-S02 | Authenticated as `parent.one@test.com`; query `SELECT * FROM attendance WHERE student_id = [student-not-parent's-child]` | Returns empty |
| T-103-S03 | Authenticated as `student.one@test.com`; query `SELECT * FROM attendance WHERE student_id != auth.uid()` | Returns empty |

---

### Slice 1-04: Class Updates

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-104-01 | `teacher.one@test.com` on My Class tab | Tap "Post Class Update"; fill content + homework; submit | Update saved; appears in teacher's own feed within 3 seconds |
| T-104-02 | Update exists | `parent.one@test.com` opens Feed | Class update card visible; tapping opens full detail with content and homework |
| T-104-03 | Update exists | `teacher.one@test.com` taps edit on the update | Form opens pre-filled; edit saves without creating duplicate |
| T-104-04 | Update exists | `teacher.one@test.com` deletes the update | Update removed from feed for all users |
| T-104-05 | Two teachers assigned to Grade 5 | Either teacher posts update | Update visible to both teachers in feed |
| T-104-06 | Update posted | Check `academic_year` column | Stamped with current academic year |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-104-07 | Update already exists for last Sunday | Teacher selects same date | Form opens in edit mode (not a new blank form) |
| T-104-08 | Content field empty | Tap Submit | Validation error: "Content is required" |
| T-104-09 | `student.one@test.com` views My Class tab | View updates | Sees updates for their enrolled class only |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-104-S01 | Authenticated as `teacher.one@test.com`; attempt INSERT into `class_updates` with `class_id = [grade-7-id]` | Rejected by RLS WITH CHECK |
| T-104-S02 | Authenticated as `parent.one@test.com`; query `class_updates` for a class their child is not enrolled in | Returns empty |

---

### Slice 1-05: Comments on Class Updates

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-105-01 | `parent.one@test.com` viewing a class update | Type a comment; leave toggle as "Public"; submit | Comment appears immediately; visible to all enrolled families |
| T-105-02 | `parent.one@test.com` posts a Private comment | Toggle to "Private to Teacher"; submit | Comment shows private badge; visible to parent and teacher only |
| T-105-03 | `teacher.one@test.com` views the same update | View comments | Sees public comment + parent.one's private comment |
| T-105-04 | `student.one@test.com` views the same update | View comment input | Private toggle is not present in the UI |
| T-105-05 | `parent.one@test.com` posted a comment | Tap delete on own comment | Comment shows "This comment was removed" placeholder |
| T-105-06 | `parent.two@test.com` (different parent) posted a comment | `teacher.one@test.com` deletes it | Comment shows "This comment was removed" placeholder |
| T-105-07 | Comment exists | Comment count on class update card | Shows correct count; increments in real-time on new comment |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-105-08 | Comment body is empty | Tap submit | Validation error: "Comment cannot be empty" |
| T-105-09 | Class update deleted by teacher | All associated comments | Comments are cascade-deleted (no orphaned comments) |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-105-S01 | Authenticated as `student.one@test.com`; attempt INSERT into `class_update_comments` with `is_private = true` | Rejected by RLS WITH CHECK |
| T-105-S02 | Authenticated as `parent.two@test.com`; query private comments on a class update where `author_id != auth.uid()` | Returns only public comments; private comments from parent.one not visible |
| T-105-S03 | Authenticated as `parent.one@test.com`; attempt DELETE on `teacher.two@test.com`'s comment | Rejected (can only delete own comments) |

---

### Slice 1-06: Teacher Absence Reporting

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-106-01 | `teacher.one@test.com` on My Class tab | Tap "Report Absence"; select next Sunday; pick "Family travel"; submit | Absence appears in "My Upcoming Absences" list |
| T-106-02 | Absence exists with no sub assignment | Tap "Cancel" on the absence | Absence removed from list |
| T-106-03 | Absence reported | `coordinator.richardson@test.com` opens Dashboard | Absence alert card appears within 3 seconds (Realtime) |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-106-04 | On absence date picker | Select a past date | Date not selectable |
| T-106-05 | Absence already reported for next Sunday | Attempt to report another absence for the same date | Error: "You already have an absence reported for this date" |
| T-106-06 | Sub assignment exists for the absence | Tap "Cancel" on the absence | Error: "A substitute request has been created. Contact your coordinator to cancel." Cancel button disabled. |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-106-S01 | Authenticated as `teacher.one@test.com`; attempt INSERT into `teacher_absences` with `teacher_id = [teacher.two-id]` | Rejected by RLS WITH CHECK |
| T-106-S02 | Authenticated as `parent.one@test.com`; query `SELECT * FROM teacher_absences` | Returns empty |

---

### Slice 1-07: Announcements

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-107-01 | `coordinator.richardson@test.com` (Coordinator persona) | Post announcement: "Teachers only"; center = Richardson | Visible to `teacher.one@test.com` (Richardson); invisible to `parent.one@test.com` |
| T-107-02 | `admin@test.com` posts org-wide announcement | All personas in all centers | Announcement visible to all users across all centers |
| T-107-03 | `coordinator.richardson@test.com` posts announcement | Check `academic_year` | Stamped with current academic year |
| T-107-04 | Coordinator posted an announcement | Coordinator edits it | Updated content visible in feed |
| T-107-05 | Coordinator posted an announcement | Coordinator deletes it | Announcement removed from all feeds |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-107-06 | Announcement body is empty | Tap post | Validation error: "Body is required" |
| T-107-07 | `coordinator.plano@test.com` views announcement composer | Check center scope selector | "All Centers" option is not present; center is locked to Plano |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-107-S01 | Authenticated as `coordinator.richardson@test.com`; attempt INSERT into `announcements` with `center_id = NULL` | Rejected by RLS WITH CHECK |
| T-107-S02 | Authenticated as `coordinator.richardson@test.com`; attempt INSERT with `center_id = [plano-center-id]` | Rejected by RLS WITH CHECK |
| T-107-S03 | Authenticated as `teacher.one@test.com`; attempt INSERT into `announcements` | Rejected by RLS |
| T-107-S04 | Authenticated as `student.one@test.com`; query `announcements WHERE 'teacher' = ANY(audience)` | Returns empty |

---

### Slice 1-08: Events & Volunteer Signups

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-108-01 | `coordinator.richardson@test.com` creates an event | Fill all fields; submit | Event appears in Events tab for all Richardson users |
| T-108-02 | Event exists | `parent.two@test.com` (Volunteer persona) taps "Sign Up" | Button changes to "Signed Up ✓"; signup count increments |
| T-108-03 | Signed up | `parent.two@test.com` taps "Cancel" | Status set to `cancelled`; button returns to "Sign Up" |
| T-108-04 | Signups exist | `coordinator.richardson@test.com` expands event card | List of signed-up volunteer names visible |
| T-108-05 | Past event | User opens Events tab | Past event visible in "Past Events" section |
| T-108-06 | `parent.two@test.com` signed up for past event | Opens Opportunities tab | Past event visible under "Past Contributions" |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-108-S01 | Authenticated as `coordinator.richardson@test.com`; attempt INSERT into `events` with `center_id = [plano-id]` | Rejected by RLS WITH CHECK |
| T-108-S02 | Authenticated as `student.one@test.com`; attempt INSERT into `volunteer_signups` | Rejected (student role not in allowed roles for this action) |

---

### Slice 1-09: Coordinator Dashboard

#### Happy Path

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-109-01 | Today is Monday; last Sunday = 2026-06-07; attendance submitted for Grade 5 but not Grade 6 | `coordinator.richardson@test.com` opens Dashboard | Grade 5 row shows ✓ for attendance; Grade 6 shows ⚠ |
| T-109-02 | Same state | Grade 6 class update has been posted | Grade 6 shows ✓ for update, ⚠ for attendance |
| T-109-03 | Neither attendance nor update submitted for Grade 7 | View compliance row | Grade 7 shows ✗ |
| T-109-04 | Teacher reports absence | Coordinator's absence alert card | New card appears within 3 seconds; shows teacher name, date, "Post Sub Request" button |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-109-05 | No attendance or updates exist in database | Coordinator opens compliance section | Compliance date shows last Sunday; all classes show ✗ (not blank/error) |
| T-109-06 | Seed records deleted | Compliance view | Indicators do not change based on seed data presence or absence |
| T-109-07 | It is currently Sunday morning before any submissions | Compliance date | Shows today (Sunday) as the reference date |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-109-S01 | Authenticated as `coordinator.richardson@test.com`; query `attendance` with no center filter | Returns only attendance for Richardson classes |
| T-109-S02 | Authenticated as `coordinator.plano@test.com`; query `teacher_absences` | Returns only absences for Plano teachers |

---

### Slice 1-10: Substitute Request Workflow

#### Happy Path — Full Lifecycle

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-110-01 | Teacher absence exists; no sub request | Coordinator taps "Post Sub Request" | Assignment created with `status = open`; card updates to "Awaiting volunteers" |
| T-110-02 | Sub request is open | `sub@test.com` (Substitute persona) opens Opportunities tab | Open sub request visible with class, date, center details |
| T-110-03 | Sub request is open | `sub@test.com` taps "I'm Available" | Volunteer record created; request card shows "1 volunteer" |
| T-110-04 | Volunteer exists | Coordinator taps "View Volunteers"; selects `sub@test.com`; taps "Assign" | Status → `pending`; `sub@test.com` sees "Pending Assignment" with Accept/Decline |
| T-110-05 | Assignment is pending | `sub@test.com` taps "Accept" | Status → `confirmed`; coordinator dashboard card shows "✅ [name] confirmed" |
| T-110-06 | Assignment is confirmed | Absent teacher views their My Class tab | Shows "Sub confirmed: [name]" for that date (read-only) |

#### Happy Path — Decline & Reassign

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-110-07 | Assignment is pending | `sub@test.com` taps "Decline" | Status → `open`; coordinator card reverts to "Reassign" state |
| T-110-08 | Back to open; second volunteer exists | Coordinator assigns second volunteer | Status → `pending` for new sub; first volunteer's record retained |

#### Edge Cases

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-110-09 | Sub request is confirmed | `sub@test.com` attempts to withdraw volunteer | Not possible (assignment confirmed); no option shown |
| T-110-10 | No volunteers have raised hand | Coordinator views sub request | "No volunteers yet" state shown; no "Assign Sub" button |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-110-S01 | Authenticated as `coordinator.plano@test.com`; attempt to create a sub assignment for a Richardson class | Rejected by RLS WITH CHECK |
| T-110-S02 | Authenticated as `sub@test.com`; query `substitute_assignments` for a confirmed request where `substitute_id != auth.uid()` | Returns empty |
| T-110-S03 | Authenticated as `parent.one@test.com`; query `substitute_assignments` | Returns empty |

---

### Slice 1-11: Central Admin Dashboard

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-111-01 | `admin@test.com` opens Dashboard | — | All three centers visible as cards |
| T-111-02 | Richardson has 2 open sub requests | View Richardson center card | "2 open sub requests" shown on card |
| T-111-03 | Admin selects prior academic year from year selector | View dashboard | Data reflects prior year; current-year data not shown |
| T-111-04 | Admin taps Richardson center card | — | Coordinator-style detail view for Richardson (read-only) |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-111-S01 | Authenticated as `coordinator.richardson@test.com`; query `centers` | Returns only Richardson center |
| T-111-S02 | Authenticated as `admin@test.com`; query `centers` | Returns all 3 centers |

---

### Slice 1-12: Academic Year Management

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-112-01 | `admin@test.com` | Open Year Management; create "2026-27" with start/end dates; mark as current | New year created; prior year `is_current` set to false |
| T-112-02 | New year is current | Teacher submits attendance | `academic_year = '2026-27'` on new record |
| T-112-03 | Prior year "2025-26" exists | Coordinator selects "2025-26" from year selector | Dashboard shows 2025-26 data; no 2026-27 data visible |
| T-112-04 | "2025-26" is closed | Attempt to insert attendance for closed year | Operation rejected |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-112-S01 | Authenticated as `coordinator.richardson@test.com`; attempt INSERT into `academic_years` | Rejected by RLS (admin only) |

---

### Slice 1-13: User Provisioning

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-113-01 | `coordinator.richardson@test.com` opens provision form | Fill name, email `newparent@test.com`, role Parent, center Richardson | User created; magic link invitation sent |
| T-113-02 | New user receives invitation | Tap magic link | Logs in; sees parent tabs; center is Richardson |
| T-113-03 | Coordinator provisions user | Check `profiles` row | `role = 'parent'`, `center_id = [richardson-id]` |

#### Security Tests

| ID | Test | Expected Result |
|---|---|---|
| T-113-S01 | Authenticated as `coordinator.richardson@test.com`; attempt to provision user for Plano center | Edge Function rejects (coordinator can only provision for own center) |
| T-113-S02 | Confirm service role key is absent | `grep -r "service_role" src/ app/` | No matches |

---

### Slice 1-14: Profile & Sign Out

| ID | Precondition | Action | Expected Result |
|---|---|---|---|
| T-114-01 | Any authenticated user | Open Profile tab | Name, email, role, center, current academic year all displayed correctly |
| T-114-02 | User edits display name | Save | New name visible in profile and in feed post attributions |
| T-114-03 | `coordinator.richardson@test.com` (3 personas) | Open Profile tab | "Switch Persona" button visible |
| T-114-04 | Single-persona user (`volunteer@test.com`) | Open Profile tab | "Switch Persona" button not present |
| T-114-05 | Any user | Tap "Sign Out" | Session cleared server-side; app returns to login screen |

---

## 7. RLS Security Test Suite

This section consolidates all security tests into a single runnable suite that can be executed against the staging environment using the Supabase JS client directly (e.g. in a browser console or a standalone test script). Run this suite after every migration change and before every production deployment.

### How to Run

```typescript
// In browser console on the staging PWA, or in a Node.js test script:
// 1. Sign in as the test user using magic link
// 2. Run each query and verify the result matches "Expected"

const { createClient } = require('@supabase/supabase-js')
const supabase = createClient(STAGING_URL, STAGING_ANON_KEY)

// Authenticate as test user first:
// await supabase.auth.signInWithOtp({ email: 'student.one@test.com' })
// (retrieve session from email, then set it)
```

### Suite: Unauthenticated Access

| ID | Query | Expected |
|---|---|---|
| S-00-01 | `SELECT * FROM profiles` (no auth) | `[]` empty |
| S-00-02 | `SELECT * FROM attendance` (no auth) | `[]` empty |
| S-00-03 | `SELECT * FROM announcements` (no auth) | `[]` empty |
| S-00-04 | `SELECT * FROM class_updates` (no auth) | `[]` empty |
| S-00-05 | `SELECT * FROM enrollments` (no auth) | `[]` empty |

### Suite: Student Isolation

Authenticated as `student.one@test.com` (enrolled in Grade 5, Richardson):

| ID | Query | Expected |
|---|---|---|
| S-01-01 | `SELECT * FROM attendance WHERE student_id = auth.uid()` | Own records only |
| S-01-02 | `SELECT * FROM attendance WHERE student_id != auth.uid()` | `[]` empty |
| S-01-03 | `SELECT * FROM enrollments WHERE student_id != auth.uid()` | `[]` empty |
| S-01-04 | `SELECT * FROM family_members` | `[]` empty (student has no family_members rows as parent) |
| S-01-05 | `SELECT * FROM class_updates WHERE class_id = [grade-7-id]` | `[]` empty (not enrolled) |
| S-01-06 | `INSERT INTO attendance (...)` (any record) | Rejected |
| S-01-07 | `INSERT INTO class_update_comments (..., is_private: true)` | Rejected |
| S-01-08 | `SELECT * FROM teacher_absences` | `[]` empty |
| S-01-09 | `SELECT * FROM substitute_assignments` | `[]` empty |

### Suite: Parent Isolation

Authenticated as `parent.one@test.com` (children in Grade 5 and Grade 6, Richardson):

| ID | Query | Expected |
|---|---|---|
| S-02-01 | `SELECT * FROM family_members WHERE parent_id = auth.uid()` | 2 rows (own children) |
| S-02-02 | `SELECT * FROM family_members WHERE parent_id != auth.uid()` | `[]` empty |
| S-02-03 | `SELECT * FROM attendance WHERE student_id = [student-not-children]` | `[]` empty |
| S-02-04 | `SELECT * FROM class_updates WHERE class_id = [grade-7-id]` | `[]` empty (child not enrolled) |
| S-02-05 | `INSERT INTO attendance (...)` | Rejected |
| S-02-06 | `SELECT * FROM teacher_absences` | `[]` empty |
| S-02-07 | `SELECT * FROM profiles WHERE id != auth.uid() AND id NOT IN (SELECT student_id FROM family_members WHERE parent_id = auth.uid())` | `[]` empty |

### Suite: Teacher Isolation

Authenticated as `teacher.one@test.com` (assigned Grade 5 and Grade 6, Richardson):

| ID | Query | Expected |
|---|---|---|
| S-03-01 | `SELECT * FROM enrollments WHERE class_id = [grade-5-id]` | Grade 5 enrollments |
| S-03-02 | `SELECT * FROM enrollments WHERE class_id = [grade-7-id]` | `[]` empty |
| S-03-03 | `INSERT INTO attendance (..., class_id: [grade-7-id])` | Rejected by WITH CHECK |
| S-03-04 | `INSERT INTO class_updates (..., class_id: [grade-7-id])` | Rejected by WITH CHECK |
| S-03-05 | `SELECT * FROM profiles WHERE center_id = [plano-id]` | `[]` empty |
| S-03-06 | `SELECT * FROM announcements WHERE center_id = [plano-id]` | `[]` empty |

### Suite: Coordinator Scope

Authenticated as `coordinator.richardson@test.com` (Richardson center):

| ID | Query | Expected |
|---|---|---|
| S-04-01 | `SELECT * FROM profiles WHERE center_id = [plano-id]` | `[]` empty |
| S-04-02 | `SELECT * FROM teacher_absences` (no filter) | Only Richardson teacher absences |
| S-04-03 | `INSERT INTO announcements (..., center_id: NULL)` | Rejected by WITH CHECK |
| S-04-04 | `INSERT INTO announcements (..., center_id: [plano-id])` | Rejected by WITH CHECK |
| S-04-05 | `INSERT INTO substitute_assignments (..., class_id: [plano-grade-5-id])` | Rejected by WITH CHECK |
| S-04-06 | `SELECT * FROM substitute_assignments` | Only Richardson assignments |

### Suite: Cross-Role Escalation

| ID | Authenticated As | Query / Action | Expected |
|---|---|---|---|
| S-05-01 | `student.one@test.com` | `INSERT INTO announcements (...)` | Rejected |
| S-05-02 | `parent.one@test.com` | `INSERT INTO class_updates (...)` | Rejected |
| S-05-03 | `teacher.one@test.com` | `INSERT INTO announcements (...)` | Rejected |
| S-05-04 | `sub@test.com` | `UPDATE substitute_assignments SET status = 'confirmed'` directly | Rejected (substitute can only accept via the status lifecycle, not arbitrary updates) |
| S-05-05 | `volunteer@test.com` | `SELECT * FROM family_members` | `[]` empty |
| S-05-06 | Any non-admin | `INSERT INTO academic_years (...)` | Rejected |
| S-05-07 | Any non-admin | `INSERT INTO centers (...)` | Rejected |

---

## 8. Regression Checklist

Run this checklist after every deployment to staging. It is a fast smoke test — not exhaustive, but catches the most common regressions.

| # | Check | How |
|---|---|---|
| R-01 | Magic link login works | Log in as `parent.one@test.com` |
| R-02 | Persona picker shows correct personas | Log in as `coordinator.richardson@test.com`; verify 3 tiles |
| R-03 | Feed loads and paginates | Scroll to bottom of feed as teacher |
| R-04 | Attendance submit works | Submit attendance as `teacher.one@test.com` for last Sunday |
| R-05 | Compliance date is last Sunday | Open coordinator dashboard; verify compliance reference date |
| R-06 | Coordinator cannot post org-wide announcement | Try `INSERT` with `center_id = NULL` directly (S-04-03) |
| R-07 | RLS unauthenticated check | Run S-00-01 through S-00-05 |
| R-08 | Student cannot see teacher announcements | Run S-01-06 / T-101-S01 |
| R-09 | Feed realtime updates | Post announcement; verify it appears in another tab within 3 seconds |
| R-10 | Sign out clears session | Sign out; verify login screen shown; direct navigation to app redirects to login |

---

## 9. Playwright Automation Targets

Manual testing covers all cases above. Playwright automation is added in Slice 2-05 and expanded in Slice 3-05. This section defines which cases are highest priority for automation.

### Priority 1 — Must Automate (Slice 2-05)

These are the tests most likely to silently break and hardest to catch manually:

| Test | Reason for Priority |
|---|---|
| Magic link login for all 7 personas | Auth is the entry point — a broken login breaks everything |
| Teacher submits attendance (T-103-01, T-103-02) | Core daily workflow; regressions affect every teacher |
| Full substitute lifecycle (T-110-01 through T-110-05) | 5-step workflow with 3 user perspectives; manual testing is slow |
| Coordinator compliance date check (T-109-05, T-109-06) | Previously broken; must never regress |
| Announcement audience isolation (T-107-S01, T-101-S01) | Security regression; invisible without explicit test |

### Priority 2 — Automate in Slice 3-05

| Test | Reason |
|---|---|
| Comment visibility (public vs private) | Privacy regression risk |
| Multi-persona switch | Complex state transition |
| Academic year selector (T-111-03) | Year-over-year data isolation |
| Full self-registration flow (Phase 2) | Multi-step approval workflow |

### Playwright Configuration Notes

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.STAGING_URL,
    // Each test file gets its own storageState (pre-authenticated session)
    // storageState is set per-project below
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox',  use: { browserName: 'firefox' } },
    { name: 'webkit',   use: { browserName: 'webkit' } },  // covers iOS Safari behaviour
  ],
})

// e2e/auth.setup.ts — run once to generate storageState files per persona
// Stores authenticated session to e2e/.auth/[persona].json
// Tests load these files instead of re-authenticating each run
```

---

## 10. Defect Severity Definitions

| Severity | Definition | Action |
|---|---|---|
| **P1 — Critical** | Security vulnerability (RLS bypass, data exposure, auth bypass); app is completely unusable for a persona | Block deployment immediately; fix before any user touches staging |
| **P2 — High** | Core workflow broken (cannot submit attendance, sub request lifecycle broken, cannot log in); data loss risk | Block deployment; fix in current slice |
| **P3 — Medium** | Feature partially broken; workaround exists; incorrect data displayed without security impact | Log as defect; fix before production deployment |
| **P4 — Low** | UI inconsistency, cosmetic issue, minor copy error | Log in backlog; fix in next available slot; does not block deployment |

**Any P1 or P2 defect found during testing blocks the slice from advancing to production** regardless of how many other tests pass.

---

*Next document: [08_OPERATIONS_RUNBOOK.md](08_OPERATIONS_RUNBOOK.md) — Environments, CI/CD procedures, backup and recovery, monitoring, and incident response.*

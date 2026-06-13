# Product Requirements Document
### CMDFW Bala Vihar App — Document 3 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Approved — governs all feature development decisions  

---

## Table of Contents

1. [Product Purpose](#1-product-purpose)
2. [Personas](#2-personas)
3. [Core Concepts & Terminology](#3-core-concepts--terminology)
4. [Feature Specifications](#4-feature-specifications)
   - [F-01 Authentication & Account Management](#f-01-authentication--account-management)
   - [F-02 Multi-Persona Login & Switching](#f-02-multi-persona-login--switching)
   - [F-03 Home Feed](#f-03-home-feed)
   - [F-04 Attendance](#f-04-attendance)
   - [F-05 Class Updates](#f-05-class-updates)
   - [F-06 Comments on Class Updates](#f-06-comments-on-class-updates)
   - [F-07 Teacher Absence Reporting](#f-07-teacher-absence-reporting)
   - [F-08 Substitute Request Workflow](#f-08-substitute-request-workflow)
   - [F-09 Announcements](#f-09-announcements)
   - [F-10 Events & Volunteer Signups](#f-10-events--volunteer-signups)
   - [F-11 Coordinator Dashboard](#f-11-coordinator-dashboard)
   - [F-12 BV Coordinator Dashboard](#f-12-central-admin-dashboard)
   - [F-13 Board Member Dashboard](#f-13-board-member-dashboard)
   - [F-14 Acharya Experience](#f-14-acharya-experience)
   - [F-15 User Onboarding & Self-Registration](#f-15-user-onboarding--self-registration)
   - [F-16 Academic Year Management](#f-16-academic-year-management)
   - [F-17 Profile & Settings](#f-17-profile--settings)
   - [F-18 Push Notifications](#f-18-push-notifications)
   - [F-19 Notifications Tab](#f-19-notifications-tab)
   - [F-20 Lesson Plans & Training Resources](#f-20-lesson-plans--training-resources)
5. [Non-Functional Requirements](#5-non-functional-requirements)
6. [Out of Scope](#6-out-of-scope)
7. [Feature Phasing](#7-feature-phasing)
8. [Open Questions](#8-open-questions)

---

## 1. Product Purpose

The CMDFW Bala Vihar App is a mobile-first progressive web application (PWA) for managing religious education programs. It serves as a single platform for all participants in the program — organizers, teachers, families, and volunteers — replacing fragmented coordination through WhatsApp groups, spreadsheets, and phone calls.

**Core insight:** The same person often wears multiple hats (a parent who also volunteers; a teacher who is also a parent and a coordinator). The app gives each hat a focused, purpose-built experience — the right information, the right actions, nothing extraneous.

**Deployment:** Expo React Native, built as a PWA, hosted on Netlify. Installable on iOS, Android, and desktop via the browser. No app store required.

**Backend:** Supabase (PostgreSQL + Auth + Realtime + Storage). All access control enforced at the database layer via Row Level Security.

---

## 2. Personas

The app supports nine personas organized into four groups.

### Group 1 — Organizers

| Persona | Role Value | Scope | Phase |
|---|---|---|---|
| **BV Coordinator** | `bv_coordinator` | Entire organization, all centers, all sessions | Phase 1 |
| **Coordinator** | `local_admin` | One assigned session | Phase 1 |

### Group 2 — Core Curriculum

| Persona | Role Value | Scope | Phase |
|---|---|---|---|
| **Teacher** | `teacher` | Their assigned class | Phase 1 |
| **Parent** | `parent` | Their own children's records | Phase 1 |
| **Student** | `student` | Their own record | Phase 1 |

### Group 3 — Non-Core Curriculum

| Persona | Role Value | Scope | Phase |
|---|---|---|---|
| **Volunteer** | `volunteer` (in `user_roles`) | Org-wide events | Phase 1 |
| **Substitute Teacher** | `teacher` + `is_substitute = true` | Open sub requests | Phase 1 |

### Group 4 — Leadership & Curriculum

| Persona | Role Value | Scope | Phase |
|---|---|---|---|
| **Board Member** | `board_member` | Read-Only - Entire organization, all centers, all sessions | Phase 1 |
| **Acharya** | `acharya` | Read-Only - Entire organization, all centers, all sessions, curriculum guidance, training resources | Phase 1 |

---

### 2.1 Persona Detail: BV Coordinator

**Who they are:** Senior leader(s) of the organization with oversight across all centers and sessions. There are typically 2 BV Coordinators for the entire organization.

**Primary goals:**
- Monitor overall program health (attendance rates, compliance) across all centers and sessions
- Post announcements to the entire organization or any center/session
- Manage academic year lifecycle (open/close a year)
- Oversee coordinator and teacher accounts
- Provision and manage all user accounts

**Tab navigation:** Feed, Dashboard, Events, Profile

**Key permissions:**
- Read all data across all centers and sessions
- Write announcements org-wide or scoped to any center/session
- Create/manage events org-wide
- Open and close academic years
- Approve or reject user registrations

---

### 2.2 Persona Detail: Coordinator

**Who they are:** Day-to-day operations manager for a single session. Typically 1–3 coordinators per center.

**Primary goals:**
- Monitor their session's compliance (attendance submitted, class updates posted)
- Communicate with teachers, parents, students via targeted announcements
- Manage events for their session
- Approve new user registrations for their session

**Tab navigation:** Feed, Dashboard, Events, Profile

**Key permissions:**
- Read all data for their session only
- Write announcements scoped to their session (cannot post org-wide)
- Create/manage events for their session
- Approve/reject pending user registrations for their session

---

### 2.3 Persona Detail: Teacher

**Who they are:** Leads one class for each session. A class can have 2–3 teachers.

**Primary goals:**
- View their class roster
- Take attendance during each Sunday session
- Post class updates (what was covered, homework)
- Report upcoming absences in advance

**Tab navigation:** Feed, My Class, Profile

**Key permissions:**
- Read roster and enrollments for their assigned class
- Write attendance for their assigned class
- Write class updates for their assigned class
- Write their own absence records
- Moderate comments on their own class updates (delete inappropriate comments)

---

### 2.4 Persona Detail: Parent

**Who they are:** Guardian of one or more enrolled students. May also be a volunteer, a substitute, a teacher, a coordinator.

**Primary goals:**
- See what happened in their child's class (class updates, homework)
- Track their child's attendance history
- Receive announcements relevant to parents

**Tab navigation:** Feed, My Children, Events, Profile

**Key permissions:**
- Read their own children's profiles, enrollment, attendance, class updates
- Read announcements targeted to parents (and org-wide)
- Comment on class updates for their children's classes

---

### 2.5 Persona Detail: Student

**Who they are:** An enrolled student in high-school (grades 9 - 12); see `01_SECURITY_AND_COMPLIANCE.md` Section 3 for age policy.

**Primary goals:**
- See what happened in their class (class updates, homework)
- Track their own attendance
- Receive announcements relevant to students

**Tab navigation:** Feed, My Class, Notifications, Profile

**Key permissions:**
- Read their own profile, enrollment, and attendance
- Read class updates for their enrolled class
- Read announcements targeted to students (and org-wide)
- Comment on class updates for their own class (public comments only; cannot post private notes except to teacher)

---

### 2.6 Persona Detail: Volunteer

**Who they are:** A community member who helps at events. Often a parent with an additional volunteer persona.

**Primary goals:**
- Browse upcoming events
- Sign up to volunteer
- View their volunteer history

**Tab navigation:** Feed, Opportunities, Profile

**Key permissions:**
- Read org-wide and center-specific events
- Sign up and cancel their own volunteer slots
- Read announcements targeted to volunteers (and org-wide)

---

### 2.7 Persona Detail: Substitute Teacher

**Who they are:** A parent (or other qualified adult) who can cover classes when the assigned teacher is absent. Identified by `is_substitute = true` on their profile. Can also hold another primary role.

**Primary goals:**
- Browse open substitute requests
- Raise their hand to volunteer for a request
- Accept or decline when assigned by coordinator

**Tab navigation:** Feed, Opportunities, Profile

**Key permissions:**
- Read open substitute assignments (status = `open`)
- Write their own volunteer records (`substitute_volunteers`)
- Read their own pending/confirmed assignments
- Accept or decline an assignment (update `status`)

---

### 2.8 Persona Detail: Board Member

**Who they are:** Governance-level stakeholder (board of directors member). Typically 5–15 people. They need organizational visibility without access to individual student or family records.

**Primary goals:**
- View high-level program health metrics
- Track year-over-year trends in enrollment and attendance
- Receive all announcements and class updates

**Tab navigation:** Dashboard (read-only metrics), Feed, Profile

**Key permissions:**
- Read aggregate metrics only — enrollment counts, attendance percentages, compliance rates by class/center
- Read all org-wide announcements and class updates
- No write permissions of any kind

**Data access constraint:** Board member RLS policies must prevent access to `family_members`, `profiles` (other than own), and any table with individual student or family PII. All dashboard data must be aggregated at the class or center level.

---

### 2.9 Persona Detail: Acharya

**Who they are:** Spiritual teacher or curriculum director. An Acharya guides teachers across the program, provides lesson plans, and posts curriculum-level guidance. Not a class teacher; does not take attendance.

**Primary goals:**
- Upload lesson plans per class per week
- Curate training resources and videos for teachers
- Post announcements to teachers and coordinators
- View class rosters across multiple classes
- Observe program-level curriculum progress

**Tab navigation:** Feed, Classes (read-only roster), Resources, Profile

**Key permissions:**
- Read class rosters (student names and enrollment) for their assigned center
- Upload lesson plans per class per academic week (stored in Supabase Storage)
- Post announcements targeted to `teacher` and `local_admin` audiences
- Read and manage training resources
- **Cannot:** take attendance, post class updates, manage substitute requests, access family member records or attendance at record level

---

## 3. Core Concepts & Terminology

| Term | Definition |
|---|---|
| **Organization** | The top-level entity. CMDFW in this deployment. |
| **Center** | A physical campus within the organization. e.g. Chitrakoot, Saket, Frisco. |
| **Session** | A recurring time slot at a center every Sunday. e.g. "Session F1 (9–1030am)". Each center will have multiple sessions. |
| **Class** | One grade level within one session. e.g. "Grade 5 · Session F1 · Frisco". A class persists across academic years; teacher assignments are year-specific. |
| **Academic Year** | A school year period, e.g. "2025-26" (August–May). Exactly one academic year is marked `is_current` at a time. All operational records are stamped with an academic year. |
| **Enrollment** | A student's assignment to a specific class for a specific academic year. One enrollment per student per year. |
| **Attendance** | A per-student, per-session-date record of present / absent. Submitted by the teacher. |
| **Class Update** | A teacher's post after a Sunday session describing what was covered and any homework assigned. One update per class per session date. |
| **Announcement** | A broadcast message from a coordinator or admin. Scoped to a session, center or org-wide. Targeted by audience role. |
| **Substitute Request** | A substitute_assignment record created by a coordinator when a teacher reports an absence. Tracks the full lifecycle from open to confirmed. |
| **Persona** | A role a user holds within the app. A single login can have multiple personas. The user selects an active persona at login; they can switch without logging out. |
| **Multi-persona** | A single user account holding more than one persona. e.g. a parent who is also a volunteer; a coordinator who is also a parent. |

---

## 4. Feature Specifications

---

### F-01 Authentication & Account Management

**Phase:** 1  
**Personas:** All  

#### Description
Users log in with a magic link — they enter their email address, receive a one-time login link by email, and tap it to authenticate. No password is ever set or managed. No self-registration is permitted in Phase 1 — all accounts are provisioned by an admin or coordinator. Phone OTP (Twilio) is an optional Phase 2 addition.

#### Requirements

| ID | Requirement |
|---|---|
| F01-01 | Login screen shows a single email input field and a "Send Magic Link" button — nothing else |
| F01-02 | Tapping "Send Magic Link" calls `supabase.auth.signInWithOtp({ email })` and navigates to a "Check your email" confirmation screen |
| F01-03 | "Check your email" screen shows the email address the link was sent to and a "Resend link" option (rate-limited to once per 60 seconds) |
| F01-04 | Magic link expires after 1 hour and is single-use — Supabase invalidates it on first click |
| F01-05 | When the user taps the magic link, the app detects the session token and authenticates without requiring any further action |
| F01-06 | If the email is not in `profiles` (unprovisioned address), Supabase still sends a link — but the session will have no profile row, and the app must detect this and show: "This email address is not registered. Please contact your coordinator." |
| F01-07 | Session tokens are stored in `expo-secure-store` on native; `localStorage` on web |
| F01-08 | Refresh tokens are rotated on use (Supabase Auth setting) |
| F01-09 | A user can sign out; sign-out invalidates the session server-side |
| F01-10 | If a session expires mid-use, the app redirects to the login screen with the message "Your session has expired — please sign in again" |
| F01-11 | No self-registration screen exists in Phase 1. The login screen shows only the email field and "Send Magic Link". |

#### Acceptance Criteria
- User enters email, receives link, taps link, lands on persona picker or home tab
- Unprovisioned email shows the "not registered" message — does not create an account
- Expired or already-used link shows a clear error with a prompt to request a new one
- Sign-out clears local session and returns to the login screen
- "Resend link" is disabled for 60 seconds after sending

---

### F-02 Multi-Persona Login & Switching

**Phase:** 1  
**Personas:** Any user with multiple roles  

#### Description
A user with multiple personas (e.g. parent + volunteer) sees a persona picker after successful authentication. They select which persona to enter. They can switch personas at any time from the Profile tab without signing out.

#### Requirements

| ID | Requirement |
|---|---|
| F02-01 | After login, if the user has more than one row in `user_roles`, show the PersonaPicker screen before the main app |
| F02-02 | PersonaPicker displays each persona as a tile: role label (from `user_roles.label`), center name if applicable, and a role icon |
| F02-03 | Tiles are ordered by `user_roles.display_order` |
| F02-04 | If the user has exactly one persona, skip the picker and go directly to the app |
| F02-05 | Selecting a persona sets the active persona context in the app and updates the JWT claim (see `02_DATA_MODEL.md` Section 9.1, Option A) |
| F02-06 | Tab navigation, visible data, and available actions reflect the active persona only |
| F02-07 | From the Profile tab, a "Switch Persona" button is visible to users with multiple personas |
| F02-08 | Tapping "Switch Persona" returns the user to the PersonaPicker without logging out |
| F02-09 | The active persona label is displayed on the Profile tab header |
| F02-10 | Switching persona does not lose unsaved form state on other tabs — it navigates to the new persona's home tab |

#### Acceptance Criteria
- User with 3 personas sees all 3 tiles in the picker
- Selecting a persona loads the correct tab set for that role
- Persona switching from Profile tab does not require re-entering password
- User with 1 persona never sees the picker

---

### F-03 Home Feed

**Phase:** 1  
**Personas:** All  

#### Description
The home tab displays a reverse-chronological feed of content relevant to the active persona. Content types in the feed vary by role.

#### Feed Content by Persona

| Persona | Feed Shows |
|---|---|
| Teacher | Class updates (own classes), announcements (teacher audience), org/center announcements |
| Parent | Class updates (children's classes), announcements (parent audience), org/center announcements |
| Student | Class updates (enrolled class), announcements (student audience), org/center announcements |
| Coordinator | Announcements (all), class updates (session), absence alerts |
| BV Coordinator | Announcements (all), class updates (all centers) |
| Volunteer | Events (upcoming), announcements (volunteer audience), org announcements |
| Substitute | Open sub requests, announcements (substitute audience), org announcements |
| Board Member | All announcements + class updates (all centers, all sessions) |
| Acharya | All announcements + class updates (all centers, all sessions) |

#### Requirements

| ID | Requirement |
|---|---|
| F03-01 | Feed items are sorted reverse-chronologically by `created_at` |
| F03-02 | Feed items are paginated — load 20 items per page, with "load more" at the bottom |
| F03-03 | New items appear in real-time via Supabase Realtime subscription (Postgres Changes on `announcements` and `class_updates`) without requiring a manual refresh |
| F03-04 | Realtime subscription is cleaned up on component unmount |
| F03-05 | Announcements show: title, body (collapsible if > 3 lines), posted-by name, posted time, audience badges |
| F03-06 | Class update cards show: grade badge, teacher name, session date, content preview (2 lines), homework indicator if present, comment count |
| F03-07 | Tapping a class update card opens the full update with complete content, homework, and comment thread |
| F03-08 | Feed shows a skeleton loading state while data is fetching |
| F03-09 | Empty state: "Nothing here yet — check back after Sunday's session" when there is no content |
| F03-10 | Audience filtering is enforced by RLS at the database level, not the client |

#### Acceptance Criteria
- Teacher sees only class updates from their own classes and announcements targeting teachers
- Parent sees only class updates from their children's classes
- Student cannot see announcements targeting teachers only
- Feed updates in real-time when a new announcement is posted (within 3 seconds)
- Pagination loads additional items without losing scroll position

---

### F-04 Attendance

**Phase:** 1  
**Personas:** Teacher (write), Parent (read), Student (read), Coordinator (read), BV Coordinator (read)  

#### Description
Teachers take attendance for each Sunday session. Attendance is per-student, per-date. Parents and students can view attendance history. Coordinators and admins can view compliance rates.

#### Requirements

| ID | Requirement |
|---|---|
| F04-01 | Teacher sees their class roster on the My Class tab, sorted by last name |
| F04-02 | For each student, the teacher can tap to toggle status: Present / Absent |
| F04-03 | Default status on a new session date is none (not pre-filled) |
| F04-04 | Teacher taps "Submit Attendance" to save all records for the session |
| F04-05 | Submission is an upsert — if the teacher re-opens attendance for an already-submitted date, existing records are shown and can be corrected |
| F04-06 | Submitted attendance records are stamped with `academic_year = current_academic_year()` and `recorded_by = auth.uid()` |
| F04-07 | After submission, the roster shows a green "✓ Submitted" banner for that date |
| F04-08 | The session date defaults to the most recent Sunday. Teacher can change the date to any past Sunday within the current academic year (to correct missed submissions) |
| F04-09 | Teacher cannot submit attendance for a future date |
| F04-10 | Class with multiple teachers: any teacher assigned to the class can submit or update attendance |
| F04-11 | Parent view: attendance percentage and session-by-session history for each child |
| F04-12 | Student view: own attendance percentage and session-by-session history |
| F04-13 | Attendance percentage is calculated as `present / total_sessions` where `total_sessions` = number of Sundays in the current academic year up to today |

#### Acceptance Criteria
- Teacher can mark all students present/absent and submit in under 2 minutes for a class of 20
- Submitted records persist across app restarts
- Teacher cannot see attendance for another teacher's class
- Parent cannot see attendance for a child they are not linked to
- Attendance percentage updates immediately after submission

---

### F-05 Class Updates

**Phase:** 1  
**Personas:** Teacher (write), Parent (read), Student (read), Coordinator (read), BV Coordinator (read), Acharya (read)  

#### Description
After each Sunday session, teachers post a class update describing what was covered and any homework assigned. One update per class per session date.

#### Requirements

| ID | Requirement |
|---|---|
| F05-01 | Teacher taps "Post Class Update" on the My Class tab |
| F05-02 | Form fields: session date (defaults to most recent Sunday), content (required, multi-line), homework (optional, multi-line) |
| F05-03 | Submission creates a `class_updates` row stamped with `academic_year`, `teacher_id`, `class_id`, `session_date` |
| F05-04 | Only one update per class per session date. If an update already exists for the selected date, the form opens in edit mode pre-filled with existing content |
| F05-05 | Teacher can edit or delete their own class updates |
| F05-06 | Deleted class update also deletes all associated comments |
| F05-07 | Class update appears in the feed of enrolled families within 3 seconds (Realtime) |
| F05-08 | Update card shows grade badge, teacher name, date, content, homework indicator |
| F05-09 | If a class has multiple teachers, any assigned teacher may post the class update for any session date. The `teacher_id` stored is that of the posting teacher. |
| F05-10 | `photo_url` column is reserved for future use. Photo upload UI is not built in Phase 1. |

#### Acceptance Criteria
- Teacher can post an update and see it appear in their own feed immediately
- Parent sees the update in their feed within 3 seconds of posting
- Teacher cannot post a class update for a class they are not assigned to
- Editing an existing update replaces content without creating a duplicate

---

### F-06 Comments on Class Updates

**Phase:** 1  
**Personas:** Teacher (write + moderate), Parent (write), Student (write — public only), Coordinator (read), BV Coordinator (read)  

#### Description
Enrolled families and teachers can comment on class updates. Comments can be public (visible to all enrolled families) or private (visible only to the poster and the teacher). Teachers can delete any comment on their class updates.

#### Requirements

| ID | Requirement |
|---|---|
| F06-01 | Comment thread is accessible by tapping a class update card |
| F06-02 | Comment form: text input (required), visibility toggle (Public / Private to Teacher) |
| F06-03 | Students can post public comments only — the Private toggle is not shown to students |
| F06-04 | Private comments are visible to: the comment author, the class teacher(s), coordinators, and admins. They are hidden from other parents and students. |
| F06-05 | Public comments are visible to all enrolled families (enrolled students + their parents) and the teacher |
| F06-06 | Comment shows: author name, timestamp, comment text, private badge if applicable |
| F06-07 | Comment author can delete their own comment |
| F06-08 | Teacher can delete any comment on their class update (moderation) |
| F06-09 | Deleted comment shows "This comment was removed" placeholder (soft delete) — does not disappear entirely, preserving thread continuity |
| F06-10 | Comment count on the class update card increments in real-time |
| F06-11 | Comments are not paginated in Phase 1 — load all comments for a given update (reasonable limit: a class update should not have more than 50 comments) |

#### Acceptance Criteria
- Parent can post a public comment and see it immediately
- Parent can post a private comment and see only their own private comments (not other parents' private comments)
- Student cannot post a private comment
- Teacher can delete any comment on their own class update
- A parent from a different class cannot see comments on an unrelated class update

---

### F-07 Teacher Absence Reporting

**Phase:** 1  
**Personas:** Teacher (write), Coordinator (read), BV Coordinator (read)  

#### Description
A teacher reports an upcoming absence in advance. The absence record triggers the coordinator's substitute request workflow.

#### Requirements

| ID | Requirement |
|---|---|
| F07-01 | Teacher accesses absence reporting from the My Class tab — "Report Absence" button |
| F07-02 | Form fields: absence date (date picker, future dates only), reason (dropdown: Family travel / Health / Personal / Other), notes (optional) |
| F07-03 | Submission creates a `teacher_absences` row |
| F07-04 | A teacher cannot report an absence for a date in the past |
| F07-05 | A teacher cannot report two absences for the same date (unique constraint) |
| F07-06 | Teacher can view their own upcoming absences in a list below the report form |
| F07-07 | Teacher can cancel a future absence (delete the record) — only if no substitute assignment has been created yet |
| F07-08 | If a substitute assignment already exists for the absence date, the teacher cannot delete the absence — they must contact the coordinator |
| F07-09 | Coordinator sees new absence alerts in real-time on their dashboard |

#### Acceptance Criteria
- Teacher can report absence, see it in their list, and cancel it (if no sub assigned)
- Coordinator sees the absence appear on their dashboard without refreshing
- Teacher cannot report absence for a past date
- Teacher cannot create two absence records for the same date

---

### F-08 Substitute Request Workflow

**Phase:** 2  
**Personas:** Coordinator (create + manage), Substitute (volunteer + accept/decline), Teacher (view own), BV Coordinator (view all)  

#### Description
The full substitute coverage workflow: teacher reports absence → coordinator creates sub request → substitutes volunteer → coordinator assigns one → substitute accepts or declines → if declined, coordinator reassigns.

#### Status Lifecycle
```
(teacher reports absence)
  ↓
Coordinator creates assignment → status: open
  ↓
Substitute(s) volunteer (substitute_volunteers rows created)
  ↓
Coordinator assigns a sub → status: pending, substitute_id set
  ↓
  ├── Sub accepts → status: confirmed ✓
  └── Sub declines → status: open (reassignable), substitute_id cleared
```

#### Requirements

| ID | Requirement |
|---|---|
| F08-01 | Coordinator sees absence alerts on their dashboard. Each alert has a "Post Sub Request" button. |
| F08-02 | Tapping "Post Sub Request" creates a `substitute_assignments` row with `status = 'open'` |
| F08-03 | Open sub requests appear in the Opportunities tab for all substitutes (`is_substitute = true`) |
| F08-04 | Sub request card shows: class name, grade, session date, center, number of volunteers so far |
| F08-05 | Substitute taps "I'm Available" → creates a `substitute_volunteers` row. The count on the card increments. |
| F08-06 | Substitute can withdraw their volunteer (delete the row) as long as the assignment is still `open` |
| F08-07 | Coordinator sees the volunteer count on the absence card. Tapping it shows a list of volunteers by name. |
| F08-08 | Coordinator taps "Assign Sub" → selects one volunteer from the list → status becomes `pending`, `substitute_id` and `assigned_by` are set |
| F08-09 | Assigned substitute sees "Pending Assignment" on their Opportunities tab with Accept / Decline buttons |
| F08-10 | Substitute taps Accept → status becomes `confirmed`. Card updates to "✓ [Name] confirmed" on coordinator's dashboard |
| F08-11 | Substitute taps Decline → status returns to `open`, `substitute_id` cleared. Coordinator sees the card revert to "Reassign" state |
| F08-12 | Coordinator can reassign from the `open` state (after a decline) — the prior volunteer's record remains for audit; a new volunteer can be assigned |
| F08-13 | Once confirmed, only a coordinator can unconfirm (revert to open) in case of last-minute changes |
| F08-14 | Absent teacher sees the status of their sub request (open / pending / confirmed) as read-only on their My Class tab |
| F08-15 | Coordinator can create a sub request for a class with no teacher absence reported (edge case: teacher unreachable) |

#### Acceptance Criteria
- Full lifecycle from open → confirmed works without page refresh at any step
- Coordinator cannot assign a sub to a class outside their center
- Substitute cannot see assignments for another organization's classes
- Declining reverts to open and allows a different volunteer to be assigned
- Coordinator's dashboard card updates in real-time at each status change

---

### F-09 Announcements

**Phase:** 1  
**Personas:** BV Coordinator, Board Member, Acharya (write — org-wide or any scope), Coordinator (write — session-scoped only), All personas (read — audience-filtered)  

#### Description
Admins and coordinators can post announcements to targeted audiences. Each announcement specifies which roles can see it. The feed filters announcements by the active persona's role.

#### Requirements

| ID | Requirement |
|---|---|
| F09-01 | BV Coordinator, Board Member, Acharya, and Coordinator can access an announcement composer from their dashboard or feed |
| F09-02 | Composer fields: title (required), body (required, multi-line), audience (multi-select from valid roles), center scope (BV Coordinator/Board Member/Acharya: any center or "All Centers"; Coordinator: own session only) |
| F09-03 | Coordinator's scope is locked to their own session — they cannot select "All Centers" or a different session |
| F09-04 | Audience defaults to all roles. Coordinator can restrict to: parents, students, teachers |
| F09-05 | Submitted announcement is stamped with `org_id`, `center_id`, `posted_by`, `academic_year`, and the audience array |
| F09-06 | Announcement appears in the feed of all users whose active persona role is in the audience array and who belong to the matching center |
| F09-07 | Coordinators, BV Coordinators, Board Members, and Acharyas see all announcements regardless of audience targeting |
| F09-08 | Announcement card is collapsible — body truncates at 3 lines with a "Read more" tap |
| F09-09 | Announcement card shows: title, posted-by name, posted time, audience badges (e.g. "Parents · Teachers") |
| F09-10 | Admins and coordinators can edit or delete their own announcements |
| F09-11 | RLS enforces that a coordinator cannot post an announcement with `center_id = NULL` (org-wide). Enforced at database layer. |
| F09-12 | New announcements appear in real-time in the feed (Supabase Realtime) |

#### Acceptance Criteria
- Coordinator-posted announcement to "Teachers" is visible to teachers at that center only
- Parent at a different center does not see a center-scoped announcement
- Student does not see an announcement targeted to teachers only
- Coordinator's composer does not allow selecting "All Centers"
- RLS prevents a coordinator from bypassing center scope even via direct API call

---

### F-10 Events & Signups

**Phase:** 1 (event creation and viewing); Phase 2 (volunteer signups)  
**Personas:** Coordinator, BV Coordinator, Board Member, Acharya (write — create events); All Phase 1 personas (read); Volunteer + Parent (signup — Phase 2)  

#### Description
Coordinators, BV Coordinators, Board Members, and Acharyas can create events. All users can browse events. Volunteer signup functionality is a Phase 2 addition.

#### Requirements

| ID | Requirement |
|---|---|
| F10-01 | Coordinator, BV Coordinator, Board Member, and Acharya can access an event creation form from the Events tab |
| F10-02 | Event form fields: title (required), description (optional), date (required), start time, end time, location, center scope (BV Coordinator/Board Member/Acharya: all centers or specific; Coordinator: own session only) |
| F10-03 | Events appear in the Events tab for all authenticated users |
| F10-04 | Event card shows: title, date, time, location |
| F10-05 | Upcoming events are sorted by date ascending. Past events are shown in a "Past Events" section |
| F10-06 | Coordinator can edit or delete their own events |
| F10-07 | Coordinator cannot create an event scoped to a session outside their own |
| F10-08 | **Phase 2:** User taps "Sign Up" → creates a `volunteer_signups` row with `status = 'signed_up'` |
| F10-09 | **Phase 2:** Signed-up user sees "Signed Up ✓" with a "Cancel" option |
| F10-10 | **Phase 2:** Cancelling updates the row to `status = 'cancelled'` (not a delete — preserves history) |
| F10-11 | **Phase 2:** Coordinator can expand an event card to see the names of signed-up volunteers |

#### Acceptance Criteria
- Coordinator creates an event and it appears in all users' Events tab immediately
- Coordinator cannot create an event scoped to a session outside their own
- Board Member and Acharya can create org-wide events
- (Phase 2) Volunteer signup and cancellation work without page refresh

---

### F-11 Coordinator Dashboard

**Phase:** 1  
**Personas:** Coordinator  

#### Description
The coordinator's primary operational view. Shows center health at a glance and provides access to all operational workflows.

#### Requirements

| ID | Requirement |
|---|---|
| F11-01 | Dashboard header: center name, current date, current academic year |
| F11-02 | Compliance summary: for each class in the center, show whether attendance has been submitted and whether a class update has been posted for the most recent Sunday |
| F11-03 | Compliance date is calculated as the most recent Sunday on or before today — never derived from `MAX(session_date)` in the database |
| F11-04 | Compliance indicators: ✓ (both submitted), ⚠ (one missing), ✗ (neither submitted) |
| F11-05 | Absence alerts: cards for each teacher absence with date, reason, and sub request status |
| F11-06 | Each absence card has: teacher name, absence date, sub request status (none / open / pending / confirmed), and action buttons matching the current status |
| F11-07 | "Post Sub Request" button appears when no assignment exists. "View Volunteers" when open with volunteers. "Assign Sub" when ready to assign. Status badge when pending/confirmed. |
| F11-08 | Coordinator can filter the absence list: upcoming only / all academic year |
| F11-09 | Announcement composer accessible from the dashboard header |
| F11-10 | Pending user registration requests (Phase 2) shown as a badge on the dashboard |
| F11-11 | All coordinator dashboard data is scoped to their center only — RLS enforced |

#### Acceptance Criteria
- Compliance date correctly shows the most recent Sunday even if no attendance exists for that date
- Compliance view does not change based on presence or absence of seed data
- Coordinator at Richardson center cannot see data from Plano center
- Absence cards update in real-time as sub request status changes

---

### F-12 BV Coordinator Dashboard

**Phase:** 1  
**Personas:** BV Coordinator  

#### Description
Org-wide operational visibility across all centers. Aggregated metrics without individual student-level drill-down (that is the coordinator's domain).

#### Requirements

| ID | Requirement |
|---|---|
| F12-01 | Dashboard shows all centers with per-center summary cards |
| F12-02 | Per-center card: center name, total enrollment, this-week attendance rate (% of classes with attendance submitted), number of open sub requests, compliance rate |
| F12-03 | Tapping a center card drills into center-level detail (same as coordinator view, read-only) |
| F12-04 | Org-wide aggregate metrics: total enrollment across all centers, total teachers, total open sub requests |
| F12-05 | Absence overview: all teacher absences across all centers with sub request status |
| F12-06 | Announcement composer accessible from dashboard (scope: any center or org-wide) |
| F12-07 | Academic year selector: admin can view data for any past academic year (read-only) |
| F12-08 | Academic year management: button to open a new academic year (creates `academic_years` row with `is_current = true`) |

#### Acceptance Criteria
- Central admin sees all three centers in the dashboard
- Attendance rates update after teachers submit attendance
- Academic year selector shows data for the selected year correctly

---

### F-13 Board Member Dashboard

**Phase:** 1  
**Personas:** Board Member  

#### Description
Board Members have read-only visibility across all app data — all centers, all sessions, all features. In addition to read access, they can post events and announcements. They cannot take attendance, post class updates, manage sub requests, or modify any operational record.

#### Requirements

| ID | Requirement |
|---|---|
| F13-01 | Dashboard shows org-wide enrollment totals and per-center breakdown |
| F13-02 | Attendance rate chart: weekly attendance rate for the current academic year (line chart or bar chart, by week) |
| F13-03 | Year-over-year comparison: current year vs. prior year enrollment and attendance rate |
| F13-04 | Compliance rate: % of classes that submitted attendance and class updates each week, trended over the academic year |
| F13-05 | Board member can read all data across all centers and sessions: class updates, attendance records, teacher absences, substitute assignments, family member records, announcements |
| F13-06 | Board member sees all announcements in their Feed tab, regardless of audience targeting |
| F13-07 | Board member can post announcements (org-wide or center-scoped) and create events |
| F13-08 | Board member cannot take attendance, edit class updates, manage substitute requests, or provision user accounts |

#### Acceptance Criteria
- Board member can view class updates, attendance, and absence records across all centers
- Board member can post an announcement and it appears in other personas' feeds correctly
- Board member cannot submit attendance or post a class update (no such UI; RLS enforced)
- Board member can create an event visible to all centers

---

### F-14 Acharya Experience

**Phase:** 1  
**Personas:** Acharya  

#### Description
Acharyas have read-only visibility across all app data — all centers, all sessions, all features. In addition to read access, they can post events and announcements. They cannot take attendance, post class updates, manage sub requests, or modify any operational record.

#### Requirements

| ID | Requirement |
|---|---|
| F14-01 | Acharya can read all data across all centers and sessions: class rosters, attendance records, class updates, teacher absences, announcements, events, family member records |
| F14-02 | Acharya sees all announcements and class updates in their Feed tab across all centers |
| F14-03 | Acharya can post announcements (org-wide or center-scoped, any audience) |
| F14-04 | Acharya can create events (org-wide or center-scoped) |
| F14-05 | Acharya cannot take attendance, edit class updates, manage substitute requests, or provision user accounts |
| F14-06 | Acharya has a Dashboard tab showing the same org-wide view as BV Coordinator (read-only) |

#### Acceptance Criteria
- Acharya can view class updates, attendance, and absence records across all centers
- Acharya can post an announcement and it appears in other personas' feeds correctly
- Acharya cannot submit attendance or post a class update (no such UI; RLS enforced)
- Acharya can create an event visible to all centers

---

### F-15 User Onboarding & Self-Registration

**Phase:** 1 (admin provisioning) / Phase 2 (self-registration)  
**Personas:** All new users, Coordinators (approval)  

#### Phase 1 — Admin Provisioning Only

| ID | Requirement |
|---|---|
| F15-01 | No self-registration screen exists. Login screen shows only email/password. |
| F15-02 | Admin or coordinator creates user accounts via Supabase dashboard or a bulk CSV import tool |
| F15-03 | After account creation, user receives a password-reset email to set their own password |
| F15-04 | Coordinator sets the user's role, center, and `user_roles` entries before the user's first login |

#### Phase 2 — Self-Registration with Coordinator Approval

| ID | Requirement |
|---|---|
| F15-05 | A "Request Access" link is shown on the login screen |
| F15-06 | Registration form: full name, email, phone (optional), center (dropdown), requested role (parent / teacher / volunteer) |
| F15-07 | Submitting the form creates an auth account and a `profiles` row with `status = 'pending'` |
| F15-08 | Student accounts cannot be self-registered — coordinators provision student accounts on behalf of families |
| F15-09 | Coordinator sees a "Pending Registrations" section on their dashboard with Approve / Reject buttons |
| F15-10 | Approving sets the user's role and sends a welcome notification (in-app + email) |
| F15-11 | Rejecting deletes the account and sends a rejection notification |
| F15-12 | Pending registrations expire after 14 days if not actioned |

#### Acceptance Criteria (Phase 2)
- User who self-registers cannot access any data until approved
- Coordinator can approve, reject, and see pending registrations for their center only
- Student accounts cannot be created via self-registration

---

### F-16 Academic Year Management

**Phase:** 1  
**Personas:** BV Coordinator (write), All (read — current year context)  

#### Description
Academic years are managed by the central admin. Exactly one year is active at a time. All operational records are stamped with the current year at insert time.

#### Requirements

| ID | Requirement |
|---|---|
| F16-01 | `academic_years` table has exactly one row with `is_current = true` at all times (enforced by trigger) |
| F16-02 | All inserts to `attendance`, `class_updates`, `announcements`, `enrollments`, `class_teachers` automatically stamp `academic_year = current_academic_year()` |
| F16-03 | Central admin can create a new academic year from the dashboard (label, start date, end date) |
| F16-04 | Creating a new year with `is_current = true` automatically sets all other years to `is_current = false` (via trigger) |
| F16-05 | Central admin and coordinators can view data from any prior academic year using a year selector dropdown |
| F16-06 | Year selector defaults to the current academic year |
| F16-07 | Data in non-current years is read-only — no attendance, class updates, or announcements can be created for a closed year |

#### Acceptance Criteria
- Opening a new academic year does not affect prior year's data
- Selecting a prior year on the coordinator dashboard shows that year's compliance/attendance data
- Attempt to insert an attendance record for a closed year is rejected

---

### F-17 Profile & Settings

**Phase:** 1  
**Personas:** All  

#### Description
Each user can view their own profile. Limited self-editing (display name, password). Multi-persona users see a persona switcher here.

#### Requirements

| ID | Requirement |
|---|---|
| F17-01 | Profile tab shows: full name, email, primary role, center (if applicable), current academic year |
| F17-02 | User can edit their display name |
| F17-03 | User can change their password via a "Change Password" flow (sends a Supabase password reset email) |
| F17-04 | Multi-persona users see a "Switch Persona" button showing the active persona label |
| F17-05 | Profile tab shows "Sign Out" button at the bottom |
| F17-06 | Users cannot edit their own role, center, or org — only admins can change these |

#### Acceptance Criteria
- Display name change is saved and reflected in the feed on next load
- Sign-out clears session and returns to login screen
- User cannot change their own role or center

---

### F-18 Push Notifications

**Phase:** 2  
**Personas:** All (configurable per persona)  

#### Description
Web push notifications delivered via the Web Push API (VAPID) for key events. Works on iOS Safari and Android Chrome for installed PWAs.

#### Trigger Events by Persona

| Persona | Trigger |
|---|---|
| Substitute | New sub request posted for their center |
| Substitute | Coordinator assigns them to a request |
| Teacher | Sub request for their absence is confirmed |
| Parent | New class update posted for their child's class |
| Parent | New announcement targeting parents |
| Student | New class update for their class |
| Coordinator | Teacher reports a new absence |
| Coordinator | Substitute accepts or declines an assignment |

#### Requirements

| ID | Requirement |
|---|---|
| F18-01 | App requests push notification permission on first login (after persona selection) |
| F18-02 | Push token is stored in a `push_tokens` table with `user_id`, `token`, `platform`, `created_at` |
| F18-03 | Push notifications are triggered via a Supabase Edge Function that fires on relevant database inserts/updates |
| F18-04 | User can disable push notifications from the Profile tab |
| F18-05 | Push notifications respect RLS — a notification is only sent to users who are authorized to see the triggering event |
| F18-06 | Tapping a push notification deep-links into the relevant screen in the app |

---

### F-19 Notifications Tab

**Phase:** 1 (structure) / Phase 2 (wired to real data)  

**Personas:** Student (primary), all others (secondary)

#### Requirements

| ID | Requirement |
|---|---|
| F19-01 | Notifications tab is visible to all personas |
| F19-02 | Phase 1: tab exists and shows an empty state: "Notifications will appear here" |
| F19-03 | Phase 2: tab shows in-app notifications for: new class updates, new homework, new announcements, sub assignment status changes |
| F19-04 | Notification item shows: icon (type), summary text, timestamp, read/unread state |
| F19-05 | Tapping a notification marks it read and navigates to the relevant content |
| F19-06 | Unread count badge on the tab icon |

---

### F-20 Lesson Plans & Training Resources *(Phase 3)*

**Phase:** 3  
**Personas:** Acharya (write), Teacher (read), Coordinator (read)  

*(See F-14 for full specification — these are the same feature set described from the data and storage perspective.)*

| ID | Requirement |
|---|---|
| F20-01 | `lesson_plans` table: `class_id`, `academic_year`, `week_date`, `file_url`, `uploaded_by`, `created_at` |
| F20-02 | `training_resources` table: `title`, `url`, `description`, `posted_by`, `audience` (text array), `created_at` |
| F20-03 | Supabase Storage bucket: `lesson-plans` (private; access via signed URL, 1-hour expiry) |
| F20-04 | Teacher can download but not upload lesson plans |
| F20-05 | Training resource links open in the device browser (external URL) |

---

## 5. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-01 | **Performance** | All data-fetching operations must complete in under 2 seconds on a standard mobile connection (4G) for datasets up to 1,000 users |
| NFR-02 | **Performance** | Feed pagination: first page (20 items) must load in under 1.5 seconds |
| NFR-03 | **Performance** | Attendance submission (up to 30 students) must complete in under 3 seconds |
| NFR-04 | **Availability** | Supabase Pro SLA is 99.9% uptime. The app has no additional server components that could independently fail. |
| NFR-05 | **Recoverability** | Production database must be on Supabase Pro with daily automated backups and 7-day point-in-time recovery |
| NFR-06 | **Security** | All requirements in `01_SECURITY_AND_COMPLIANCE.md` must be met |
| NFR-07 | **Compatibility** | App must be fully functional on: iOS Safari (PWA installed), Android Chrome (PWA installed), desktop Chrome, desktop Safari |
| NFR-08 | **Accessibility** | All interactive elements must have accessible labels (ARIA). Minimum tap target size: 44×44pt. |
| NFR-09 | **Error Visibility** | Every failed network operation must surface a user-visible error message. Silent failures are not acceptable. |
| NFR-10 | **Error Monitoring** | All unhandled exceptions and failed API calls must be reported to Sentry with user ID and active persona context attached. No PII in error payloads. |
| NFR-11 | **Offline** | The app must display a clear "You're offline" banner when network is unavailable. Last-loaded data should remain visible (not blank screen). |
| NFR-12 | **Loading States** | Every screen that fetches data must show a skeleton loading state while the fetch is in progress — not a blank screen. |

---

## 6. Out of Scope

The following are explicitly not part of this product, to prevent scope creep:

| Item | Reason |
|---|---|
| CMDFW public website | Descoped — separate project if pursued |
| In-app direct messaging (parent ↔ coordinator) | Later roadmap; not in Phases 1–3 |
| Student grade tracking beyond attendance | Not a requirement for this program |
| Financial transactions or payment processing | Not applicable |
| Photo uploads of students | Privacy concern; excluded from data inventory |
| Multi-organization support | Single-org deployment; multi-org is a later platform decision |
| Native iOS/Android app store builds | PWA only for Phases 1–3 |
| SMS/WhatsApp integration | Out-of-band communication remains external |

---

## 7. Feature Phasing

### Phase 1 — Launch (Required Before Any Real Users)

| Feature | ID |
|---|---|
| Authentication & account management | F-01 |
| Multi-persona login & switching | F-02 |
| Home feed (with pagination + realtime) | F-03 |
| Attendance (take, submit, view) | F-04 |
| Class updates (post, edit, view) | F-05 |
| Comments on class updates | F-06 |
| Teacher absence reporting | F-07 |
| Announcements (post + audience targeting) | F-09 |
| Events (create + view; no volunteer signup) | F-10 (partial) |
| Coordinator dashboard (with correct compliance date) | F-11 |
| BV Coordinator dashboard | F-12 |
| Board Member dashboard + read-all + post events/announcements | F-13 |
| Acharya experience — read-all + post events/announcements | F-14 |
| User provisioning (admin-only) | F-15 (partial) |
| Academic year management | F-16 |
| Profile & settings | F-17 |
| Notifications tab (empty state only) | F-19 (partial) |

### Phase 2 — Post-Launch

| Feature | ID |
|---|---|
| Substitute request workflow | F-08 |
| Volunteer signups for events | F-10 (full) |
| Self-registration with coordinator approval | F-15 (full) |
| Push notifications | F-18 |
| Notifications tab (wired to real data) | F-19 (full) |
| Phone OTP login | F-01 (extension) |

### Phase 3 — Growth (Post-Pilot)

| Feature | ID |
|---|---|
| Lesson plans & training resources | F-20 |
| Volunteer history | F-10 (extension) |

---

## 8. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| OQ-01 | What is the minimum age for a student to have their own login vs. being a parent-only record? (See `01_SECURITY_AND_COMPLIANCE.md` Section 12, Item 3) | Affects student account provisioning policy | CMDFW Leadership |
| OQ-02 | Should coordinators be able to edit another teacher's class update in exceptional circumstances? (Currently: teacher-only write) | Affects F-05 policy | CMDFW Coordinators |
| OQ-03 | For multi-teacher classes: when a class update is posted, should all assigned teachers be notified? | Affects F-18 push notification triggers | Decision needed in Architecture doc |
| OQ-04 | Should the Board Member persona be able to see year-over-year trends from day one, or only after the second academic year of data is available? | Affects F-13 empty-state design | CMDFW Leadership |
| OQ-05 | Can a student comment on a class update for a class they are enrolled in, or only their parents can comment? (Currently: both can comment, student public only) | Affects F-06 | CMDFW Coordinators |

---

*This document supersedes all feature descriptions in the legacy `PRODUCT_OVERVIEW.md`. That file should be considered deprecated.*

*Next document: [04_ARCHITECTURE.md](04_ARCHITECTURE.md) — Stack, environment topology, data flow, deployment pipeline, and the multi-persona RLS resolution decision.*

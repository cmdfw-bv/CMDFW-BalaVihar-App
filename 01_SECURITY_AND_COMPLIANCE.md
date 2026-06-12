# Security & Compliance Plan
### CMDFW Bala Vihar App — Document 1 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Approved — governs all design and implementation decisions  

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Data Inventory](#2-data-inventory)
3. [Legal & Regulatory Requirements](#3-legal--regulatory-requirements)
4. [Authentication & Session Management](#4-authentication--session-management)
5. [Authorization Model](#5-authorization-model)
6. [Row Level Security Policy Specifications](#6-row-level-security-policy-specifications)
7. [Data Retention & Deletion](#7-data-retention--deletion)
8. [Secrets & Environment Management](#8-secrets--environment-management)
9. [Transport & Storage Security](#9-transport--storage-security)
10. [Incident Response](#10-incident-response)
11. [Security Testing Requirements](#11-security-testing-requirements)
12. [Open Items & Decisions Required](#12-open-items--decisions-required)

---

## 1. Purpose & Scope

This document defines the security and compliance requirements for the CMDFW Bala Vihar App. It is a **constraint document** — every architectural decision, data model choice, and feature implementation must be evaluated against the rules defined here before being built.

**In scope:**
- The Expo PWA (React Native) mobile application
- The Supabase PostgreSQL backend (auth, database, storage, realtime)
- The Netlify hosting layer
- All data collected from or about users of the application

**Out of scope:**
- The CMDFW public website (descoped)
- Any third-party systems not directly integrated (e.g., WhatsApp, email providers used by Supabase)

**Audience:** Developers building the application, coordinators administering data, and any external security reviewers.

---

## 2. Data Inventory

This section catalogs every category of personal data collected by the application, who it belongs to, and how sensitive it is.

### 2.1 User Categories

| User Type | Age Range | Special Considerations | Phase |
|-----------|-----------|------------------------|-------|
| BV Coordinator | Adult (18+) | None | 1 |
| Coordinator | Adult (18+) | None | 1 |
| Teacher | Adult (18+) | None | 1 |
| Parent / Guardian | Adult (18+) | Legal guardian of minors | 1 |
| High School Student | 14–18 | Grades 9–12 only; no under-13 accounts | 1 |
| Board Member | Adult (18+) | None | 1 |
| Acharya | Adult (18+) | None | 1 |
| Substitute Teacher | Adult (18+) | None | 2 |
| Volunteer | Adult (18+) | None | 2 |

### 2.2 Data Elements by Sensitivity

#### High Sensitivity — PII for Minors

| Data Element | Table | Who Can Access |
|---|---|---|
| Student full name | `profiles.full_name` | Enrolled teacher, own parent, coordinators, admins |
| Student attendance history | `attendance` | Student (self), own parent, enrolled teacher, coordinators, admins |
| Student class enrollment | `enrollments` | Student (self), own parent, enrolled teacher, coordinators, admins |
| Parent–child relationship | `family_members` | Own parent, student (self), coordinators, admins |
| Student class activity (updates) | `class_updates` | Enrolled student, own parent, posting teacher, coordinators, admins |

#### Medium Sensitivity — PII for Adults

| Data Element | Table | Who Can Access |
|---|---|---|
| Teacher full name | `profiles.full_name` | Own teacher, enrolled families, coordinators, admins |
| Teacher phone number | `profiles.phone` | Teacher (self), coordinators, admins |
| Teacher absence records | `teacher_absences` | Teacher (self), coordinators, admins |
| Volunteer name | `profiles.full_name` | Coordinators, admins |
| Parent phone number | `profiles.phone` | Parent (self), coordinators, admins |

#### Lower Sensitivity — Operational Data

| Data Element | Table | Who Can Access |
|---|---|---|
| Class schedule, room assignments | `classes`, `sessions` | All org members |
| Announcements | `announcements` | Audience-targeted org members |
| Events | `events` | All org members |
| Volunteer signups | `volunteer_signups` | Signing-up user, coordinators, admins |
| Substitute assignment status | `substitute_assignments` | Substitutes, coordinators, admins |

### 2.3 Data NOT Collected

The following data is explicitly not collected and must not be added without revisiting this compliance plan:

- Student grades or academic performance scores
- Medical or health information
- Photos of minors (class update `photo_url` field, if ever activated, may only store classroom/activity photos — never identifiable photos of students)
- Financial or payment information
- Government-issued IDs

---

## 3. Legal & Regulatory Requirements

### 3.1 COPPA (Children's Online Privacy Protection Act)

**Applicability:** COPPA applies because the application may collect personal information from children under 13 (students). Enforcement actions have targeted religious and educational organizations explicitly.

**Requirements and how the app meets them:**

| COPPA Requirement | How We Comply |
|---|---|
| **Verifiable parental consent** before collecting data from under-13 users | Students are enrolled by a coordinator or admin — not self-registered. The enrollment process is an offline/administrative step. No child can create their own account. |
| **Notice to parents** about data collected | The app's onboarding must include a clear, plain-language privacy notice presented to parents before they log in for the first time. See Section 12 for the notice text requirement. |
| **No behavioral advertising** targeting children | The app contains no advertising. This requirement is met by design. |
| **Data minimization** — collect only what is necessary | The data inventory in Section 2 defines the minimum set. No additional fields may be added without compliance review. |
| **Parental right to review and delete their child's data** | A data deletion capability must be built before any real users are onboarded. See Section 7. |
| **No sharing of data with third parties** | Data is not shared with any third party except Supabase (processor) and Sentry (error monitoring — no PII in error logs). See Section 3.3. |

**Action required before launch:** A privacy notice must be drafted and reviewed by legal counsel (or by an officer of the organization with explicit sign-off). See Section 12, Item 1.

### 3.2 FERPA (Family Educational Rights and Privacy Act)

**Applicability:** FERPA applies to educational records maintained by institutions receiving federal funding. CMDFW is a private religious organization and does not receive federal funding, so **FERPA does not strictly apply**. However, FERPA's principles are best practice for any student record system and should be followed voluntarily.

**Voluntary FERPA-aligned practices we adopt:**

- Parents have the right to inspect their child's attendance and enrollment records (already implemented via RLS)
- Records are not disclosed to third parties without parental consent
- Students 18 or older have the right to control their own records (handled by role-based access)

### 3.3 Third-Party Data Processors

| Processor | Data Shared | Purpose | Data Processing Agreement |
|---|---|---|---|
| **Supabase** | All app data | Database, auth, storage, realtime | Supabase's standard DPA (GDPR-compliant) covers this |
| **Sentry** | Error events only — **no PII must appear in error logs** | Error monitoring | Sentry DPA available; acceptable for error-only data |
| **Netlify** | No user data | Static hosting | No personal data processed |
| **Twilio** (if SMS OTP is implemented) | Phone numbers | Authentication | Twilio DPA required before enabling |

**Rule:** No new third-party service may be added that receives personal data without (a) a signed DPA and (b) an update to this section.

### 3.4 Data Residency

All data is stored in Supabase's US region. CMDFW is a US-based organization serving US-based users. No cross-border data transfer issues apply.

---

## 4. Authentication & Session Management

### 4.1 Login Method

**All phases:** Magic link (passwordless email) via Supabase Auth. The user enters their email address; Supabase sends a one-time login link; clicking the link authenticates the session. No password is ever set, stored, or managed.

**Why magic link:** Eliminates the entire password surface — no weak passwords, no credential stuffing, no "forgot password" flow, no password reset emails that could be intercepted. The only credential is access to the user's email account, which is already the recovery path for any password-based system.

**Future (Phase 2):** Phone OTP via Twilio SMS as an alternative login method (not a replacement). When implemented, phone numbers must be validated as US numbers before enrollment. Twilio integration requires a DPA (Section 3.3) and a registered Twilio phone number.

**Magic link security properties:**
- Links expire after 1 hour (Supabase default — do not extend)
- Links are single-use — clicking once invalidates the link
- Links are sent to the provisioned email address only — account creation is still admin-controlled (ADR-007)
- No password database to breach

### 4.2 Token Storage — Critical Requirement

**Rule:** JWT session tokens MUST be stored using `expo-secure-store` on native platforms (iOS and Android). `AsyncStorage` is plaintext storage and is explicitly prohibited for session tokens.

**Implementation:**

```typescript
// lib/supabase.ts — required implementation
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const storage = {
  getItem: (key: string) =>
    Platform.OS === 'web'
      ? localStorage.getItem(key)
      : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) =>
    Platform.OS === 'web'
      ? localStorage.setItem(key, value)
      : SecureStore.setItemAsync(key, value),
  removeItem: (key: string) =>
    Platform.OS === 'web'
      ? localStorage.removeItem(key)
      : SecureStore.deleteItemAsync(key),
};
```

**Why this matters:** On Android, AsyncStorage is stored as a plaintext SQLite database. On a rooted device or via ADB, tokens are trivially extractable, allowing account takeover without the user's password.

### 4.3 Session Lifecycle

| Behavior | Requirement |
|---|---|
| Session expiry | Supabase default: access token expires after 1 hour; refresh token valid for 7 days. Do not extend these without documented justification. |
| Magic link expiry | 1 hour from send time. Single-use. Supabase invalidates the link on first use. |
| Refresh token rotation | Must be enabled in Supabase Auth settings. Each use of a refresh token issues a new one and invalidates the old one. |
| Sign-out | Must call `supabase.auth.signOut()` which revokes the session server-side. Clearing local storage alone is insufficient. |
| Concurrent sessions | Supabase allows multiple active sessions per user (different devices). This is acceptable behavior for this app. |
| Inactivity timeout | Not required at launch. Revisit if coordinators or admins report sharing devices. |

### 4.4 Account Creation & Access Provisioning

**Rule: No self-registration.** Users cannot create their own accounts through the app. All accounts are provisioned by an administrator or coordinator through an offline process (CSV import or manual creation in the Supabase dashboard).

This is the primary COPPA control — it ensures no child under 13 can directly provide personal information to the app.

**Account creation workflow:**
1. Coordinator collects parent/teacher/student information offline (registration form, enrollment form)
2. Coordinator or admin creates accounts in bulk via a provisioning script or admin panel
3. Users receive a password-reset email to set their own password before first login
4. `handle_new_user` trigger assigns default role of `parent`; coordinator updates role before user's first login

---

## 5. Authorization Model

### 5.1 Roles and Permissions Overview

The application uses a two-layer authorization model:

1. **Application layer:** Tab visibility, button visibility, and navigation routing are gated by the active persona role in the React Native app.
2. **Database layer (RLS):** All data access is enforced by PostgreSQL Row Level Security policies, regardless of what the application layer does.

**The database layer is authoritative.** The application layer is a UX convenience only. A user who bypasses the application layer and queries Supabase directly must be limited by RLS alone to exactly what they are authorized to see.

### 5.2 Role Definitions and Data Scope

| Role | `profiles.role` value | Data Scope | Phase |
|---|---|---|---|
| **BV Coordinator** | `bv_coordinator` | All data across all centers and sessions; full write | 1 |
| **Coordinator** | `local_admin` | All data within their assigned session only (`center_id`) | 1 |
| **Teacher** | `teacher` | Their own profile; their assigned class; enrolled students in that class | 1 |
| **Parent** | `parent` | Their own profile; their children's profiles, enrollment, attendance, class updates | 1 |
| **High School Student** | `student` | Their own profile, enrollment, and attendance only (grades 9–12) | 1 |
| **Board Member** | `board_member` | Read all data across all centers and sessions; write events and announcements | 1 |
| **Acharya** | `acharya` | Read all data across all centers and sessions; write events and announcements | 1 |
| **Volunteer** | Stored as `user_roles` row with role `volunteer` | Events and volunteer signups; their own profile | 2 |
| **Substitute** | `is_substitute = true` on `profiles` | Open substitute assignments; their own volunteer records and assignments | 2 |

### 5.3 Multi-Persona Rules

A single user account can hold multiple personas via the `user_roles` table. Rules:

- The active persona is set in the app at login time or via the persona switcher
- RLS policies use `my_role()` which reads from `profiles.role` (the primary/base role)
- **Known gap to resolve in rebuild:** For multi-persona users, `my_role()` always returns the primary role from `profiles.role`, not the active persona. The helper functions must be redesigned to use the active session context or a user-settable claim. This is a required architectural decision before implementing multi-persona login.

### 5.4 Coordinator Write Scope — Critical Constraint

**Rule:** A coordinator (`local_admin`) may only write data scoped to their own center. They may never write org-wide records.

**Specific enforcement requirements:**

| Table | Rule | RLS Enforcement |
|---|---|---|
| `announcements` | Coordinators must set `center_id = my_center_id()`. Setting `center_id = NULL` (org-wide) is reserved for `bv_coordinator` only. | `WITH CHECK (my_role() = 'local_admin' AND center_id = my_center_id() OR my_role() = 'bv_coordinator')` |
| `events` | Coordinators may only create events for their center. | `WITH CHECK (my_role() = 'local_admin' AND center_id = my_center_id() OR my_role() = 'bv_coordinator')` |
| `substitute_assignments` | Coordinators may only manage assignments for classes within their center. | Enforce via center-scoped class lookup in WITH CHECK |

---

## 6. Row Level Security Policy Specifications

This section is the canonical specification for every RLS policy in the database. The schema must implement exactly these policies. Any deviation requires an update to this document first.

### 6.1 Policy Design Rules

1. Every table must have RLS enabled (`ALTER TABLE x ENABLE ROW LEVEL SECURITY`)
2. Every table must have a default-deny posture — no policy means no access
3. `SECURITY DEFINER` functions (`my_role()`, `my_center_id()`, `my_org_id()`) must be the only way RLS policies read the caller's identity — never use subqueries against `profiles` directly inside a policy
4. Views must use `security_invoker = true` — never `SECURITY DEFINER` on views
5. The service role key must never be used in the client application. It bypasses all RLS.

### 6.2 Required Policies Per Table

#### `profiles`
| Policy | Operation | Rule |
|---|---|---|
| own profile | SELECT | `id = auth.uid()` |
| central admin reads all | SELECT | `my_role() = 'bv_coordinator'` |
| local admin reads center | SELECT | `my_role() = 'local_admin' AND center_id = my_center_id()` |
| teacher reads own class members | SELECT | `my_role() = 'teacher' AND (id = auth.uid() OR id IN (SELECT student_id FROM enrollments e JOIN class_teachers ct ON ct.class_id = e.class_id WHERE ct.teacher_id = auth.uid()))` |
| parent reads own children | SELECT | `my_role() = 'parent' AND (id = auth.uid() OR id IN (SELECT student_id FROM family_members WHERE parent_id = auth.uid()))` |
| student reads own profile | SELECT | `my_role() = 'student' AND id = auth.uid()` |
| admin updates profiles | UPDATE | `my_role() IN ('local_admin','bv_coordinator')` |

#### `user_roles`
| Policy | Operation | Rule |
|---|---|---|
| own roles | SELECT | `user_id = auth.uid()` |
| admin reads all | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |
| admin manages | ALL | `my_role() IN ('local_admin','bv_coordinator')` |

#### `classes`, `sessions`, `centers`
| Policy | Operation | Rule |
|---|---|---|
| org members read | SELECT | Via `my_org_id()` chain through center → session → class |
| admin manages | ALL | `my_role() IN ('local_admin','bv_coordinator')` |

#### `class_teachers`
| Policy | Operation | Rule |
|---|---|---|
| teacher reads own | SELECT | `teacher_id = auth.uid()` |
| admin reads all | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |
| admin manages | ALL | `my_role() IN ('local_admin','bv_coordinator')` |

#### `enrollments`
| Policy | Operation | Rule |
|---|---|---|
| student reads own | SELECT | `student_id = auth.uid()` |
| parent reads children | SELECT | `student_id IN (SELECT student_id FROM family_members WHERE parent_id = auth.uid())` |
| teacher reads class | SELECT | `class_id IN (SELECT class_id FROM class_teachers WHERE teacher_id = auth.uid())` |
| admin reads all | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |
| admin manages | ALL | `my_role() IN ('local_admin','bv_coordinator')` |

#### `attendance`
| Policy | Operation | Rule |
|---|---|---|
| teacher reads+writes own class | ALL | USING and WITH CHECK: `class_id IN (SELECT class_id FROM class_teachers WHERE teacher_id = auth.uid())` |
| student reads own | SELECT | `student_id = auth.uid()` |
| parent reads children | SELECT | `student_id IN (SELECT student_id FROM family_members WHERE parent_id = auth.uid())` |
| admin reads all | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |

#### `teacher_absences`
| Policy | Operation | Rule |
|---|---|---|
| teacher manages own | ALL | USING and WITH CHECK: `teacher_id = auth.uid()` |
| admin reads all | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |

#### `substitute_assignments`
| Policy | Operation | Rule |
|---|---|---|
| substitute reads open/own | SELECT | `status = 'open' OR substitute_id = auth.uid()` |
| coordinator reads center | SELECT | `my_role() = 'local_admin' AND class_id IN (SELECT c.id FROM classes c JOIN sessions s ON s.id = c.session_id JOIN centers ctr ON ctr.id = s.center_id WHERE ctr.id = my_center_id())` |
| central admin reads all | SELECT | `my_role() = 'bv_coordinator'` |
| coordinator creates/updates | INSERT, UPDATE | WITH CHECK: `my_role() IN ('local_admin','bv_coordinator')` AND class scoped to their center for `local_admin` |

#### `substitute_volunteers`
| Policy | Operation | Rule |
|---|---|---|
| substitute manages own | ALL | USING and WITH CHECK: `substitute_id = auth.uid()` |
| coordinator reads | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |

#### `class_updates`
| Policy | Operation | Rule |
|---|---|---|
| teacher writes own class | ALL | USING and WITH CHECK: `teacher_id = auth.uid()` |
| enrolled family reads | SELECT | `class_id IN (SELECT class_id FROM enrollments WHERE student_id = auth.uid() OR student_id IN (SELECT student_id FROM family_members WHERE parent_id = auth.uid()))` |
| admin reads all | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |

#### `announcements`
| Policy | Operation | Rule |
|---|---|---|
| org members read | SELECT | `org_id = my_org_id() AND (center_id IS NULL OR center_id = my_center_id()) AND (my_role() IN ('local_admin','bv_coordinator') OR audience @> ARRAY[my_role()])` |
| central admin posts org-wide | INSERT | WITH CHECK: `my_role() = 'bv_coordinator'` |
| coordinator posts center-scoped | INSERT | WITH CHECK: `my_role() = 'local_admin' AND center_id = my_center_id()` |
| admin updates own | UPDATE | `posted_by = auth.uid() AND my_role() IN ('local_admin','bv_coordinator')` |

#### `events`
| Policy | Operation | Rule |
|---|---|---|
| org members read | SELECT | `org_id = my_org_id() AND (center_id IS NULL OR center_id = my_center_id())` |
| central admin manages | ALL | `my_role() = 'bv_coordinator'` |
| coordinator manages center events | ALL | USING and WITH CHECK: `my_role() = 'local_admin' AND center_id = my_center_id()` |

#### `volunteer_signups`
| Policy | Operation | Rule |
|---|---|---|
| own signups | ALL | USING and WITH CHECK: `user_id = auth.uid()` |
| coordinator reads | SELECT | `my_role() IN ('local_admin','bv_coordinator')` |

#### `family_members`
| Policy | Operation | Rule |
|---|---|---|
| parent reads own | SELECT | `parent_id = auth.uid() OR student_id = auth.uid()` |
| admin manages | ALL | `my_role() IN ('local_admin','bv_coordinator')` |

---

## 7. Data Retention & Deletion

### 7.1 Retention Policy

| Data Category | Retention Period | Rationale |
|---|---|---|
| Attendance records | Active academic year + 3 prior years | Coordinators may need year-over-year comparison |
| Class updates | Active academic year + 1 prior year | Recent history useful; older not needed |
| Announcements | 1 year | Historical reference |
| Teacher absence records | Active academic year + 1 prior year | Operational history |
| Substitute records | Active academic year + 1 prior year | Operational history |
| Volunteer signups | 2 years | Volunteer recognition |
| Profiles | Until deleted by admin | Users remain active across years |
| Events | 1 year after event date | Historical reference |

### 7.2 Data Deletion — Required Before Launch

**This capability is required before any real user data is collected.** It is not optional.

**Required deletion operations:**

1. **Student removal:** Delete `enrollments`, `attendance`, `family_members` (student side), `profiles` for the student. Must cascade or be explicit.
2. **Parent removal:** Delete `family_members` (parent side), `profiles` for the parent. Children's records are not affected.
3. **Teacher removal:** Delete `class_teachers`, `teacher_absences`, `substitute_assignments` (as absent teacher). Class updates should be retained but `teacher_id` set to a placeholder "Deleted Teacher" profile.
4. **Full account deletion:** Removes all records associated with the user from all tables, then deletes `auth.users` entry. Supabase cascades to `profiles`.
5. **Academic year purge:** Removes all records with `academic_year < [cutoff]` across `attendance`, `enrollments`, `class_teachers`, `class_updates`.

**Implementation:** A set of database functions (not client-side code) must implement each deletion operation. They must be callable only by `bv_coordinator` or `local_admin`.

### 7.3 Right to Deletion (COPPA)

Under COPPA, a parent has the right to request deletion of their child's personal information at any time. The workflow:

1. Parent contacts coordinator or admin
2. Admin uses the student removal function (Section 7.2)
3. Deletion is confirmed by absence of the student's records
4. No soft-delete / tombstone required — hard delete is acceptable

---

## 8. Secrets & Environment Management

### 8.1 Environment Topology

Three environments are required before real users are onboarded:

| Environment | Purpose | Supabase Project | Netlify Site |
|---|---|---|---|
| **Development** | Active feature development | Separate project (`balvihar-dev`) | Local only (Expo dev server) |
| **Staging** | Integration testing, pre-launch validation | Separate project (`balvihar-staging`) | Staging Netlify site |
| **Production** | Live user data | Separate project (`balvihar-prod`) | Production Netlify site |

**Rule:** Development and staging databases contain only synthetic test data — never real user data, never production copies.

### 8.2 Secrets Inventory

| Secret | Variable Name | Stored In | Exposed to Client? |
|---|---|---|---|
| Supabase project URL | `EXPO_PUBLIC_SUPABASE_URL` | `.env.local` | Yes (safe — not secret) |
| Supabase anon key | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` | Yes (safe — RLS protects data) |
| Supabase service role key | `SUPABASE_SERVICE_ROLE_KEY` | Never in app | **Never** — server-side scripts only |
| Sentry DSN | `EXPO_PUBLIC_SENTRY_DSN` | `.env.local` | Yes (safe — public by design) |
| Twilio credentials (future) | Not yet defined | Server-side only | **Never** |

**Rules:**
- `.env.local` files must be listed in `.gitignore` and must never be committed
- The service role key must never appear in any file tracked by git — ever
- Each environment has its own set of secrets — dev and staging keys must never be the same as production keys
- Secrets rotation procedure: rotate immediately if any key is exposed; update all environments; invalidate old sessions

### 8.3 Supabase Anon Key Safety

The anon key is safe to embed in the client app because:
- It identifies the project but does not bypass RLS
- All data access is gated by RLS policies
- Without a valid JWT (issued by Supabase Auth after login), the anon key can only reach tables with explicit public-access policies — and no such policies exist in this schema

---

## 9. Transport & Storage Security

### 9.1 In-Transit

- All traffic between the app and Supabase is HTTPS/TLS — enforced by Supabase
- All traffic between the user and Netlify is HTTPS — enforced by Netlify (HSTS enabled)
- No unencrypted connections are permitted. HTTP must redirect to HTTPS.

### 9.2 At-Rest

- Supabase encrypts data at rest using AES-256 (Supabase Pro and above)
- Device-stored session tokens are encrypted by `expo-secure-store` using the platform keychain (iOS Keychain, Android Keystore)
- No additional application-level field encryption is required at initial launch
- **Deferred (post-launch):** Field-level encryption of `profiles.phone` using `pgcrypto`. Disk-level AES-256 encryption (Supabase Pro) combined with RLS provides sufficient protection for adult phone numbers at this scale. Revisit only if: (a) the data inventory expands to include minors' phone numbers, or (b) a formal security audit specifically recommends it.

### 9.3 File Storage (Supabase Storage)

If the `photo_url` feature on `class_updates` is ever activated:
- Uploads must go to a private Supabase Storage bucket (not public)
- Access must be via signed URLs with a 1-hour expiry
- File type must be validated server-side (accept only `image/jpeg`, `image/png`, `image/webp`)
- Maximum file size: 5MB per upload
- Files must never contain or be named with student personal information

---

## 10. Incident Response

### 10.1 Severity Levels

| Severity | Definition | Response Time |
|---|---|---|
| **P1 — Critical** | Unauthorized access to student or family PII; credentials exposed | Immediate — within 1 hour |
| **P2 — High** | Auth bypass or RLS policy failure allowing cross-user data access | Within 4 hours |
| **P3 — Medium** | App outage or data unavailability | Within 24 hours |
| **P4 — Low** | UI bugs, minor data issues | Next business day |

### 10.2 P1/P2 Response Procedure

1. **Isolate** — Disable the affected Supabase project's API keys via the Supabase dashboard. This immediately severs all client connections.
2. **Assess** — Review Supabase logs to determine scope: which users were affected, what data was accessed, when.
3. **Notify** — If student PII was accessed without authorization, notify affected families within 72 hours. COPPA does not specify a notification window, but this is best practice and may be required by state law.
4. **Remediate** — Fix the root cause (policy gap, leaked key, etc.) in staging. Test fix in staging. Deploy to production.
5. **Document** — Write an incident report: timeline, root cause, data affected, remediation, preventive measures.
6. **Rotate** — Rotate all API keys after any P1/P2 incident.

### 10.3 Supabase Backup & Recovery

| Tier | Backup Frequency | Point-in-Time Recovery | Required For |
|---|---|---|---|
| Supabase Free | None (manual only) | Not available | Development only |
| Supabase Pro | Daily automated backups | 7 days PITR | **Required for staging and production** |

**Rule:** Supabase must be upgraded to Pro before any real user data is stored. The free tier provides no automatic backups.

**Manual backup procedure (development only):** Export from Supabase Dashboard → Settings → Backups. Store exported `.sql` file in a private, access-controlled location. Do not store in the git repository.

**Recovery time objective (RTO):** 4 hours for production data recovery.  
**Recovery point objective (RPO):** 24 hours (daily backup cadence on Pro).

---

## 11. Security Testing Requirements

The following security tests are required for every feature before it is considered done. They are incorporated into the Definition of Done (Document 5).

### 11.1 RLS Boundary Tests

For every feature that reads or writes data, a corresponding RLS test must verify:

| Test | Description |
|---|---|
| **Own data only** | Authenticated as User A, query returns only User A's data |
| **Cross-user isolation** | Authenticated as User A, attempt to fetch User B's data — must return empty or error |
| **Role escalation** | Authenticated as a lower-privilege role (student), attempt to call an operation reserved for a higher-privilege role (admin) — must be denied |
| **Unauthenticated access** | Without a valid JWT, all data queries return empty results |
| **Coordinator scope** | Coordinator cannot read or write data for a different center |

### 11.2 Auth Tests

| Test | Description |
|---|---|
| **Session expiry** | After token expiry, app prompts re-authentication rather than silently failing |
| **Sign-out completeness** | After sign-out, session is invalidated server-side; reuse of old token is rejected |
| **Token storage** | Session token is stored in SecureStore, not AsyncStorage (verified via device inspection in development builds) |

### 11.3 Input Validation Tests

| Test | Description |
|---|---|
| **SQL injection** | All text inputs passed to Supabase queries use parameterized queries (Supabase client enforces this by default — verify no raw SQL strings are constructed from user input) |
| **Oversized input** | Text fields with no length limit checked against a 10,000-character maximum |
| **Audience field** | Announcement audience array only accepts valid role values — no injection of arbitrary strings |

---

## 12. Open Items & Decisions Required

The following items must be resolved before the application can be released to real users. They are not optional.

| # | Item | Owner | Required By |
|---|---|---|---|
| 1 | **Privacy Notice** — Draft a plain-language privacy notice covering: what data is collected, why, who sees it, how long it's kept, and how parents can request deletion. Must be reviewed and signed off by an officer of CMDFW. | CMDFW Leadership | Before any real user data is collected |
| 2 | **Multi-persona RLS architecture** — Design and document how `my_role()` resolves for users with multiple personas. Current helper function reads `profiles.role` only. A decision is needed: (a) store active persona in a JWT custom claim set at login, (b) require persona-switch to trigger a new session, or (c) redesign policies to accept any of the user's roles. | Developer | Before implementing multi-persona login |
| 3 | **Student account age policy** — Define the minimum age for a student to have their own login credentials vs. being a record-only entry accessed by their parent. Recommend: under-13 students are record-only (parent accesses their data); 13+ may have their own login. | CMDFW Leadership | Before any student accounts are provisioned |
| 4 | **Data deletion UI** — Build the admin-facing data deletion capability described in Section 7.2. This must exist before any real user data is collected. | Developer | Before launch |
| 5 | **Supabase Pro upgrade** — Upgrade the production Supabase project to the Pro tier before onboarding any real users. This enables daily automated backups and 7-day point-in-time recovery. | CMDFW Admin | Before launch |
| 6 | **Three-environment setup** — Create separate Supabase projects for dev, staging, and production. No real user data may ever be stored in the dev or staging projects. | Developer | Before any real user data is collected |

---

*This document supersedes all prior security-related content in `PRODUCTION_READINESS.md` and `PRODUCT_OVERVIEW.md` Section 8. Those sections should be considered deprecated.*

*Next document: [02_DATA_MODEL.md](02_DATA_MODEL.md) — Canonical schema, RLS implementation, indexes, and migration strategy.*

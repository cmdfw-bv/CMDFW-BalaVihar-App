# Data Model
### CMDFW Bala Vihar App — Document 2 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Canonical — the schema.sql file must match this document exactly  

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Entity Relationship Overview](#2-entity-relationship-overview)
3. [Table Specifications](#3-table-specifications)
4. [Helper Functions](#4-helper-functions)
5. [Views](#5-views)
6. [Indexes](#6-indexes)
7. [Migrations Strategy](#7-migrations-strategy)
8. [Seed Data Strategy](#8-seed-data-strategy)
9. [Known Design Decisions & Rationale](#9-known-design-decisions--rationale)
10. [Canonical schema.sql](#10-canonical-schemasql)

---

## 1. Design Principles

1. **Schema is the source of truth.** The `schema.sql` file in `/database/` must be a complete, runnable representation of the production schema — including all tables, constraints, indexes, RLS policies, helper functions, triggers, and views. It must be possible to recreate the entire database from this file alone.

2. **RLS is authoritative.** All access control is enforced at the database layer via Row Level Security. The `01_SECURITY_AND_COMPLIANCE.md` document defines the policy specifications; this document defines the implementation. Application-layer role checks are for UX only.

3. **Academic year is a first-class concept.** Every operational record (attendance, class updates, announcements, enrollments, class assignments) must be stamped with an academic year from the moment it is created. This enables year-over-year comparison and clean data archiving.

4. **No orphaned data.** Foreign keys use `ON DELETE CASCADE` where child records have no meaning without the parent. Exception: `class_updates.teacher_id` uses `ON DELETE SET NULL` — the update content should survive if a teacher profile is deleted.

5. **UUIDs everywhere.** All primary keys are UUID (`gen_random_uuid()`). No integer sequences.

6. **Unique constraints are explicit contracts.** Every unique constraint represents a real-world invariant. They are documented with a rationale below.

---

## 2. Entity Relationship Overview

```
organizations
  └── centers
        └── sessions
              └── classes
                    ├── class_teachers ──────────→ profiles (teachers)
                    ├── enrollments ─────────────→ profiles (students)
                    ├── attendance ──────────────→ profiles (students)
                    └── class_updates ───────────→ profiles (teachers)

profiles
  ├── user_roles          (multi-persona: one user, many roles)
  └── family_members      (parent ──→ student)

profiles (teachers)
  ├── teacher_absences
  └── substitute_assignments (as absent_teacher_id)

substitute_assignments
  └── substitute_volunteers ──→ profiles (substitutes)

academic_years            (lookup table for year management)

organizations
  ├── announcements
  └── events
        └── volunteer_signups ──→ profiles
```

---

## 3. Table Specifications

### 3.1 `academic_years`

Lookup table for academic year management. Exactly one row may have `is_current = true` at any time. Enforced by a trigger.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `label` | text | NO | — | e.g. `"2025-26"` |
| `start_date` | date | NO | — | First day of the academic year (e.g. 2025-08-01) |
| `end_date` | date | NO | — | Last day of the academic year (e.g. 2026-05-31) |
| `is_current` | boolean | NO | `false` | Exactly one row is `true` at a time |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(label)`  
**Trigger:** `enforce_single_current_year` — when a row is updated to `is_current = true`, sets all other rows to `is_current = false`.

**RLS:** All authenticated org members may SELECT. Only `central_admin` may INSERT/UPDATE.

---

### 3.2 `organizations`

Top-level entity. One organization per deployment in practice.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `name` | text | NO | — | Organization name |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

---

### 3.3 `centers`

A physical location (campus) within an organization. An org can have multiple centers.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | — | FK → `organizations.id` ON DELETE CASCADE |
| `name` | text | NO | — | e.g. `"Richardson Center"` |
| `city` | text | YES | — | City name |
| `address` | text | YES | — | Street address |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

---

### 3.4 `sessions`

A recurring time slot at a center (e.g. "Session A" every Sunday 9–11am). A center can have multiple sessions on the same day.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `center_id` | uuid | NO | — | FK → `centers.id` ON DELETE CASCADE |
| `name` | text | NO | — | e.g. `"Session A"`, `"Session B"` |
| `start_time` | time | NO | — | e.g. `09:00` |
| `end_time` | time | NO | — | e.g. `11:00` |
| `day_of_week` | int | YES | `0` | 0 = Sunday |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

---

### 3.5 `classes`

One class per grade per session. e.g. "Grade 5 · Session A · Richardson".

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `session_id` | uuid | NO | — | FK → `sessions.id` ON DELETE CASCADE |
| `grade` | text | NO | — | `"Pre-K"`, `"Kindergarten"`, `"Grade 1"` … `"Grade 12"` |
| `grade_order` | int | NO | — | Sort order: 0=Pre-K, 1=K, 2–13=Grades 1–12 |
| `room` | text | YES | — | Room number or name |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

---

### 3.6 `profiles`

One row per authenticated user. Auto-created on sign-up via trigger on `auth.users`. The `id` matches `auth.users.id`.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | — | PK; matches `auth.users.id` |
| `full_name` | text | YES | — | Display name. Nullable at trigger-time; coordinator fills before first login. |
| `phone` | text | YES | — | Unique phone number |
| `role` | text | NO | `'parent'` | Primary role: `parent` `student` `teacher` `local_admin` `central_admin` |
| `org_id` | uuid | YES | — | FK → `organizations.id` |
| `center_id` | uuid | YES | — | FK → `centers.id`; NULL for `central_admin` |
| `is_substitute` | boolean | NO | `false` | True if this user is in the substitute pool |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(phone)` — when phone is non-null.

**Check constraint:** `role IN ('parent','student','teacher','local_admin','central_admin')`

**Trigger:** `handle_new_user` — fires `AFTER INSERT ON auth.users`; creates a `profiles` row with `role = 'parent'` as default. Coordinator updates the role before the user's first login.

**Note on `is_substitute`:** This boolean flag marks users who are in the substitute pool in addition to their primary role. A teacher can also be a substitute. A parent can also be a substitute. It is not a standalone role — it is a modifier on an existing profile.

---

### 3.7 `user_roles`

Enables multi-persona support. A user can have multiple rows — one per role they hold. The app shows a persona picker on login when more than one row exists.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `user_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `role` | text | NO | — | Role for this persona: any valid role value |
| `label` | text | NO | — | Human-readable label shown in picker, e.g. `"Parent · Richardson"` |
| `center_id` | uuid | YES | — | FK → `centers.id`; overrides `profiles.center_id` for this persona |
| `display_order` | int | YES | — | Sort order in the persona picker |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(user_id, role, center_id)` — a user cannot hold the same role at the same center twice.

**Check constraint:** `role IN ('parent','student','teacher','local_admin','central_admin','volunteer','substitute')`

**Design note — multi-persona and RLS:** See Section 9.1 for the architectural decision on how `my_role()` resolves for multi-persona users. This is an open item that must be resolved before multi-persona login is implemented.

---

### 3.8 `class_teachers`

Links one or more teachers to a class for a given academic year.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `class_id` | uuid | NO | — | FK → `classes.id` ON DELETE CASCADE |
| `teacher_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `academic_year` | text | NO | — | FK → `academic_years.label` e.g. `"2025-26"` |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(class_id, teacher_id, academic_year)` — a teacher cannot be assigned to the same class twice in the same year. Multiple teachers per class per year are permitted.

**Breaking change from prototype:** The prototype had `UNIQUE(class_id, academic_year)` — one teacher per class. This constraint is dropped in the rebuild. All queries using `.single()` on `class_teachers` must be updated to handle multiple rows.

---

### 3.9 `family_members`

Links a parent profile to one or more student profiles.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `parent_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `student_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(parent_id, student_id)`

---

### 3.10 `enrollments`

Enrolls a student in a class for a given academic year. One enrollment per student per year.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `student_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `class_id` | uuid | NO | — | FK → `classes.id` ON DELETE CASCADE |
| `academic_year` | text | NO | — | FK → `academic_years.label` |
| `status` | text | NO | `'active'` | `active` `inactive` `pending` |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(student_id, academic_year)` — one class per student per year.

**Check constraint:** `status IN ('active','inactive','pending')`

---

### 3.11 `attendance`

One row per student per class session date. Submitted by the teacher.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `class_id` | uuid | NO | — | FK → `classes.id` ON DELETE CASCADE |
| `student_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `session_date` | date | NO | — | The Sunday this attendance was recorded |
| `academic_year` | text | NO | — | FK → `academic_years.label` — stamped at insert time |
| `status` | text | NO | — | `present` `absent` `excused` |
| `recorded_by` | uuid | YES | — | FK → `profiles.id`; teacher who submitted |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(class_id, student_id, session_date)`

**Check constraint:** `status IN ('present','absent','excused')`

**New column from prototype:** `academic_year` added. Required for year-over-year comparison and compliance dashboard correctness.

---

### 3.12 `teacher_absences`

A teacher's self-reported upcoming absence. Triggers the substitute request workflow.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `teacher_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `absence_date` | date | NO | — | Date of the absence |
| `reason` | text | YES | — | `Family travel` `Health` `Personal` `Other` |
| `notes` | text | YES | — | Optional additional context |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(teacher_id, absence_date)`

**Check constraint:** `reason IN ('Family travel','Health','Personal','Other') OR reason IS NULL`

---

### 3.13 `substitute_assignments`

Tracks the lifecycle of a substitute request from open to confirmed. Created by a coordinator after a teacher absence is reported.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `class_id` | uuid | NO | — | FK → `classes.id` ON DELETE CASCADE |
| `session_date` | date | NO | — | Date needing coverage |
| `absent_teacher_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `substitute_id` | uuid | YES | — | FK → `profiles.id`; NULL until assigned |
| `assigned_by` | uuid | YES | — | FK → `profiles.id`; coordinator who assigned |
| `status` | text | NO | `'open'` | `open` `pending` `confirmed` `declined` |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(class_id, session_date)` — one assignment per class per date.

**Check constraint:** `status IN ('open','pending','confirmed','declined')`

**Status lifecycle:**
```
open → (coordinator assigns) → pending → (sub accepts) → confirmed
                                        → (sub declines) → open
```

---

### 3.14 `substitute_volunteers`

Tracks which substitutes have raised their hand for a given assignment. Many substitutes can volunteer; coordinator picks one.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `assignment_id` | uuid | NO | — | FK → `substitute_assignments.id` ON DELETE CASCADE |
| `substitute_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(assignment_id, substitute_id)`

---

### 3.15 `class_updates`

Posted by teachers after each session. Visible to enrolled students and their parents.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `class_id` | uuid | NO | — | FK → `classes.id` ON DELETE CASCADE |
| `teacher_id` | uuid | YES | — | FK → `profiles.id` ON DELETE SET NULL — update survives teacher deletion |
| `session_date` | date | NO | — | The Sunday this update covers |
| `academic_year` | text | NO | — | FK → `academic_years.label` — stamped at insert time |
| `content` | text | NO | — | What happened in class |
| `homework` | text | YES | — | Homework or reading assigned |
| `photo_url` | text | YES | — | Supabase Storage path (feature not yet active) |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(class_id, session_date)` — one update per class per session.

**New column from prototype:** `academic_year` added.

---

### 3.16 `announcements`

Posted by coordinators or admins. Scoped to org-wide or a specific center. Targeted by audience role array.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | — | FK → `organizations.id` ON DELETE CASCADE |
| `center_id` | uuid | YES | — | FK → `centers.id`; NULL = org-wide |
| `posted_by` | uuid | NO | — | FK → `profiles.id` |
| `title` | text | NO | — | Announcement headline |
| `body` | text | NO | — | Full announcement text |
| `audience` | text[] | NO | `'{parent,student,teacher,local_admin,central_admin,volunteer,substitute}'` | Roles who should see this |
| `academic_year` | text | NO | — | FK → `academic_years.label` — stamped at insert time |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**New column from prototype:** `academic_year` added.

**Scoping rule:** `center_id IS NULL` = all centers in the org. Coordinators must always set `center_id = my_center_id()`. Only `central_admin` may post with `center_id = NULL`. Enforced by RLS WITH CHECK (see `01_SECURITY_AND_COMPLIANCE.md` Section 6.2).

---

### 3.17 `events`

Org or center events that volunteers can sign up for.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `org_id` | uuid | NO | — | FK → `organizations.id` ON DELETE CASCADE |
| `center_id` | uuid | YES | — | FK → `centers.id`; NULL = org-wide event |
| `title` | text | NO | — | Event name |
| `description` | text | YES | — | Details about the event |
| `event_date` | date | NO | — | Date of the event |
| `start_time` | time | YES | — | Start time |
| `end_time` | time | YES | — | End time |
| `location` | text | YES | — | Venue or room |
| `created_by` | uuid | NO | — | FK → `profiles.id` |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

---

### 3.18 `volunteer_signups`

Tracks who has signed up to volunteer for an event.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NO | `gen_random_uuid()` | Primary key |
| `event_id` | uuid | NO | — | FK → `events.id` ON DELETE CASCADE |
| `user_id` | uuid | NO | — | FK → `profiles.id` ON DELETE CASCADE |
| `status` | text | NO | `'signed_up'` | `signed_up` `cancelled` |
| `created_at` | timestamptz | YES | `now()` | Auto-set on insert |

**Unique constraint:** `(event_id, user_id)` — one record per user per event; upserted on cancel/re-signup.

**Check constraint:** `status IN ('signed_up','cancelled')`

---

## 4. Helper Functions

These are `SECURITY DEFINER` functions — they run with elevated privileges to read caller identity and are the only permitted way to access the current user's identity inside RLS policies.

```sql
-- Returns the primary role of the authenticated user
CREATE OR REPLACE FUNCTION my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- Returns the center_id of the authenticated user
CREATE OR REPLACE FUNCTION my_center_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT center_id FROM profiles WHERE id = auth.uid();
$$;

-- Returns the org_id of the authenticated user
CREATE OR REPLACE FUNCTION my_org_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$$;

-- Returns the label of the current academic year
CREATE OR REPLACE FUNCTION current_academic_year()
RETURNS text LANGUAGE sql SECURITY DEFINER AS $$
  SELECT label FROM academic_years WHERE is_current = true LIMIT 1;
$$;
```

**Rule:** Never use subqueries against `profiles` directly inside RLS policy expressions. Always use these helper functions. Violation creates subtle bypass vectors when the policies are evaluated under different execution contexts.

---

## 5. Views

Both views use `security_invoker = true` — they execute as the querying user and respect all RLS policies on the underlying tables. This must never be changed to `SECURITY DEFINER`.

### `v_class_roster`
Full class roster joining class, session, center, enrolled students, and all assigned teachers.

**Updated from prototype:** Returns multiple rows per class when multiple teachers are assigned (no longer uses a single teacher join).

**Key columns:** `class_id`, `grade`, `grade_order`, `room`, `session_name`, `center_name`, `student_id`, `student_name`, `teacher_id`, `teacher_name`, `academic_year`

### `v_attendance_summary`
Attendance statistics per student per class, scoped to the current academic year by default.

**Key columns:** `student_id`, `student_name`, `class_id`, `grade`, `academic_year`, `present_count`, `absent_count`, `excused_count`, `total_sessions`, `attendance_pct`

---

## 6. Indexes

These indexes are required for RLS policy performance. Without them, every authenticated request runs full-table subquery scans. At 800+ users these become the primary latency bottleneck.

```sql
-- RLS subquery support
CREATE INDEX idx_class_teachers_teacher_id  ON class_teachers(teacher_id);
CREATE INDEX idx_class_teachers_class_year  ON class_teachers(class_id, academic_year);
CREATE INDEX idx_enrollments_student_id     ON enrollments(student_id);
CREATE INDEX idx_enrollments_class_year     ON enrollments(class_id, academic_year);
CREATE INDEX idx_family_members_parent_id   ON family_members(parent_id);
CREATE INDEX idx_family_members_student_id  ON family_members(student_id);
CREATE INDEX idx_attendance_class_student   ON attendance(class_id, student_id);
CREATE INDEX idx_attendance_student_id      ON attendance(student_id);
CREATE INDEX idx_attendance_class_date      ON attendance(class_id, session_date);
CREATE INDEX idx_profiles_org_id            ON profiles(org_id);
CREATE INDEX idx_profiles_center_id         ON profiles(center_id);
CREATE INDEX idx_announcements_org_center   ON announcements(org_id, center_id);
CREATE INDEX idx_user_roles_user_id         ON user_roles(user_id);
CREATE INDEX idx_sub_assignments_status     ON substitute_assignments(status);
CREATE INDEX idx_sub_volunteers_assignment  ON substitute_volunteers(assignment_id);
```

---

## 7. Migrations Strategy

### 7.1 Principles

1. **Every schema change is a migration file** — never apply changes directly via the Supabase SQL editor in staging or production without a corresponding migration file committed to the repository.
2. **Migrations are append-only** — never edit an existing migration file. Add a new one.
3. **Migrations are idempotent where possible** — use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
4. **Test every migration on staging before production** — run the migration file in staging, verify the app works, then apply to production.
5. **Never run seed data on staging or production** — seed files are for development only.

### 7.2 File Naming Convention

```
/database/migrations/
  001_initial_schema.sql
  002_add_academic_years_table.sql
  003_add_academic_year_to_attendance.sql
  004_fix_class_teachers_unique_constraint.sql
  005_add_rls_performance_indexes.sql
  ...
```

Format: `NNN_description_in_snake_case.sql` where NNN is a zero-padded sequential number.

### 7.3 Migration Template

```sql
-- Migration: NNN_description
-- Date: YYYY-MM-DD
-- Description: What this migration does and why

BEGIN;

-- ... your changes here ...

COMMIT;
```

Always wrap in a transaction. If any statement fails, the entire migration rolls back.

### 7.4 First Migrations Required for Rebuild

In order:

| # | Migration | Reason |
|---|---|---|
| 001 | Full initial schema (this document) | Baseline for the rebuild |
| 002 | RLS policies (all tables) | Cannot be omitted from the schema file |
| 003 | RLS performance indexes | Must exist from day one |
| 004 | `academic_years` table + trigger | New table; required before any seed data |
| 005 | `academic_year` column on `attendance`, `class_updates`, `announcements` | Adds missing columns |
| 006 | Fix `class_teachers` unique constraint | Drop old constraint, add new one |
| 007 | `user_roles` table | Required for multi-persona login |
| 008 | `substitute_assignments` table | Required for sub workflow |
| 009 | `substitute_volunteers` table | Required for sub workflow |
| 010 | `events` table | Required for volunteer features |
| 011 | `volunteer_signups` table | Required for volunteer features |

---

## 8. Seed Data Strategy

### 8.1 Environments

| Environment | Seed Data? | Notes |
|---|---|---|
| Development | ✅ Yes — full synthetic dataset | Full academic year, all personas, all workflows |
| Staging | ✅ Yes — minimal synthetic dataset | Enough to test each flow; not the full 800-user dataset |
| Production | ❌ Never | Real user data only; seeded by coordinator via admin panel or CSV import |

### 8.2 Seed Data Requirements

The development seed must include:

| Data | Requirement |
|---|---|
| 1 organization | CMDFW |
| 3 centers | Richardson, Plano, Frisco |
| 2 sessions per center | Session A, Session B |
| Pre-K through Grade 12 per session | 14 classes × 6 sessions = 84 classes |
| 1 academic year marked `is_current = true` | `"2025-26"` |
| 1 prior academic year | `"2024-25"` — enables year-over-year testing |
| 1 central admin | `admin@test.com` |
| 1 coordinator per center | `coordinator.richardson@test.com` etc. |
| 2–3 teachers per class | Tests multiple-teacher constraint |
| 1 substitute teacher | `sub@test.com` with `is_substitute = true` |
| 1 parent with 2 children | Tests multi-child parent view |
| 1 parent who is also a volunteer | Tests multi-persona picker |
| 1 teacher who is also a substitute | Tests multi-persona + sub workflow |
| Attendance records for at least 6 Sundays | Current academic year only |
| `academic_year` stamped on all attendance rows | Validates new column |
| At least 2 teacher absences | One with assignment, one without |
| At least 1 full sub request lifecycle | open → pending → confirmed |
| At least 3 class updates | Current academic year |
| At least 2 announcements | One center-scoped, one org-wide |
| At least 2 events | One with signups, one without |
| `user_roles` rows for multi-persona users | Enables persona picker testing |

### 8.3 Test Credentials

All development/staging test accounts use password `Test1234!` (meets complexity requirements: uppercase, lowercase, digit, special character).

| Email | Role | Center | Notes |
|---|---|---|---|
| `admin@test.com` | central_admin | — | Org-wide access |
| `coordinator.richardson@test.com` | local_admin | Richardson | Has parent + volunteer personas too |
| `coordinator.plano@test.com` | local_admin | Plano | Single persona |
| `coordinator.frisco@test.com` | local_admin | Frisco | Single persona |
| `teacher.one@test.com` | teacher | Richardson | Also a substitute |
| `teacher.two@test.com` | teacher | Richardson | Single persona |
| `parent.one@test.com` | parent | Richardson | 2 children enrolled |
| `parent.two@test.com` | parent | Plano | Also a volunteer |
| `student.one@test.com` | student | Richardson | Child of parent.one |
| `sub@test.com` | teacher | Richardson | `is_substitute = true`; also has substitute user_role |
| `volunteer@test.com` | parent | Frisco | Also has volunteer persona |

---

## 9. Known Design Decisions & Rationale

### 9.1 Multi-Persona RLS Resolution (Open Item)

**Problem:** `my_role()` reads `profiles.role` — the user's primary role. For a user who is both a parent and a volunteer, `my_role()` always returns `parent` regardless of which persona they've selected in the app. This means RLS policies for volunteer-only data would never grant access to this user through `my_role()` alone.

**Options:**

| Option | Description | Tradeoff |
|---|---|---|
| **A — JWT custom claims** | Store active persona role in a JWT custom claim (`app_metadata.active_role`). Update on persona switch via a Supabase Edge Function. `my_role()` reads from the claim. | Clean, fast, correct. Requires an Edge Function and a session re-issue on persona switch. Recommended. |
| **B — Re-issue session on switch** | Persona switch calls `supabase.auth.signOut()` + `supabase.auth.signInWithPassword()` with a persona token. | Correct but creates a login round-trip on every persona switch. Poor UX. |
| **C — Expand RLS to check all user's roles** | Policies check `my_role() = 'X' OR EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'X')` | No JWT changes needed, but every policy becomes more complex and slower. |

**Recommended:** Option A. This decision must be made before multi-persona login is implemented and documented in the Architecture document (Document 4).

### 9.2 `academic_year` as a Text Foreign Key

Academic year is stored as a text label (e.g. `"2025-26"`) rather than a UUID foreign key into `academic_years`. This is intentional:

- Text labels are human-readable in queries and exports
- The label format is stable and unambiguous
- UUID joins would require every query to join `academic_years` for filtering
- Referential integrity is maintained by a CHECK constraint pattern; orphaned year strings will not exist because only valid labels from `academic_years` are stamped at insert time (enforced in application layer and validated by triggers)

### 9.3 `class_updates.teacher_id` ON DELETE SET NULL

When a teacher profile is deleted, their class updates should be retained — the content is valuable to families regardless of whether the teacher is still in the system. The `teacher_id` is set to NULL on deletion, and the app renders "Former Teacher" in that case.

### 9.4 `announcements.audience` Default

The default audience is all role values. This means a coordinator who doesn't explicitly set an audience sends to everyone, which is the correct safe default for a community app. Audience restriction is intentional — broadcasting is the default.

---

## 10. Canonical schema.sql

The file `/database/schema.sql` must be regenerated for the rebuild to match this specification exactly. The current file is **not** the canonical schema — it is missing 5 tables, is missing `academic_year` columns on 3 tables, has the wrong unique constraint on `class_teachers`, has no indexes, and is missing RLS policies for the 5 absent tables.

The rebuild begins with a clean `schema.sql` generated from this document. The RLS policy implementations are specified in `01_SECURITY_AND_COMPLIANCE.md` Section 6.

**Checklist for schema.sql completeness:**

- [ ] All 18 tables present (17 original + `academic_years`)
- [ ] All unique constraints match this document
- [ ] All check constraints match this document
- [ ] All foreign keys with correct ON DELETE behavior
- [ ] `handle_new_user` trigger
- [ ] `enforce_single_current_year` trigger on `academic_years`
- [ ] All 4 helper functions (`my_role`, `my_center_id`, `my_org_id`, `current_academic_year`)
- [ ] RLS enabled on all 18 tables
- [ ] All RLS policies per `01_SECURITY_AND_COMPLIANCE.md` Section 6.2
- [ ] All 15 indexes from Section 6 of this document
- [ ] Both views (`v_class_roster`, `v_attendance_summary`) with `security_invoker = true`
- [ ] No hardcoded academic year strings — all use `current_academic_year()` function

---

*This document supersedes all schema-related content in the legacy `DATABASE_SCHEMA.md`. That file should be considered deprecated.*

*Next document: [03_PRD.md](03_PRD.md) — Product Requirements Document: all seven personas, feature specifications, and acceptance criteria.*

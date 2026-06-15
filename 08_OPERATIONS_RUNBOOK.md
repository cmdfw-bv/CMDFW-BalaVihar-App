> ⚠️ **DRAFT — NOT BINDING.** The authoritative source of truth for this project is **[1_GREENFIELD_POC_PROPOSAL.md](1_GREENFIELD_POC_PROPOSAL.md)**. This is an earlier vibe-coded draft to be challenged against requirements, not adopted (per doc 1 §2–§3). Retained for reference only.

# Operations Runbook
### CMDFW Bala Vihar App — Document 8 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Approved — follow these procedures for all operational tasks  

---

## Table of Contents

1. [Runbook Purpose](#1-runbook-purpose)
2. [System Inventory](#2-system-inventory)
3. [Access & Credentials](#3-access--credentials)
4. [Routine Operations](#4-routine-operations)
5. [Deployment Procedures](#5-deployment-procedures)
6. [Database Operations](#6-database-operations)
7. [Backup & Recovery](#7-backup--recovery)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Incident Response](#9-incident-response)
10. [User Administration](#10-user-administration)
11. [Academic Year Procedures](#11-academic-year-procedures)
12. [Offboarding & Shutdown](#12-offboarding--shutdown)

---

## 1. Runbook Purpose

This document is the operational reference for anyone responsible for running the CMDFW Bala Vihar App in production. It answers the question: "What do I do when X happens?"

It covers routine tasks (deploying a change, running a migration), recovery procedures (restoring from backup, rolling back a deploy), and incident response (a security issue, data corruption, an outage).

**This document assumes the reader has access to:**
- The GitHub repository
- The Netlify dashboard
- The Supabase dashboard for all three projects (dev, staging, production)
- Sentry
- The credentials listed in Section 3

---

## 2. System Inventory

### Production Services

| Service | Purpose | URL / Reference |
|---|---|---|
| **Netlify** | PWA hosting + CDN | `balvihar.netlify.app` (or custom domain) |
| **Supabase (prod)** | Database, auth, storage, realtime | `balvihar-prod` project in Supabase dashboard |
| **Supabase (staging)** | Pre-production validation | `balvihar-stage` project |
| **Supabase (dev)** | Active development | `balvihar-dev` project |
| **GitHub** | Source code + CI | `mehtamaulik-creator/balvihar` |
| **Sentry** | Error monitoring | Sentry project: `balvihar` |

### Branch → Environment Mapping

| Git Branch | Deploys To | Database |
|---|---|---|
| `main` | Production Netlify | `balvihar-prod` |
| `staging` | Staging Netlify | `balvihar-stage` |
| Feature branches | No auto-deploy | `balvihar-dev` (local) |

### Key Files

| File | Purpose |
|---|---|
| `mobile/netlify.toml` | Netlify build configuration |
| `mobile/eas.json` | Expo EAS build profiles (Phase 2) |
| `mobile/.env.local` | Local dev secrets (gitignored) |
| `database/migrations/` | All schema migration files |
| `database/seeds/dev_seed.sql` | Development seed data (never run on staging/prod) |
| `.github/workflows/ci.yml` | CI pipeline definition |

---

## 3. Access & Credentials

### Who Needs Access to What

| Role | GitHub | Netlify | Supabase (prod) | Supabase (staging/dev) | Sentry |
|---|---|---|---|---|---|
| Developer | ✅ Full | ✅ Full | ⚠️ Read + migrations | ✅ Full | ✅ Full |
| CMDFW Admin (non-technical) | ❌ | ❌ | ❌ | ❌ | ❌ |
| Incident responder | ✅ Read | ✅ Full | ✅ Full | ✅ Full | ✅ Full |

### Secrets Inventory

All secrets are stored in the Netlify environment variables dashboard (for deployed environments) and in `.env.local` (for local development, gitignored). They are never stored in the repository.

| Secret | Where Stored | Rotation Trigger |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` (per env) | Netlify env vars | Never (URL is stable) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` (per env) | Netlify env vars | Immediately on suspected exposure |
| `SUPABASE_SERVICE_ROLE_KEY` (per env) | Edge Function secrets only | Immediately on suspected exposure |
| `EXPO_PUBLIC_SENTRY_DSN` | Netlify env vars | Never (public by design) |
| Supabase JWT secret | Supabase Auth settings | Annually, or immediately on suspected breach |

### Secret Rotation Procedure

If any secret is suspected to be exposed (e.g. accidentally committed, visible in a log):

1. **Supabase anon key:** Go to Supabase dashboard → Settings → API → Regenerate anon key. Update Netlify env var. Trigger a new deploy. Old key is immediately invalidated.
2. **Service role key:** Supabase dashboard → Settings → API → Regenerate service role key. Update Edge Function secrets. Redeploy Edge Functions.
3. **JWT secret:** Supabase dashboard → Auth → Settings → JWT Secret → Rotate. **This invalidates all active user sessions.** All users will be signed out and must sign in again. Schedule during low-usage hours.
4. After any rotation: update the secret in all environments where it is used. Verify the app works on staging before touching production.

---

## 4. Routine Operations

### 4.1 Checking System Health

Run this check before any deployment and after any incident:

```bash
# 1. Check Netlify deploy status
# → Netlify dashboard → Sites → balvihar → Deploys
# All recent deploys should show "Published"

# 2. Check Supabase project health
# → Supabase dashboard → balvihar-prod → Reports
# Check: API response times, database connections, error rate

# 3. Check Sentry for recent errors
# → Sentry → balvihar project → Issues
# Filter: last 24 hours, unresolved
# Any P1/P2 issues (auth failures, RLS errors) require immediate attention

# 4. Verify the app is loading
# Open the production URL in a browser
# Confirm the login screen loads within 3 seconds
```

### 4.2 Viewing Logs

**Application errors:** Sentry dashboard → Issues. Filter by environment (production vs staging).

**Database query logs:** Supabase dashboard → Logs → Database. Useful for diagnosing slow queries or RLS policy errors.

**Auth logs:** Supabase dashboard → Logs → Auth. Shows login attempts, magic link sends, failures.

**Edge Function logs:** Supabase dashboard → Edge Functions → [function name] → Logs.

**Netlify build logs:** Netlify dashboard → Deploys → [deploy] → Deploy log.

### 4.3 Monitoring Active Sessions

To see how many users are currently active:

```sql
-- Run in Supabase SQL editor (prod) — read-only query
SELECT COUNT(*) as active_sessions
FROM auth.sessions
WHERE not_after > now();
```

To see a breakdown by role:

```sql
SELECT p.role, COUNT(*) as count
FROM auth.sessions s
JOIN public.profiles p ON p.id = s.user_id
WHERE s.not_after > now()
GROUP BY p.role
ORDER BY count DESC;
```

---

## 5. Deployment Procedures

### 5.1 Standard Feature Deployment

This is the normal path for deploying a completed, tested slice.

```
1. Feature branch is complete and all DoD items satisfied
   │
   ▼
2. Open PR: feature branch → staging
   - CI must pass (TypeScript + lint + tests)
   - PR description must include completed DoD checklist
   │
   ▼
3. Merge PR to staging
   - Netlify auto-deploys to staging environment
   - Wait for deploy to complete (~2-3 minutes)
   │
   ▼
4. Apply any new migration files to balvihar-stage
   (see Section 6.2 — Migration Procedure)
   │
   ▼
5. Run regression checklist (07_TEST_PLAN.md Section 8)
   against the staging deployment
   │
   ▼
6. Run feature-specific tests from 07_TEST_PLAN.md
   │
   ├── Any P1/P2 defects found → fix on feature branch, repeat from step 2
   │
   └── All tests pass → proceed
   │
   ▼
7. Open PR: staging → main
   - No new code changes — this PR contains exactly what was tested
   - CI must pass
   │
   ▼
8. Merge PR to main
   - Netlify auto-deploys to production
   - Wait for deploy to complete
   │
   ▼
9. Apply any new migration files to balvihar-prod
   │
   ▼
10. Verify production is healthy
    - Open the production URL; confirm app loads
    - Check Sentry for any new errors (wait 10 minutes)
    - Run regression checklist R-01 through R-05 against production
```

**Rule:** Never skip step 4 (applying migrations to staging before testing) or step 9 (applying migrations to production after deploy). A deploy without its migrations, or migrations without a deploy, leaves the system in an inconsistent state.

### 5.2 Hotfix Deployment

For P1/P2 defects discovered in production that require an immediate fix:

```
1. Create hotfix branch from main (not staging):
   git checkout main
   git pull
   git checkout -b hotfix/[description]
   │
   ▼
2. Make the minimal fix — only what is required to resolve the defect
   No feature additions, no refactoring
   │
   ▼
3. Test locally against balvihar-dev
   │
   ▼
4. Open PR: hotfix branch → main
   CI must pass
   │
   ▼
5. Apply migration to balvihar-prod (if schema change)
   │
   ▼
6. Merge to main — Netlify deploys to production
   │
   ▼
7. Verify fix resolves the incident (Section 9 — Incident Response)
   │
   ▼
8. Back-merge main → staging to keep staging in sync:
   git checkout staging
   git merge main
   git push
```

**Why hotfix branches from main and not staging:** Staging may contain unreleased changes. A hotfix from staging would accidentally ship untested features.

### 5.3 Rolling Back a Deployment

If a deployment introduces a regression and must be reversed:

**Application code rollback:**

```
Netlify dashboard → Deploys → [previous working deploy] → "Publish deploy"
```

This immediately reverts the live site to the previous build. Takes ~30 seconds. No code changes required.

**Database migration rollback:**

Migrations do not automatically reverse. If a migration must be rolled back:

1. Write a compensating migration: `/database/migrations/NNN_revert_[description].sql`
2. Apply it to the affected environment using the standard migration procedure
3. Redeploy the application code that is compatible with the reverted schema

**Prevention is better than rollback:** All migrations should be designed to be additive (adding columns, adding tables) rather than destructive (dropping columns, changing types). Additive migrations are safe to roll back by reverting application code while leaving the schema change in place.

### 5.4 Checking Deploy Status

```bash
# Via Netlify CLI (optional)
netlify status

# Or check the Netlify dashboard:
# Sites → balvihar → Deploys → [latest deploy]
# Status should be "Published" — if "Failed", check the deploy log
```

---

## 6. Database Operations

### 6.1 Accessing the Database

**For queries and inspection (read-only):**
- Supabase dashboard → SQL Editor → run queries
- For production: treat every query as potentially impactful; use `SELECT` only unless performing a planned operation

**For migrations:**
- Always use migration files (see 6.2), never ad-hoc SQL in production

**Direct connection (psql) — advanced only:**
```bash
# Connection string available in: Supabase dashboard → Settings → Database → Connection string
psql "postgresql://postgres:[password]@[host]:5432/postgres"
```

### 6.2 Migration Procedure

**Never apply schema changes directly in the Supabase SQL editor on staging or production without a migration file.** Changes made without migration files cannot be reproduced, audited, or rolled back.

```
Step 1: Write the migration file
  Location: /database/migrations/NNN_description.sql
  Format: BEGIN; ... COMMIT;
  Test it: apply to balvihar-dev, verify app works

Step 2: Commit the migration file with the feature PR
  The migration file must be in the same PR as the code that requires it

Step 3: After PR merges to staging
  Apply to balvihar-stage:
  → Supabase dashboard (staging) → SQL Editor
  → Paste migration file content → Run
  → Confirm no errors
  → Run app tests against staging

Step 4: After PR merges to main (production deploy)
  Apply to balvihar-prod:
  → Supabase dashboard (production) → SQL Editor
  → Paste migration file content → Run
  → Confirm no errors
  → Run regression checklist

Step 5: Verify
  → Check Supabase logs for any errors
  → Check Sentry for any new errors within 10 minutes
```

### 6.3 Verifying Migration Success

After applying a migration, run these checks:

```sql
-- Verify a new table exists
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = '[new_table]';

-- Verify RLS is enabled on a new table
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = '[new_table]';
-- rowsecurity should be 't' (true)

-- Verify a new column exists
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = '[table]' AND column_name = '[column]';

-- Verify an index was created
SELECT indexname FROM pg_indexes
WHERE tablename = '[table]' AND indexname = '[index_name]';
```

### 6.4 Safe SQL Patterns for Production

**Always use transactions for multi-statement changes:**
```sql
BEGIN;
ALTER TABLE attendance ADD COLUMN academic_year text;
UPDATE attendance SET academic_year = '2025-26' WHERE academic_year IS NULL;
ALTER TABLE attendance ALTER COLUMN academic_year SET NOT NULL;
COMMIT;
```

**Test destructive operations with a dry run first:**
```sql
-- Before running a DELETE, verify the scope with a SELECT:
SELECT COUNT(*) FROM attendance WHERE session_date < '2022-01-01';
-- If count looks correct, proceed with DELETE in a transaction
```

**Never run these in production without explicit justification:**
- `DROP TABLE`
- `TRUNCATE`
- `DELETE` without a `WHERE` clause
- `ALTER TABLE ... DROP COLUMN`
- Any statement that modifies `auth.users` directly

---

## 7. Backup & Recovery

### 7.1 Backup Strategy

| Environment | Backup Type | Frequency | Retention | Who Manages |
|---|---|---|---|---|
| Production | Automated (Supabase Pro) | Daily | 7-day PITR | Supabase |
| Staging | Automated (Supabase Pro) | Daily | 7-day PITR | Supabase |
| Development | None required | — | — | — |

**Point-in-Time Recovery (PITR):** Supabase Pro allows restoring the database to any second within the last 7 days. This is the primary recovery mechanism.

**Pre-operation manual backup:** Before any significant migration or bulk data operation, take a manual backup:
```
Supabase dashboard → Settings → Backups → Create backup
```
Label the backup with the date and reason (e.g. "pre-migration-007 2026-06-10").

### 7.2 Recovery Procedures

#### Scenario A: Accidental data deletion (small scope)

Example: A coordinator accidentally deleted 10 attendance records.

```
1. Identify the affected records (class_id, student_ids, session_date)

2. Use PITR to query what the data looked like before the deletion:
   → Supabase dashboard → Settings → Backups → Restore to point in time
   → Select a time before the deletion
   → This creates a NEW project (does not overwrite production)

3. Export the affected rows from the restored project:
   SELECT * FROM attendance WHERE class_id = X AND session_date = Y;

4. Re-insert the rows into production manually via SQL editor

5. Verify the restored records in the app

6. Delete the temporary restored project to avoid ongoing costs
```

#### Scenario B: Bad migration corrupted data (large scope)

Example: A migration accidentally cleared `academic_year` values.

```
1. IMMEDIATELY: Disable writes to affected tables to prevent further corruption
   → In Supabase RLS, add a temporary policy: FOR ALL USING (false) WITH CHECK (false)
   → This prevents any further data changes while you assess

2. Assess scope: how many rows are affected?
   SELECT COUNT(*) FROM attendance WHERE academic_year IS NULL;

3. Use PITR to restore the full database to the last clean state:
   → Supabase dashboard → Settings → Backups → Restore to point in time
   → Select a time before the migration ran
   → Supabase creates a new project with the restored data

4. Option A (if scope is small): Extract and re-insert affected rows (same as Scenario A)

5. Option B (if scope is large): Promote the restored project to production
   → Update Netlify env vars to point to the restored project URL + keys
   → Trigger a new Netlify deploy
   → Old production project becomes the backup

6. Remove the temporary "deny all" RLS policies

7. Write and apply a compensating migration to prevent recurrence

8. Document the incident (Section 9.4)
```

#### Scenario C: Full production outage

Example: Supabase project is unavailable; app shows blank screens.

```
1. Check Supabase status page: status.supabase.com
   → If Supabase infrastructure is down, this is outside our control
   → Monitor status page; no action required until service is restored

2. If outage is caused by our configuration (bad migration, bad env var):
   → Check Netlify deploy log for errors
   → Check Supabase logs for connection errors
   → Roll back the deployment (Section 5.3) if caused by a recent deploy

3. Communicate to users (if outage > 30 minutes):
   → Coordinator contacts affected users via WhatsApp/email
   → No in-app communication is possible during an outage

4. When service is restored:
   → Verify the app loads and users can log in (Regression checklist R-01, R-02)
   → Check Sentry for any errors generated during or after the outage
   → Document the incident
```

### 7.3 Recovery Time Objectives

| Scenario | Recovery Time Objective | Recovery Point Objective |
|---|---|---|
| Accidental small data deletion | 2 hours | Last PITR second (effectively zero data loss) |
| Bad migration, large scope | 4 hours | Last PITR second |
| Full Supabase outage | Dependent on Supabase SLA (99.9% uptime = max ~8.7 hrs/year) | No data loss (outage, not deletion) |
| Netlify outage | 30 minutes (rollback to prior deploy) | No data loss |

---

## 8. Monitoring & Alerting

### 8.1 Sentry Configuration

Sentry captures all unhandled errors in the application. Key configuration:

- **Environment tags:** Each deployment sets `EXPO_PUBLIC_ENV` (development / staging / production). Sentry uses this to tag errors by environment. Production errors are never mixed with staging errors.
- **User context:** Every error includes the authenticated user's ID and active persona role. No PII (names, emails, phone numbers) in error context.
- **Alerts:** Configure Sentry to send an email alert when a new P1-class error occurs (auth failures, RLS errors surfaced as unexpected empty data).

### 8.2 What to Monitor Weekly

Every week during active usage, check:

```
1. Sentry: any new unresolved issues in production?
   → Sort by "First seen" in the last 7 days
   → Investigate any issue with > 5 occurrences

2. Supabase (prod) → Reports → API:
   → Average response time should be < 200ms for standard queries
   → Error rate should be < 0.1%
   → Any spikes correlate with a recent deployment?

3. Supabase (prod) → Reports → Database:
   → Active connections: should be well below the Pro tier limit (500)
   → Slow queries: any query taking > 1 second? Likely missing an index.

4. Netlify → Analytics:
   → Page load time: < 3 seconds on mobile
   → 404 errors: any broken links?
```

### 8.3 Performance Baselines

These are the acceptable performance thresholds. If any metric falls outside these ranges, investigate before the next deployment.

| Metric | Target | Investigate If |
|---|---|---|
| Magic link send time | < 2 seconds | > 5 seconds |
| Feed load (first page) | < 1.5 seconds | > 3 seconds |
| Attendance submission (20 students) | < 3 seconds | > 5 seconds |
| API average response time | < 200ms | > 500ms |
| Netlify deploy time | < 4 minutes | > 10 minutes |
| Sentry new error rate | 0 new P1/P2 per week | Any new P1/P2 |

---

## 9. Incident Response

### 9.1 Severity Definitions

*(Matches `01_SECURITY_AND_COMPLIANCE.md` Section 10.1)*

| Severity | Definition | Response Time |
|---|---|---|
| **P1 — Critical** | Unauthorized access to student or family PII; credentials exposed; authentication bypass | Immediate — within 1 hour |
| **P2 — High** | RLS policy failure allowing cross-user data access; app outage for all users | Within 4 hours |
| **P3 — Medium** | Feature broken for a subset of users; data display error without security impact | Within 24 hours |
| **P4 — Low** | UI bug, minor display issue | Next available slot |

### 9.2 P1 Response Procedure

**Step 1 — Isolate (within 15 minutes)**
```
Supabase dashboard → balvihar-prod → Settings → API
→ Regenerate the anon key
→ This immediately severs all active API connections
→ The app will show errors for all users — this is intentional
```

**Step 2 — Assess (within 1 hour)**
```
Supabase dashboard → Logs → Database
→ Filter by the affected time window
→ Identify: which queries returned unexpected data?
→ Which user_ids were involved?
→ What tables were accessed?

Supabase dashboard → Logs → Auth
→ Were there any unusual login patterns?
→ Any accounts accessed from unexpected locations?
```

**Step 3 — Notify (within 2 hours if PII was exposed)**
```
If student or family PII was accessed without authorization:
→ Notify the affected families directly via coordinator
→ Notification should include: what data was potentially accessed,
  when it occurred, and what we are doing about it
→ COPPA does not specify a notification deadline, but within 72 hours
  is best practice and may be required by applicable state law
```

**Step 4 — Remediate**
```
1. Identify the root cause (misconfigured RLS policy, leaked key, logic bug)
2. Reproduce the issue on staging — verify you can trigger it
3. Write the fix
4. Apply fix to staging — verify the vulnerability is closed
5. Run the full RLS security test suite (07_TEST_PLAN.md Section 7)
6. Apply fix to production (hotfix procedure, Section 5.2)
7. Update the anon key in Netlify env vars and redeploy
8. Verify production is working (regression checklist)
```

**Step 5 — Document (within 24 hours)**

Write an incident report (Section 9.4).

### 9.3 P2 Response Procedure

**App outage (all users cannot access the app):**
```
1. Check Netlify deploy status — is the latest deploy published?
2. Check Supabase status.supabase.com — is Supabase healthy?
3. If caused by a recent deploy: roll back via Netlify dashboard (Section 5.3)
4. If caused by a migration: apply compensating migration (Section 6.2)
5. Verify fix with regression checklist
6. Document the incident
```

**RLS failure (users can see data they should not):**
```
1. Identify the affected table and policy
2. Add a temporary restrictive policy to block the access:
   CREATE POLICY "emergency_block" ON [table] FOR SELECT USING (false);
3. This immediately stops the exposure but blocks all access to the table
4. Communicate to users that the feature is temporarily unavailable
5. Write the correct policy fix
6. Test on staging
7. Apply to production and remove the emergency block policy
8. Document the incident
```

### 9.4 Incident Report Template

Write an incident report for every P1 or P2 incident within 24 hours of resolution. Store in `/docs/incidents/YYYY-MM-DD_description.md`.

```markdown
# Incident Report: [Short Description]

**Date:** YYYY-MM-DD  
**Severity:** P1 / P2  
**Duration:** [start time] → [resolved time]  
**Reported by:** [name]  

## What Happened
[Plain-language description of what occurred. What did users experience?]

## Root Cause
[Technical explanation of what caused the incident]

## Timeline
- HH:MM — [event]
- HH:MM — [event]
- HH:MM — [resolved]

## Data Impact
[Was any data exposed, corrupted, or lost? Which tables? Estimated number of affected records? Were any users affected?]

## Remediation
[What was done to resolve the incident?]

## Preventive Measures
[What changes will prevent this class of incident in the future?
Specific: new test case added? RLS policy tightened? Migration template updated?]
```

---

## 10. User Administration

### 10.1 Provisioning a New User

Follow the in-app provisioning flow (Slice 1-13). For bulk provisioning (e.g. new academic year enrollment):

```
1. Prepare a CSV with columns: full_name, email, role, center_name
2. Upload via the admin provisioning screen (CSV import path)
3. Verify each user received a magic link invitation email
4. Follow up with users who have not logged in after 7 days
   (magic link invitations do not expire, but users may have missed the email)
```

### 10.2 Changing a User's Role or Center

Coordinators and admins cannot self-modify their roles. Use the Supabase dashboard for role changes:

```sql
-- Change a user's primary role
UPDATE profiles
SET role = 'teacher', center_id = '[center-uuid]'
WHERE id = '[user-uuid]';

-- Add a persona to a user
INSERT INTO user_roles (user_id, role, label, center_id, display_order)
VALUES ('[user-uuid]', 'volunteer', 'Volunteer', '[center-uuid]', 2);
```

### 10.3 Deleting a User

User deletion must be performed by an admin. The procedure depends on the user's role:

**Delete a student (and preserve class update history):**
```sql
BEGIN;
-- Remove enrollments
DELETE FROM enrollments WHERE student_id = '[student-uuid]';
-- Remove attendance records
DELETE FROM attendance WHERE student_id = '[student-uuid]';
-- Remove family links
DELETE FROM family_members WHERE student_id = '[student-uuid]';
-- Remove user_roles
DELETE FROM user_roles WHERE user_id = '[student-uuid]';
-- Delete profile (auth.users cascade will handle auth record)
DELETE FROM profiles WHERE id = '[student-uuid]';
-- Delete auth account
-- (use the admin provisioning Edge Function's delete endpoint,
--  or Supabase dashboard → Authentication → Users → Delete)
COMMIT;
```

**Delete a teacher:**
```sql
BEGIN;
-- Remove class assignments
DELETE FROM class_teachers WHERE teacher_id = '[teacher-uuid]';
-- Remove absence records
DELETE FROM teacher_absences WHERE teacher_id = '[teacher-uuid]';
-- Set teacher_id to NULL on class updates (ON DELETE SET NULL handles this automatically
-- via the FK constraint — but verify after delete)
-- Remove user_roles
DELETE FROM user_roles WHERE user_id = '[teacher-uuid]';
DELETE FROM profiles WHERE id = '[teacher-uuid]';
COMMIT;
-- Verify class updates still exist with teacher_id = NULL
SELECT COUNT(*) FROM class_updates WHERE teacher_id IS NULL;
```

**Delete a parent:**
```sql
BEGIN;
DELETE FROM family_members WHERE parent_id = '[parent-uuid]';
DELETE FROM volunteer_signups WHERE user_id = '[parent-uuid]';
DELETE FROM user_roles WHERE user_id = '[parent-uuid]';
DELETE FROM profiles WHERE id = '[parent-uuid]';
COMMIT;
-- Note: student profiles linked to this parent are NOT deleted
-- Students remain enrolled; they just lose the parent link
```

After any deletion, verify in the app that the user cannot log in and that their data is no longer visible to other users.

### 10.4 Resetting a User's Session

If a user reports being stuck in a broken state (persona not loading, old data showing):

```
Option 1 — Ask the user to sign out and sign back in
  → Profile tab → Sign Out → request new magic link

Option 2 — Revoke all sessions server-side (if user cannot access the app)
  → Supabase dashboard → Authentication → Users → [user] → "Sign out all sessions"
  → User's next magic link request will create a fresh session
```

---

## 11. Academic Year Procedures

### 11.1 Opening a New Academic Year

Perform this procedure in **August** before the new program year begins.

```
Step 1: Verify seed data for the new year is prepared
  → Confirm new class assignments (which teacher teaches which class)
  → Confirm student enrollments for the new year
  → Confirm new academic year dates (start date, end date, label)

Step 2: Open the new academic year in the app
  → Log in as Central Admin
  → Dashboard → Academic Year Management → "Open New Year"
  → Enter: label (e.g. "2026-27"), start date (e.g. 2026-08-01), end date (e.g. 2027-05-31)
  → Confirm: this sets is_current = true and closes the prior year

Step 3: Provision new teacher-class assignments
  → For each class, assign the teacher(s) for the new year
  → Use the coordinator dashboard or direct SQL:
    INSERT INTO class_teachers (class_id, teacher_id, academic_year)
    VALUES ('[class-uuid]', '[teacher-uuid]', '2026-27');

Step 4: Provision new student enrollments
  → For each student, create an enrollment for the new year
  → Students who advance a grade need a new enrollment (different class_id)
  → Use bulk CSV import or direct SQL

Step 5: Verify
  → Teacher logs in → sees correct class assignment for new year
  → Student logs in → sees correct class enrollment for new year
  → Coordinator compliance dashboard shows new year with all ✗ (nothing submitted yet)
  → Prior year data is accessible via year selector (read-only)
```

### 11.2 End-of-Year Data Archival

At the end of the program year (May/June), optionally archive data older than 3 years:

```sql
-- Identify records to archive (preview first)
SELECT COUNT(*) FROM attendance
WHERE academic_year IN (
  SELECT label FROM academic_years
  WHERE end_date < CURRENT_DATE - INTERVAL '3 years'
);

-- Export to CSV before deleting (use Supabase table editor → Export)

-- Delete old records (only after export is confirmed)
BEGIN;
DELETE FROM attendance
WHERE academic_year IN (
  SELECT label FROM academic_years
  WHERE end_date < CURRENT_DATE - INTERVAL '3 years'
);
DELETE FROM class_updates
WHERE academic_year IN (
  SELECT label FROM academic_years
  WHERE end_date < CURRENT_DATE - INTERVAL '3 years'
);
-- Repeat for announcements, enrollments, class_teachers as appropriate
COMMIT;
```

---

## 12. Offboarding & Shutdown

If the application is ever decommissioned:

### 12.1 Data Export

Before shutdown, export all user data:

```
Supabase dashboard → Table Editor → each table → Export as CSV
```

Export order (respects foreign key dependencies):
1. `organizations`, `centers`, `sessions`, `classes`
2. `academic_years`
3. `profiles`, `user_roles`, `family_members`
4. `enrollments`, `class_teachers`
5. `attendance`, `class_updates`, `announcements`
6. `teacher_absences`, `substitute_assignments`, `substitute_volunteers`
7. `events`, `volunteer_signups`

Store all exports in a password-protected archive. Retain for a minimum of 3 years after shutdown per data retention policy (`01_SECURITY_AND_COMPLIANCE.md` Section 7.1).

### 12.2 User Notification

Notify all users at least 30 days before shutdown:
- What data is being retained and for how long
- How users can request a copy of their own data
- Who to contact with questions

### 12.3 Service Shutdown Sequence

```
1. Set Netlify site to maintenance mode (redirect all traffic to a static page)
2. Revoke all active Supabase sessions:
   DELETE FROM auth.sessions; -- (via SQL editor)
3. Export all data (Section 12.1)
4. Verify exports are complete and accessible
5. Delete Supabase projects (balvihar-prod, balvihar-stage, balvihar-dev)
6. Delete Netlify sites
7. Archive GitHub repository (Settings → Archive repository)
8. Cancel Apple Developer Program and Google Play Console accounts (Phase 2)
9. Cancel any Twilio account (Phase 2)
10. Retain domain registration for 1 year post-shutdown (to prevent domain hijacking)
```

---

## Appendix: Quick Reference

### Most Common Tasks

| Task | Where |
|---|---|
| Deploy a feature | PR to staging → test → PR to main |
| Apply a migration | Supabase SQL editor → paste migration file |
| Roll back a deploy | Netlify → Deploys → previous deploy → "Publish deploy" |
| Rotate the anon key | Supabase → Settings → API → Regenerate |
| View errors | Sentry → Issues → production |
| Check a user's sessions | Supabase → Authentication → Users → [user] |
| Open a new academic year | App → Central Admin Dashboard → Academic Year Management |
| Restore from backup | Supabase → Settings → Backups → Restore to point in time |
| Provision a new user | App → Coordinator Dashboard → Provision User |
| Delete a user | Follow procedure in Section 10.3 |

### Emergency Contacts

| Role | Contact Method |
|---|---|
| Supabase support | support.supabase.com (Pro tier includes email support) |
| Netlify support | netlify.com/support |
| Sentry support | sentry.io/support |

---

*This document completes the pre-build documentation set for the CMDFW Bala Vihar App rebuild.*

*Document index:*
- *[01_SECURITY_AND_COMPLIANCE.md](01_SECURITY_AND_COMPLIANCE.md)*
- *[02_DATA_MODEL.md](02_DATA_MODEL.md)*
- *[03_PRD.md](03_PRD.md)*
- *[04_ARCHITECTURE.md](04_ARCHITECTURE.md)*
- *[05_DEFINITION_OF_DONE.md](05_DEFINITION_OF_DONE.md)*
- *[06_DEVELOPMENT_SLICES.md](06_DEVELOPMENT_SLICES.md)*
- *[07_TEST_PLAN.md](07_TEST_PLAN.md)*
- *[08_OPERATIONS_RUNBOOK.md](08_OPERATIONS_RUNBOOK.md)*
- *[ARCHITECTURE_DECISIONS.md](ARCHITECTURE_DECISIONS.md)*

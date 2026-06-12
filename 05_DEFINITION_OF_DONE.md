# Definition of Done
### CMDFW Bala Vihar App — Document 5 of 8

**Version:** 1.0  
**Date:** 2026-06-10  
**Status:** Approved — every item on this checklist must be satisfied before a feature is considered complete and shippable  

---

## Purpose

The Definition of Done (DoD) is the shared, non-negotiable standard that every feature must meet before it moves to staging and before it ships to production. It exists to prevent "done" from meaning "it works on my machine" or "the happy path works."

A feature is **not done** until every applicable item in this checklist is satisfied. There are no exceptions without a documented decision in `ARCHITECTURE_DECISIONS.md`.

---

## Table of Contents

1. [The Checklist](#1-the-checklist)
2. [How to Apply It](#2-how-to-apply-it)
3. [Category Guidance](#3-category-guidance)
4. [Feature-Specific Additions](#4-feature-specific-additions)

---

## 1. The Checklist

### Category A — Correctness

| # | Item | Notes |
|---|---|---|
| A-01 | The feature works end-to-end on the happy path | Manually verified on the staging environment, not just locally |
| A-02 | All edge cases identified in the PRD acceptance criteria pass | See `03_PRD.md` for the acceptance criteria per feature |
| A-03 | The feature works correctly for every persona that can access it | Test each relevant persona, not just the primary one |
| A-04 | Multi-teacher classes are handled correctly | Any feature touching classes, attendance, or rosters must handle 2–3 teachers per class |
| A-05 | Academic year is stamped correctly on all new records | Verify `academic_year` column is populated on `attendance`, `class_updates`, `announcements`, `enrollments`, `class_teachers` inserts |
| A-06 | No `.single()` calls on `class_teachers` | All queries on `class_teachers` return arrays and handle multiple results |
| A-07 | Compliance date is calculated programmatically | Any feature using a "most recent Sunday" reference uses `lastSundayISO()` from `src/lib/dates.ts` — never `MAX(session_date)` |

---

### Category B — Security & Access Control

| # | Item | Notes |
|---|---|---|
| B-01 | RLS boundary test: own data only | Authenticated as User A, query returns only User A's authorized data |
| B-02 | RLS boundary test: cross-user isolation | Authenticated as User A, direct Supabase query for User B's data returns empty or error |
| B-03 | RLS boundary test: role escalation | A lower-privilege role (e.g. student) cannot perform an action reserved for a higher role (e.g. coordinator) via direct API call |
| B-04 | RLS boundary test: unauthenticated access | Without a valid JWT, all data queries return empty or 401 |
| B-05 | RLS boundary test: coordinator scope | Coordinator cannot read or write data belonging to a different center — verified via direct API call, not just UI |
| B-06 | Coordinator write scope enforced | Any feature that allows coordinator writes verifies the `WITH CHECK` policy prevents cross-center or org-wide writes |
| B-07 | No service role key in client code | `grep -r "service_role"` returns no matches in `src/` or `app/` |
| B-08 | No secrets in source code | `grep -rE "(SUPABASE_SERVICE|SECRET|PASSWORD)" src/ app/` returns no hardcoded values |
| B-09 | Input from users is not used in raw SQL strings | All Supabase queries use the client SDK's parameterized interface — no string concatenation into query expressions |
| B-10 | Audience-filtered content is enforced by RLS | Announcement and content visibility is validated at the database layer, not only by client-side filtering |

---

### Category C — Error Handling

| # | Item | Notes |
|---|---|---|
| C-01 | Every failed network operation shows a user-visible error message | No silent failures — no `return` without setting an error state |
| C-02 | Every failed network operation is reported to Sentry | `captureError()` called with screen, action, and non-PII context |
| C-03 | No PII in Sentry payloads | Error context must not include student names, parent names, phone numbers, or any High Sensitivity data from `01_SECURITY_AND_COMPLIANCE.md` Section 2.2 |
| C-04 | Loading states are shown during data fetches | Skeleton component renders while `loading === true` — no blank screens |
| C-05 | Empty states are shown when data is absent | Purposeful empty state message renders when `data.length === 0` — no blank white areas |
| C-06 | Error states have a retry action | Error banners include a "Try again" button that re-invokes the failed operation |
| C-07 | Unprovisioned email login shows correct message | If magic link auth succeeds but no `profiles` row exists, user sees "This email is not registered. Contact your coordinator." and is signed out |

---

### Category D — TypeScript & Code Quality

| # | Item | Notes |
|---|---|---|
| D-01 | `npx tsc --noEmit` passes with zero errors | TypeScript compilation is clean |
| D-02 | `npx eslint src app --max-warnings 0` passes | No lint errors or warnings, including `no-explicit-any` |
| D-03 | No `any` types in production code | `@typescript-eslint/no-explicit-any: error` is active — this is caught by D-02, but verify intentionally |
| D-04 | All Supabase response types use generated types | No manual type definitions for database rows — use `database.types.ts` |
| D-05 | No business logic in screen files | Screens call hooks and render components. Data fetching and mutation logic is in `src/hooks/`. |
| D-06 | No Supabase calls in component files | Components in `src/components/` receive all data as props — they never call `supabase` directly |
| D-07 | No inline styles | All styles use `StyleSheet.create()` or theme tokens from `src/theme/index.ts` |
| D-08 | No hardcoded academic year strings | Academic year values come from `useAcademicYear()` hook or `current_academic_year()` SQL function |
| D-09 | No duplicated utility functions | `formatDate`, `lastSundayISO`, and other shared utilities exist once in `src/lib/` — not redefined per screen |
| D-10 | Realtime subscriptions are cleaned up on unmount | Every `supabase.channel()` call has a corresponding `supabase.removeChannel()` in the `useEffect` cleanup |

---

### Category E — Testing

| # | Item | Notes |
|---|---|---|
| E-01 | Manual test executed for every affected persona | Follow the persona test matrix in `07_TEST_PLAN.md` for the feature being shipped |
| E-02 | Device matrix covered | Tested on at minimum: iOS Safari (PWA installed) and Android Chrome (PWA installed) |
| E-03 | RLS security smoke test executed | The tests in Category B above have been run directly against the Supabase API (not just the UI) using different user sessions |
| E-04 | Regression test on adjacent features | Features that share data with the new feature have been spot-checked for unintended breakage |
| E-05 | Playwright tests written and passing (Phase 2+) | For any feature in the Playwright test suite, the relevant test(s) pass on Chromium, Firefox, and WebKit |

---

### Category F — Database

| # | Item | Notes |
|---|---|---|
| F-01 | Schema change has a migration file | Any new table, column, index, constraint, or policy change is in `/database/migrations/NNN_description.sql` |
| F-02 | Migration file is idempotent where possible | Uses `IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING` patterns |
| F-03 | Migration is wrapped in a transaction | `BEGIN; ... COMMIT;` so any failure rolls back entirely |
| F-04 | Migration has been applied to staging and verified | Migration runs cleanly on the staging Supabase project before production |
| F-05 | RLS is enabled on any new table | `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` is in the migration |
| F-06 | RLS policies for new tables match `01_SECURITY_AND_COMPLIANCE.md` Section 6.2 | No deviation without a documented decision |
| F-07 | New indexes added for any new RLS subquery patterns | Any new `WHERE user_id = auth.uid()` or `WHERE class_id IN (SELECT ...)` pattern in a policy has a supporting index |
| F-08 | Supabase types regenerated | `npx supabase gen types typescript` has been run and `database.types.ts` is up to date |
| F-09 | No seed data on staging or production | Migration files contain no `INSERT` statements for test data |

---

### Category G — Performance

| # | Item | Notes |
|---|---|---|
| G-01 | List screens paginate | Any screen showing a list of records uses `.range(from, to)` with page size ≤ 20 |
| G-02 | No unbounded queries | No query fetches all rows from a table without a `WHERE`, `.limit()`, or `.range()` clause |
| G-03 | Attendance queries are date-scoped | Attendance queries include a `session_date` or `academic_year` filter — never load all historical attendance |
| G-04 | Realtime subscriptions are minimal | Only the tables listed in `04_ARCHITECTURE.md` Section 7.2 have realtime subscriptions. Any new subscription requires explicit justification. |
| G-05 | No N+1 query patterns | Lists do not fetch a parent record then loop to fetch children one-by-one. Use Supabase's nested select syntax instead: `.select('*, children(*)')` |

---

### Category H — Deployment

| # | Item | Notes |
|---|---|---|
| H-01 | Feature works on the staging deployment | Not just local — the built and deployed PWA on the staging Netlify site |
| H-02 | CI pipeline passes | TypeScript, lint, and tests all pass on the PR branch before merge |
| H-03 | No environment-specific code without a guard | Any code that differs between dev/staging/prod uses `process.env.EXPO_PUBLIC_ENV` — not hardcoded URLs or keys |
| H-04 | Magic link redirect URIs are registered | If a new environment is involved, its URL is added to Supabase Auth's allowed redirect URLs list |
| H-05 | Sentry environment tag is set correctly | Errors from staging do not appear as production errors in Sentry |

---

## 2. How to Apply It

### For every feature before merging to `staging`

Go through the checklist and mark each item:

- ✅ **Pass** — verified
- ⚠️ **N/A** — not applicable to this feature (brief reason required)
- ❌ **Fail** — not yet satisfied (merge is blocked)

A feature PR is not mergeable to `staging` while any item is ❌.

### Template for PR descriptions

Paste this into every PR description:

```
## Definition of Done

### A — Correctness
- [ ] A-01 Happy path verified on staging
- [ ] A-02 PRD acceptance criteria pass
- [ ] A-03 All relevant personas tested
- [ ] A-04 Multi-teacher classes handled (N/A if feature doesn't touch classes)
- [ ] A-05 Academic year stamped on new records (N/A if no new records)
- [ ] A-06 No .single() on class_teachers (N/A if no class queries)
- [ ] A-07 Compliance date uses lastSundayISO() (N/A if no date logic)

### B — Security
- [ ] B-01 Own data only (RLS test)
- [ ] B-02 Cross-user isolation (RLS test)
- [ ] B-03 Role escalation blocked (RLS test)
- [ ] B-04 Unauthenticated access returns empty/401
- [ ] B-05 Coordinator scope enforced (N/A if no coordinator writes)
- [ ] B-06 Coordinator write scope in WITH CHECK (N/A if no coordinator writes)
- [ ] B-07 No service role key in client
- [ ] B-08 No secrets in source code
- [ ] B-09 No raw SQL string construction
- [ ] B-10 Audience filtering enforced by RLS (N/A if no audience-targeted content)

### C — Error Handling
- [ ] C-01 Failed operations show user-visible error
- [ ] C-02 Failed operations reported to Sentry
- [ ] C-03 No PII in Sentry payloads
- [ ] C-04 Loading skeleton shown during fetch
- [ ] C-05 Empty state shown when no data
- [ ] C-06 Error state has retry action
- [ ] C-07 Unprovisioned email handled (N/A if not auth-related)

### D — Code Quality
- [ ] D-01 tsc --noEmit passes
- [ ] D-02 eslint passes with zero warnings
- [ ] D-03 No any types
- [ ] D-04 Generated types used for DB responses
- [ ] D-05 No business logic in screen files
- [ ] D-06 No Supabase calls in components
- [ ] D-07 No inline styles
- [ ] D-08 No hardcoded academic year strings
- [ ] D-09 No duplicated utility functions
- [ ] D-10 Realtime subscriptions cleaned up (N/A if no subscriptions)

### E — Testing
- [ ] E-01 Manual test for every affected persona
- [ ] E-02 Tested on iOS Safari PWA + Android Chrome PWA
- [ ] E-03 RLS smoke test run directly against API
- [ ] E-04 Adjacent features spot-checked

### F — Database
- [ ] F-01 Migration file exists (N/A if no schema change)
- [ ] F-02 Migration is idempotent (N/A if no schema change)
- [ ] F-03 Migration wrapped in transaction (N/A if no schema change)
- [ ] F-04 Migration applied to staging (N/A if no schema change)
- [ ] F-05 RLS enabled on new tables (N/A if no new tables)
- [ ] F-06 RLS policies match security doc (N/A if no new tables)
- [ ] F-07 Indexes added for new RLS patterns (N/A if no new policies)
- [ ] F-08 Supabase types regenerated (N/A if no schema change)
- [ ] F-09 No seed data in migration files

### G — Performance
- [ ] G-01 Lists paginate
- [ ] G-02 No unbounded queries
- [ ] G-03 Attendance queries are date-scoped (N/A if no attendance queries)
- [ ] G-04 No new realtime subscriptions without justification
- [ ] G-05 No N+1 query patterns

### H — Deployment
- [ ] H-01 Works on staging deployment
- [ ] H-02 CI pipeline passes
- [ ] H-03 No unguarded environment-specific code
- [ ] H-04 Magic link redirect URIs registered (N/A if no new environment)
- [ ] H-05 Sentry environment tag correct
```

---

## 3. Category Guidance

### When is a security test "done"?

B-01 through B-05 require testing the RLS boundary **directly against the Supabase API**, not just by using the app UI. The UI is not the access control layer. Use the Supabase client in a browser console or a test script:

```typescript
// Example: verify cross-user isolation for attendance
// Log in as parent.one@test.com (has children in Richardson)
const { data } = await supabase
  .from('attendance')
  .select('*')
  .eq('student_id', '[student-id-from-plano-center]')

// Expected: data is empty ([])
// Failure: data contains records → RLS gap
```

### When is the database category N/A?

Category F is N/A only when the feature makes zero changes to the database schema — no new tables, no new columns, no new indexes, no new policies, no new functions. If you added a single index, all of F-01 through F-09 apply.

### When is a Playwright test required? (E-05)

Phase 1: Playwright tests are not required but are encouraged for the three core flows (login, attendance submission, substitute lifecycle). Phase 2: any feature that is covered by the Playwright suite must have its test(s) passing before merge.

### What counts as a "silent failure"?

A silent failure is any code path where an error occurs and the user sees no change in the UI. Common forms:

```typescript
// Silent failure — PROHIBITED
const { data, error } = await supabase.from('table').select('*')
if (error) return   // ← user sees nothing

// Correct
const { data, error } = await supabase.from('table').select('*')
if (error) {
  setError(error.message)
  captureError(error, { screen: 'feed', action: 'loadAnnouncements' })
  return
}
```

---

## 4. Feature-Specific Additions

Some features have additional DoD items beyond the standard checklist. These are documented here and referenced in `06_DEVELOPMENT_SLICES.md` for the relevant slices.

### Magic Link Authentication

In addition to the standard checklist:
- [ ] Unprovisioned email flow tested: enter an email not in `profiles`, verify correct error message and sign-out
- [ ] Link expiry tested: use an expired link, verify clear error message
- [ ] Already-used link tested: use the same link twice, verify second use is rejected
- [ ] Redirect URL is environment-correct: staging magic links redirect to staging URL, not production

### Substitute Request Workflow *(Phase 2)*

In addition to the standard checklist:
- [ ] Full lifecycle tested end-to-end in a single session: absence → request → volunteer → assign → accept
- [ ] Decline + reassign path tested: assign → decline → reassign to different volunteer
- [ ] Coordinator cannot post a sub request for a class outside their session (RLS verified via API)
- [ ] Substitute cannot volunteer for a request that is already `confirmed`

### Announcements

In addition to the standard checklist:
- [ ] Coordinator cannot post with `center_id = NULL` via direct API call (not just UI check)
- [ ] Audience targeting verified for each role: post to "teachers only", verify parents and students cannot see it
- [ ] BV Coordinator can post org-wide (center_id = NULL) successfully

### Coordinator Compliance Dashboard

In addition to the standard checklist:
- [ ] Compliance date is the most recent Sunday (not today, not MAX from DB) — verified by checking behavior on a Monday (should show last Sunday's date)
- [ ] Compliance indicators are correct when: (a) both submitted, (b) only attendance submitted, (c) only update posted, (d) neither submitted
- [ ] Behavior is correct when no classes exist yet for the current academic year
- [ ] Compliance view does not change when seed records are deleted or added

### Comments on Class Updates

In addition to the standard checklist:
- [ ] Student cannot post a private comment (verify the Private toggle is absent from the UI and the RLS prevents a direct insert with `is_private = true`)
- [ ] Parent A cannot see Parent B's private comments on the same class update
- [ ] Teacher can delete any comment on their own class update
- [ ] Deleted comment shows "This comment was removed" placeholder (not a blank gap)

### Academic Year Management

In addition to the standard checklist:
- [ ] Opening a new academic year sets exactly one `is_current = true` (trigger verified)
- [ ] All inserts to stamped tables in the new year use the new year's label
- [ ] Data from the prior year is unaffected and readable via the year selector
- [ ] Attempt to insert a record for a closed year is rejected

---

*This document is referenced by `06_DEVELOPMENT_SLICES.md`, which attaches the applicable DoD categories to each development slice.*

*Next document: [06_DEVELOPMENT_SLICES.md](06_DEVELOPMENT_SLICES.md) — Ordered build plan with acceptance criteria and DoD categories attached to each slice.*

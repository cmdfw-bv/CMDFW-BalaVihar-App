# System — CSV enrollment import

> **owner:** System · **consumers:** Admin (uploader); all 6 personas indirectly (provisioned via import) · **scope:** org (Admin-only trigger; service-role server-side writes) · **governing ADR:** ADR-0003 (access-control-rls), ADR-0018 (family/household model), ADR-0022 (csv-import auth-provisioning boundary) · **covers:** doc 2 §2 (enrollment import), doc 3 §6 (Netlify Function csv-import.ts), doc 1 §3 (member-system CSV seam); resolves the "no minor self-registration" COPPA constraint (doc 3 §5.1)

**Stage:** `/refine` ✓ → `/architect` ✓ (ADR-0022) → `/design` ✓ → `/plan` ✓ → `/migration` ✓ → `/build` ✓ (35/35 unit tests, 81 pgTAP tests, 0 typecheck errors) → `/test` ✓ (97/97 RLS adversarial tests; gate marker written) → next is `/deploy-staging`.

---

## Requirements (refined)

### User story
As an Admin, I want to upload a canonical CSV file that provisions families, students, parent/guardian accounts, and class enrollments for a session so that all participants exist in the system before the program starts — without manual data entry or minor self-registration.

### Decisions captured during refine
- **Canonical template CSV (not raw member-system export).** The member system remains the source of record for enrollment data, but Admin controls the exact field mapping by filling in a template CSV we define. This avoids brittle coupling to the member system's export format and gives Admin a stable, version-controlled contract.
- **Session + grade_band lookup for class assignment.** The import resolves a class by `(session_name, grade_band)` rather than storing a class UUID in the CSV. This is human-readable and matches the one-class-per-grade-band-per-session pilot reality. If that constraint breaks (two sections of the same grade), a `class_name` override column can be added in a later iteration.
- **`external_member_id` as the student idempotency key.** `students.external_member_id` already exists in the schema; the import uses it as the natural re-import dedup key. Absent this value, dedup falls back to `(family_id, first_name, last_name)`.
- **Guardian email as the family idempotency key.** If a `family_members` row already exists for `guardian_1_email`, the import reuses that family record rather than creating a duplicate household.
- **HS-only student accounts.** Students in Gr9–Gr12 receive an auth user (`students.user_id`) provisioned via `auth.admin.createUser`. Shishu Vihaar through Gr8 students have no login — `students.user_id` remains null. `student_email` in the CSV is ignored (with a warning row in the response) for younger grades.

---

### Canonical CSV template

One row per student. Siblings share a `family_ref` value assigned by Admin.

| Column | Required | Notes |
|---|---|---|
| `family_ref` | ✓ | Admin-assigned string (e.g. `"F001"`) grouping siblings within this CSV. Not stored in DB; used only for intra-file family dedup. |
| `family_label` | ✓ | Household display name (e.g. `"Patel Family"`). Stored in `families.label`. |
| `guardian_1_first_name` | ✓ | Stored in auth user metadata. |
| `guardian_1_last_name` | ✓ | Stored in auth user metadata. |
| `guardian_1_email` | ✓ | Provisioned as an auth account (magic-link). Cross-import family dedup key. |
| `guardian_2_first_name` | — | Optional second guardian. |
| `guardian_2_last_name` | — | |
| `guardian_2_email` | — | If present, provisioned as a second auth account linked to the same family. |
| `student_first_name` | ✓ | Stored in `students.first_name`. |
| `student_last_name` | ✓ | Stored in `students.last_name`. |
| `student_external_id` | — | Stored in `students.external_member_id`. Primary idempotency key for re-imports. |
| `grade_band` | ✓ | One of: `Shishu Vihaar`, `Gr1`–`Gr12`. Drives class lookup and `students.grade_level`. |
| `session_name` | ✓ | Must match an existing `sessions.name` in the DB (e.g. `"F3"`). |
| `student_email` | — | Required for Gr9–Gr12 (auth account provisioned). Ignored with a warning for Gr1–Gr8 / Shishu Vihaar. |

---

### Acceptance criteria

1. **Endpoint.** `POST /api/csv-import` Netlify Function runs in a US-East region with the service-role key. Accepts `multipart/form-data` with a `file` field containing the CSV.
2. **Caller authentication.** The function decodes the caller's JWT (passed as `Authorization: Bearer <token>`), looks up `user_roles` with the service role, and rejects with `403` if the caller does not hold `role = 'admin'`. No trust in client-side claims alone.
3. **Validation pass (before any writes).** The function validates the full CSV before writing anything:
   - All required columns present in the header row.
   - `grade_band` value in the allowed set.
   - `guardian_1_email` (and `guardian_2_email`, `student_email` if present) are valid email format.
   - `session_name` resolves to an existing session in the DB.
   - `grade_band` × `session_name` resolves to exactly one class.
   - Returns `{ errors: [{ row, column, reason }] }` with status `422` and writes nothing if any row fails validation.
4. **Family upsert.** Grouped by `family_ref` within the CSV; cross-import dedup by `guardian_1_email` (if a `family_members` row already links this email to a family, reuse that `family_id` and update `families.label` if changed).
5. **Guardian provisioning.** For each non-empty guardian email: if no `auth.users` record exists, call `supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name, last_name } })`. If user exists, reuse the existing `user_id`. Upsert `family_members(family_id, user_id, relationship: 'guardian')`.
6. **Student upsert.** Dedup by `external_member_id` if present; else by `(family_id, first_name, last_name)`. Write `students.grade_level` from `grade_band`.
7. **Student auth account (HS only).** For `grade_band` in `{Gr9, Gr10, Gr11, Gr12}` and a non-empty `student_email`: provision auth user (same as guardian flow) and set `students.user_id`. For all other grades, leave `students.user_id = null`; if `student_email` is populated, include a warning in the response but do not error.
8. **Enrollment upsert.** For each student: look up class by `(session_name, grade_band)`, upsert `enrollments(student_id, class_id, session_id, status: 'active')`. The existing unique partial index `enrollments_one_active_per_session` enforces one active enrollment per student per session — the upsert must handle a conflict gracefully (already enrolled → no-op, not an error).
9. **All writes are transactional.** The entire import runs in a single Postgres transaction (via the service-role RPC path or a `supabase_rpc` call). A failure after partial writes rolls back all rows; the response includes the error details.
10. **Response.** `{ processed: N, skipped: N, warnings: [{ row, reason }], errors: [] }` on success (status `200`). Partial failure returns `{ processed: 0, errors: [...] }` (status `422`) after rollback.
11. **No PII in logs.** Error messages reference row numbers and column names; they do not echo email addresses or names into Netlify function logs.

---

### Edge cases

- **Guardian email already exists** — link to existing auth user, do not re-provision; continue.
- **Same student imported twice (re-import)** — `external_member_id` match → upsert, no duplicate; enrollment already active → no-op via conflict clause.
- **`student_email` present for grade below Gr9** — include in `warnings[]`, skip provisioning, continue.
- **`grade_band` × `session_name` returns zero classes** — validation error before writes.
- **`grade_band` × `session_name` returns more than one class** (future: two sections) — validation error; Admin must add a `class_name` override (deferred until needed).
- **Missing `guardian_1_email`** — row-level validation error (required field).
- **`guardian_2_email` present but `guardian_2_first_name`/`last_name` absent** — validation error (name required to provision an account meaningfully).
- **CSV with only a header row** — accepted; `{ processed: 0, skipped: 0, warnings: [], errors: [] }`.
- **Transaction rollback mid-import** — all auth user provisioning that already happened before the rollback must be cleaned up (call `auth.admin.deleteUser` for any users created in this run); response returns the error.

---

### Priority
**POC-core, thinnest-slice prerequisite.** No persona feature can be meaningfully tested or demoed until users are provisioned. Depends on `core-schema-and-rls` (built) and `auth-hook-and-identity` (not yet started — the auth hook is what activates real JWT claims; this import works without it, provisioning rows that the hook will later read).

### Consumers (cross-persona)
Admin (direct uploader). All other personas indirectly — every student, parent, and teacher account in the system arrives via this path or a later equivalent.

### Access scope
Caller must hold `role = 'admin'` in `user_roles` (org scope). Verified server-side by the Netlify Function against the service role. The service-role key is never in client code.

### Explicitly out of scope
- Teacher and coordinator provisioning (those accounts are assigned roles separately via the `user-role-approval` System item — this import handles families + students only).
- Member-system API sync (deferred post-POC; CSV baseline is the entire scope here).
- Bulk withdrawal / de-enrollment from a CSV (a separate admin operation if needed).
- Split-custody / joint-guardianship across two households (ADR-0018: explicitly deferred).
- Admin UI screen for triggering the upload (that is a feature of the Admin persona UoW; this item is the backend function only).

---

## Design (detailed spec)

> **Stage:** `/refine` ✓ → `/architect` ✓ (ADR-0022) → `/design` ✓ → next is `/plan`.
> **Design decisions captured this pass:**
> 1. **Silent provisioning** — `auth.admin.createUser({ email_confirm: true })`, no email sent at import time. Admin triggers onboarding separately.
> 2. **`families.primary_guardian_email_hash`** — SHA-256 (hex, lowercase) of `guardian_1_email` stored on `families` as a stable cross-import dedup key. Requires a migration. Avoids duplicate families when Phase 2 (auth) failed on a prior run and `family_members` rows don't exist yet.
> 3. **Partial unique index on `students(external_member_id)`** — `WHERE external_member_id IS NOT NULL`. Enables clean `ON CONFLICT` upsert. Requires a migration.
> 4. **`audit_log` not extended for import.** `audit_log.action` carries a `CHECK (action IN ('read','denied'))` constraint (ADR-0019 read-audit RPCs); bulk provisioning is a write event, not a read-access event. Extending the constraint to cover import events is deferred. A completed import emits one structured log line (no PII) via the Netlify function runtime as the POC audit trail.
> 5. **Two-level family dedup in Phase 2** — (i) hash lookup on `families.primary_guardian_email_hash`, (ii) fallback: any student in the `family_ref` group with a matching `external_member_id` → use that student's `family_id`. Covers all re-import states without needing more migrations.

---

### Behavior

#### Overview

`netlify/functions/csv-import.ts` — a POST endpoint that accepts a multipart CSV from an authenticated Admin and runs four phases:

```
Phase 0: Auth + role check         (reject fast — no DB writes)
Phase 1: Parse + validate CSV      (reject on any error — no DB writes)
Phase 2: DB transaction            (families · students · enrollments)
Phase 3: Auth provisioning         (post-commit — family_members · students.user_id)
```

The function returns on Phase 2 success even if Phase 3 has partial failures; `status: "partial"` signals that re-import will complete auth provisioning.

#### Phase 0 — Auth + role check

1. Extract the `Authorization: Bearer <token>` header; return `401` if absent or malformed.
2. Call `supabase.auth.getUser(token)` (Supabase validates the token); return `401` on error.
3. With the service-role client, query `SELECT 1 FROM user_roles WHERE user_id = $1 AND role = 'admin'`; return `403` if no row found.

#### Phase 1 — Parse + validate (no writes)

1. Parse the multipart body; extract the `file` field as UTF-8. Strip a leading BOM if present. Return `400` if `file` is missing or the body is not `multipart/form-data`.
2. Parse the CSV. Validate the header row: all 14 columns present (case-insensitive column name match). Return `422` immediately if header is malformed.
3. Validate each data row, collecting all errors before writing:
   - Required fields not empty.
   - `grade_band` ∈ `{Shishu Vihaar, Gr1, Gr2, Gr3, Gr4, Gr5, Gr6, Gr7, Gr8, Gr9, Gr10, Gr11, Gr12}`.
   - `guardian_1_email`, and `guardian_2_email` / `student_email` if present, are valid RFC 5322 email format.
   - `guardian_2_email` present without `guardian_2_first_name`/`guardian_2_last_name` → error.
   - Rows sharing a `family_ref` must have the same `guardian_1_email` (inconsistent guardian would create ambiguous dedup).
4. Bulk-resolve all distinct `session_name` values: `SELECT id, name FROM sessions WHERE name = ANY($1)`. Any unmatched `session_name` → error (row + column).
5. Bulk-resolve all `(session_id, grade_band)` pairs: `SELECT class_id, session_id, grade_band FROM classes WHERE session_id = ANY($1)`. Any pair resolving to 0 or 2+ classes → error.
6. If any errors collected: return `422` with full error list; write nothing.

#### Phase 2 — DB transaction

One `BEGIN … COMMIT` covering all rows. Rolls back entirely on any Postgres error.

**Family upsert** (per `family_ref` group, processed in CSV order):

```sql
-- primary_guardian_email_hash = SHA-256(toLowerCase(guardian_1_email)), hex string
INSERT INTO families (label, primary_guardian_email_hash)
VALUES ($label, $hash)
ON CONFLICT (primary_guardian_email_hash)
  DO UPDATE SET label = EXCLUDED.label
RETURNING id
```

**Student upsert** (per student row):

*With `external_member_id`:*
```sql
INSERT INTO students (family_id, first_name, last_name, grade_level, external_member_id)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (external_member_id) WHERE external_member_id IS NOT NULL
  DO UPDATE SET
    grade_level       = EXCLUDED.grade_level,
    last_name         = EXCLUDED.last_name,
    family_id         = EXCLUDED.family_id
RETURNING id
```

*Without `external_member_id`* (SELECT-then-INSERT):
```sql
-- 1. Try to find existing student
SELECT id FROM students
WHERE family_id = $family_id
  AND first_name = $first_name
  AND last_name  = $last_name
LIMIT 1;
-- 2. If found: UPDATE grade_level; if not found: INSERT
```

**Enrollment upsert** (per student):
```sql
INSERT INTO enrollments (student_id, class_id, session_id, status)
VALUES ($1, $2, $3, 'active')
ON CONFLICT (student_id, session_id) WHERE status = 'active'
  DO NOTHING
```

`students.user_id` and all `family_members` rows are **not written in Phase 2**. They are populated in Phase 3 after commit.

#### Phase 3 — Auth provisioning + linking (post-commit)

Iterate over the same resolved row list. For each guardian email and each HS student email, the function:

1. Calls `supabase.auth.admin.getUserByEmail(email)`.
   - If the user exists: use the returned `id`.
   - If not found: calls `supabase.auth.admin.createUser({ email, email_confirm: true, user_metadata: { first_name, last_name } })` → use the new `id`.
   - On any API error: append `{ row, column, reason }` to `auth_pending`; continue.
2. On success, links the account:
   - Guardians: `INSERT INTO family_members (family_id, user_id, relationship) VALUES ($1, $2, 'guardian') ON CONFLICT DO NOTHING`
   - HS students: `UPDATE students SET user_id = $user_id WHERE id = $student_id AND user_id IS NULL`

After iterating all rows:
- `auth_pending` empty → emit one structured log line (no PII: `{ event: "csv_import_complete", session, processed_count, admin_user_id }`) and return `200`.
- `auth_pending` non-empty → return `207` with the pending list; re-import resolves them.

---

### Data & RLS impact

#### Migrations required (two additions to existing schema)

```sql
-- 1. Family dedup key
ALTER TABLE families
  ADD COLUMN primary_guardian_email_hash text;

CREATE UNIQUE INDEX families_primary_guardian_email_hash_idx
  ON families (primary_guardian_email_hash)
  WHERE primary_guardian_email_hash IS NOT NULL;

-- 2. Student idempotency key
CREATE UNIQUE INDEX students_external_member_id_idx
  ON students (external_member_id)
  WHERE external_member_id IS NOT NULL;
```

#### Tables written (all via service-role — RLS bypassed intentionally)

| Table | Operation | Upsert key |
|---|---|---|
| `families` | INSERT … ON CONFLICT DO UPDATE | `primary_guardian_email_hash` |
| `students` | INSERT … ON CONFLICT DO UPDATE (or SELECT + INSERT) | `external_member_id` (partial) or `(family_id, first_name, last_name)` |
| `enrollments` | INSERT … ON CONFLICT DO NOTHING | partial unique index `(student_id, session_id) WHERE status='active'` |
| `family_members` | INSERT … ON CONFLICT DO NOTHING | `(family_id, user_id)` unique constraint |
| `students.user_id` | UPDATE WHERE user_id IS NULL | — (safe: never overwrites an existing link) |
| `auth.users` | `auth.admin.createUser` (Supabase Auth API, outside Postgres txn) | email (getUserByEmail before create) |

#### Tables read (service-role)

`sessions`, `classes` (bulk resolve in Phase 1); `user_roles` (admin check in Phase 0); `families` (hash lookup in Phase 2); `students` (select-then-insert path); `family_members` + `auth.users` (getUserByEmail call).

#### No RLS policy changes

The function holds the service-role key and bypasses RLS for all writes. No client-visible access pattern changes. No existing RLS policies are modified.

#### audit_log

Not written by this function (see design decision #4 above). A structured log line (no PII) from the Netlify runtime is the POC audit trail for completed imports.

---

### API contract

**Request**
```
POST /api/csv-import
Authorization: Bearer <supabase-session-token>
Content-Type: multipart/form-data

file: <CSV file, UTF-8, ≤ 1 MB>
```

**Response body (all statuses)**
```typescript
{
  status:        "complete" | "partial" | "failed";
  processed:     number;   // students written to DB
  skipped:       number;   // rows already up-to-date (no-op upserts)
  db_committed:  boolean;
  auth_pending:  Array<{ row: number; column: string; reason: string }>;
  warnings:      Array<{ row: number; reason: string }>;
  errors:        Array<{ row: number; column: string; reason: string }>;
}
```

No PII (email addresses, names) appears in `auth_pending`, `warnings`, or `errors` — row number + column name only.

**HTTP status codes**

| Code | Meaning |
|---|---|
| `200` | Complete — all rows written, all auth accounts provisioned |
| `207` | Partial — DB committed, some auth provisioning failed; re-import to complete |
| `400` | Bad request — not multipart, missing `file` field, or CSV header malformed |
| `401` | Missing / invalid JWT |
| `403` | Caller does not hold `admin` role |
| `422` | Validation failure — per-row errors returned, nothing written |
| `500` | Unexpected server error |

---

### Template CSV

**Location in repo:** `public/enrollment-template.csv`

Committed to `public/` so it is served as a static file at `/enrollment-template.csv` on both the local dev server (`http://localhost:8888`) and the Netlify deployment. Admin downloads it, fills it in, and uploads via the Admin UI.

**Column order and example rows:**

```csv
family_ref,family_label,guardian_1_first_name,guardian_1_last_name,guardian_1_email,guardian_2_first_name,guardian_2_last_name,guardian_2_email,student_first_name,student_last_name,student_external_id,grade_band,session_name,student_email
F001,Patel Family,Priya,Patel,priya.patel@example.test,Raj,Patel,raj.patel@example.test,Arjun,Patel,EXT-101,Gr5,F3,
F001,Patel Family,Priya,Patel,priya.patel@example.test,Raj,Patel,raj.patel@example.test,Meera,Patel,EXT-102,Gr8,F3,
F002,Kumar Family,Anita,Kumar,anita.kumar@example.test,,,Rohan,Kumar,EXT-103,Gr10,F3,rohan.kumar@example.test
F003,Singh Family,Deepa,Singh,deepa.singh@example.test,,,Isha,Singh,EXT-104,Shishu Vihaar,F3,
```

All example emails use `.test` domains — they are clearly synthetic and will never resolve.

---

### Edge cases (design detail)

| Scenario | Handling |
|---|---|
| Re-import after full success | All upserts → no-ops; auth users reused; `skipped` count increments |
| Re-import after Phase 2 committed but Phase 3 partially failed | Hash lookup finds existing family; student external_member_id upsert → no-op; auth provisioning resumes for `auth_pending` rows |
| Re-import after Phase 1 committed but no external_member_ids | Hash lookup finds family; SELECT-then-INSERT for students → finds existing rows by `(family_id, first_name, last_name)` → no duplicate |
| Rows with same `family_ref`, different `guardian_1_email` | Phase 1 validation error before any writes |
| CSV with UTF-8 BOM (`﻿`) | Stripped before parsing |
| `student_email` present for Gr1–Gr8 / Shishu Vihaar | Added to `warnings[]`, provisioning skipped, import continues |
| Guardian email already in `auth.users` from a prior session | `getUserByEmail` returns the user; reuse without re-creating |
| `auth.admin.createUser` returns rate-limit or timeout | Append to `auth_pending`; DB rows stay committed; re-import recovers |
| File exceeds 1 MB | `400` with `reason: "file too large (max 1 MB)"` |
| Empty CSV (header only) | `200 { status: "complete", processed: 0, skipped: 0 }` |

---

### UI

**N/A for this item.** This spec covers the Netlify Function backend only. The Admin persona UoW will build the upload screen. That screen needs to:
- POST to `/api/csv-import` with `multipart/form-data` and the user's session token.
- Handle `200` (show success summary), `207` (show partial warning with `auth_pending` list and a "re-import to finish" prompt), and `422` (show per-row error table).
- Provide a link to `/enrollment-template.csv` for template download.

---

### Out of scope (confirmed)
- Teacher/coordinator account provisioning (handled by `user-role-approval` System item).
- Member-system API sync (CSV baseline only for POC).
- Bulk withdrawal/de-enrollment via CSV.
- Split-custody / joint-guardianship (ADR-0018 explicitly deferred).
- Admin UI upload screen (Admin persona UoW).
- Progress streaming (response returned at end of full run).
- Rate limiting beyond Netlify platform defaults.

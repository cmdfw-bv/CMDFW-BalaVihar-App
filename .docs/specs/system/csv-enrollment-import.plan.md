# Plan — System: csv-enrollment-import

> Spec: [csv-enrollment-import.md](csv-enrollment-import.md) · ADR-0022 · stage: `/plan` ✓ → next `/migration` then `/build`

## Shared seam

The two schema migrations are the **serialized gate**: every other team member's feature code can build against the already-landed `core-schema-and-rls` schema, but the function cannot be locally tested until `npm run db:reset` applies the additions below. Once those migrations land on `main`, parallel app work is unblocked.

**Branch:** `system/csv-enrollment-import` (or a git worktree off `main`)

---

## Task list (ordered — TDD throughout)

### Stage 1 — Migration (serialized)

- [x] **M1 — pgTAP schema tests (RED)** `supabase/tests/080_csv_import_schema.sql`
  - `has_column('families', 'primary_guardian_email_hash', 'families has guardian hash column')`
  - `col_is_null('families', 'primary_guardian_email_hash', 'hash column is nullable')`
  - Insert two families with the same non-null hash → expect unique-violation error (negative test via `lives_ok` + `throws_ok`)
  - Insert two families with `NULL` hash → expect both succeed (NULLs don't conflict)
  - Insert two students with the same non-null `external_member_id` → expect unique violation
  - Insert two students with `NULL` `external_member_id` → expect both succeed
  - Confirm suite count matches plan before running migration (all tests fail / schema columns absent = RED ✓)

- [x] **M2 — Migration file** `supabase/migrations/<timestamp>_csv_import_schema_additions.sql`
  ```sql
  alter table families
    add column primary_guardian_email_hash text;

  create unique index families_primary_guardian_email_hash_idx
    on families (primary_guardian_email_hash)
    where primary_guardian_email_hash is not null;

  create unique index students_external_member_id_idx
    on students (external_member_id)
    where external_member_id is not null;
  ```

- [x] **M3 — Green** `npm run db:reset` → confirm 080 suite passes; full suite (000–100) stays green

---

### Stage 2 — Unit test framework

- [x] **F0 — Add Vitest**
  - `npm install --save-dev vitest`
  - Create `vitest.config.ts`:
    ```typescript
    import { defineConfig } from 'vitest/config';
    export default defineConfig({
      test: { environment: 'node', include: ['netlify/functions/__tests__/**/*.test.ts'] }
    });
    ```
  - Update `package.json` `"test"` script: `"vitest run"` (replaces the echo no-op)

---

### Stage 3 — Pure helpers (TDD)

- [x] **F1 — Hash tests (RED)** `netlify/functions/__tests__/hash.test.ts`
  - SHA-256 of `'test@example.com'` equals known hex value
  - Input is lowercased before hashing (`'Test@Example.Com'` == `'test@example.com'` hash)
  - Empty string input returns stable hex (doesn't throw)

- [x] **F2 — Hash implementation** `netlify/functions/lib/hash.ts`
  - `guardianEmailHash(email: string): string` — `crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')`
  - Run F1 → GREEN ✓

- [x] **F3 — CSV parse/validate tests (RED)** `netlify/functions/__tests__/csv-parse.test.ts`
  - Valid 4-row CSV → returns `{ rows: ParsedRow[], warnings: [], errors: [] }`
  - Missing required column in header → error `{ row: 0, column: 'grade_band', reason: '...' }`
  - Unknown `grade_band` value → per-row error
  - `guardian_1_email` invalid format → per-row error
  - `guardian_2_email` present, `guardian_2_first_name` absent → per-row error
  - Rows with same `family_ref` but different `guardian_1_email` → per-row error
  - `student_email` present for `'Gr3'` → no error, but warning added
  - UTF-8 BOM (`﻿`) prefix stripped before parsing
  - Header column matching is case-insensitive
  - Empty CSV (header only) → `{ rows: [], warnings: [], errors: [] }`

- [x] **F4 — CSV parse implementation** `netlify/functions/lib/csv-parse.ts`
  - `parseCsv(raw: string): CsvParseResult` — pure function, no I/O
  - Uses Node.js built-in string splitting (no external CSV library — keeps the bundle lean and avoids new deps in `netlify/functions/`)
  - Exports `ParsedRow`, `CsvError`, `CsvWarning`, `CsvParseResult` TypeScript types
  - Run F3 → GREEN ✓

---

### Stage 4 — DB ops helper (TDD, injected client)

- [x] **F5 — DB ops tests (RED)** `netlify/functions/__tests__/db-ops.test.ts`
  - Uses `vi.fn()` stubs for the Supabase client methods; does NOT hit a real DB
  - `resolveSessionsAndClasses(client, sessionNames, gradeBandPairs)` → maps to session/class ids; rejects unknown session name
  - `checkAdminRole(client, userId)` → returns true when `user_roles` stub returns a row; false otherwise
  - `upsertFamily(client, label, hash)` → calls insert with correct ON CONFLICT shape; returns id
  - `upsertStudent(client, params)` → with `external_member_id`: uses ON CONFLICT path; without: uses SELECT-then-INSERT path
  - `upsertEnrollment(client, params)` → calls insert with ON CONFLICT DO NOTHING
  - `linkGuardian(client, familyId, userId)` → inserts into `family_members` ON CONFLICT DO NOTHING
  - `linkStudentUser(client, studentId, userId)` → updates `students.user_id` WHERE `user_id IS NULL`

- [x] **F6 — DB ops implementation** `netlify/functions/lib/db-ops.ts`
  - All functions accept a `SupabaseClient` (service-role) as their first parameter — no module-level client instantiation
  - Run F5 → GREEN ✓

---

### Stage 5 — Main function handler

- [x] **F7 — Handler tests (RED)** `netlify/functions/__tests__/csv-import.test.ts`
  - `Authorization` header absent → `{ statusCode: 401 }`
  - `supabase.auth.getUser` returns error → `{ statusCode: 401 }`
  - Admin role check fails → `{ statusCode: 403 }`
  - Body not multipart → `{ statusCode: 400 }`
  - CSV with validation errors → `{ statusCode: 422, body: { errors: [...] } }`
  - Valid CSV, DB commits, auth provisioning succeeds → `{ statusCode: 200, body: { status: 'complete' } }`
  - Valid CSV, DB commits, one auth call fails → `{ statusCode: 207, body: { status: 'partial', auth_pending: [...] } }`
  - File > 1 MB → `{ statusCode: 400, body: { reason: 'file too large...' } }`
  - (All via vi.mock of helpers and supabase client — no real DB calls in handler tests)

- [x] **F8 — Main handler** `netlify/functions/csv-import.ts`
  - Wires Phase 0–3 using the helpers from lib/
  - Creates service-role client from `process.env.SUPABASE_SERVICE_ROLE_KEY` + `EXPO_PUBLIC_SUPABASE_URL`
  - Response body matches `ImportResponse` type (no PII in errors/warnings/auth_pending)
  - Run F7 → GREEN ✓

- [x] **F9 — netlify.toml annotation**
  - Add `[functions.csv-import]` comment block (region note, mirrors `[functions.health]`)

---

### Stage 6 — Typecheck + local smoke

- [x] **F10 — Typecheck** `npm run typecheck` → zero errors
- [x] **F11 — Local smoke** (prerequisite: Docker + `npm run dev` running)
  - POST `public/enrollment-template.csv` to `http://localhost:8888/api/csv-import` with an admin session token
  - Expect `200 { status: "complete", processed: 2 }` (template has 2 unique students after dedup)
  - Re-POST the same file → expect `200 { status: "complete", skipped: 2, processed: 0 }` (full idempotency)

---

## Files created / modified

| File | Action |
|---|---|
| `supabase/tests/080_csv_import_schema.sql` | **new** — pgTAP schema tests |
| `supabase/migrations/<ts>_csv_import_schema_additions.sql` | **new** — hash column + two unique indexes |
| `vitest.config.ts` | **new** — Vitest config (Node env, functions test path) |
| `netlify/functions/lib/hash.ts` | **new** — `guardianEmailHash()` |
| `netlify/functions/lib/csv-parse.ts` | **new** — `parseCsv()` + types |
| `netlify/functions/lib/db-ops.ts` | **new** — DB helper functions (injectable client) |
| `netlify/functions/csv-import.ts` | **new** — main handler |
| `netlify/functions/__tests__/hash.test.ts` | **new** |
| `netlify/functions/__tests__/csv-parse.test.ts` | **new** |
| `netlify/functions/__tests__/db-ops.test.ts` | **new** |
| `netlify/functions/__tests__/csv-import.test.ts` | **new** |
| `public/enrollment-template.csv` | already committed (created in `/design`) |
| `package.json` | **modify** — add `vitest` dep, update `test` script |
| `netlify.toml` | **modify** — add `[functions.csv-import]` comment |

---

## Architectural flags

None. No bounces to `/architect`. The design is complete and the spec is self-contained.

## Hand-off sequence

`/migration` → applies M1–M3 (pgTAP tests RED → migration → GREEN).
`/build` → implements F0–F11 in the TDD order above.

---

## Design addendum plan — Stage 7: skip-dates CSV seam (ADR-0031, 2026-07-24)

**Extends** `csv-enrollment-import.md`'s "Design addendum — ADR-0031 (session skip-dates CSV seam)". **Depends on** `core-schema-and-rls.plan.md` Task 12 (`class_meetings` table + `generate_class_meetings_for_session`) — the `UPDATE ... class_meetings` this stage writes has nothing to target until that migration lands. Not a dependency of the Coordinator compliance-dashboard screen itself (`compliance-dashboard.plan.md`) — that screen reads regardless of whether any skip dates have been applied yet.

**Decision resolved at this `/plan` pass** (left open by the spec addendum): **same endpoint, second CSV shape** — `POST /api/csv-import` distinguishes the skip-dates shape from the enrollment shape by header row (`session_id,skip_date`, 2 columns) before running either parser. Chosen over a new route/function because the two shapes share Phase 0 (admin auth check) verbatim, and Netlify Functions are already a peritem-file boundary — a second function would duplicate the entire auth-check block for no isolation benefit the spec asks for.

- [ ] **F12 — Skip-dates types + parser (RED → GREEN)** `netlify/functions/lib/skip-dates.ts`, test-first in `netlify/functions/__tests__/skip-dates.test.ts`
  ```typescript
  export interface SkipDateRow { session_id: string; skip_date: string }
  export interface SkipDateError { row: number; column: string; reason: string }
  export interface SkipDateParseResult { rows: SkipDateRow[]; errors: SkipDateError[] }

  export function isSkipDatesCsv(csvText: string): boolean; // true iff header row is exactly session_id,skip_date (case-insensitive)
  export function parseSkipDatesCsv(csvText: string): SkipDateParseResult; // validates session_id is a UUID shape, skip_date is YYYY-MM-DD
  ```
  Tests: header detection (positive/negative incl. the 14-column enrollment header returning `false`); malformed UUID → row error; malformed date → row error; empty-body (header only) → `{ rows: [], errors: [] }`.

- [ ] **F13 — Skip-dates DB op (RED → GREEN)** add to `netlify/functions/lib/db-ops.ts`
  ```typescript
  export async function applySkipDate(
    client: SupabaseClient,
    sessionId: string,
    skipDate: string
  ): Promise<{ cancelled: number }> {
    const { data: classIds } = await client.from('classes').select('id').eq('session_id', sessionId);
    if (!classIds?.length) return { cancelled: 0 };
    const { error, count } = await client
      .from('class_meetings')
      .update({ status: 'cancelled' })
      .in('class_id', classIds.map(c => c.id))
      .eq('meeting_date', skipDate)
      .select('id', { count: 'exact' });
    if (error) throw error;
    return { cancelled: count ?? 0 };
  }
  ```
  Test: mocked client — matching rows get `status: 'cancelled'`; a `skip_date` with no matching `class_meetings` row (ordering-dependency edge case — `generate_class_meetings_for_session` hasn't run yet for that session) returns `{ cancelled: 0 }`, not an error.

- [ ] **F14 — Wire into the handler** `netlify/functions/csv-import.ts`
  - Immediately after Phase 0 (admin check) and body/multipart extraction (both shapes share these), branch: `if (isSkipDatesCsv(csvText)) { ...skip-dates path... } else { ...existing enrollment path (unchanged, F1–F9)... }`.
  - Skip-dates path: `parseSkipDatesCsv` → on any row error, `422 { errors }` (no writes, matching the enrollment path's own validate-before-write posture); else call `applySkipDate` per row (no transaction needed — each row is an independent, idempotent `UPDATE`, unlike the enrollment path's multi-table Phase 2) and return `200 { status: 'complete', processed: <rows.length>, cancelled: <sum of applySkipDate results>, errors: [], warnings: [] }`.
  - No `auth_pending`/Phase 3 concept for this shape (no auth provisioning involved) — response type gets a narrower `SkipDatesResponse` variant, not squeezed into the existing `ImportResponse` shape.

- [ ] **F15 — Handler tests** extend `netlify/functions/__tests__/csv-import.test.ts`
  - Skip-dates CSV, valid rows → `200`, `cancelled` count matches mocked `applySkipDate` calls.
  - Skip-dates CSV, malformed `session_id` → `422` with row/column error, zero `applySkipDate` calls (proves validate-before-write holds for this shape too).
  - Non-admin caller with a skip-dates CSV → `403` (Phase 0 shared, no bypass via the second shape).
  - Existing enrollment-CSV tests (F5–F9's assertions) still pass unchanged — confirms the header-shape branch doesn't disturb the original path.

- [ ] **F16 — Typecheck + local smoke**
  - `npm run typecheck` → zero errors.
  - Local smoke (prerequisite: `core-schema-and-rls` Task 12 + Task 14 applied, so `class_meetings` exists and is populated for the seed's `F3` session): POST a small `session_id,skip_date` CSV naming one of the seed's already-generated Tuesday dates → expect `200`, and confirm via `psql`/Studio that the targeted `class_meetings` rows flipped to `cancelled`.

---

### Files created / modified (Stage 7 addendum)

| File | Action |
|---|---|
| `netlify/functions/lib/skip-dates.ts` | **new** — `isSkipDatesCsv`, `parseSkipDatesCsv` |
| `netlify/functions/lib/db-ops.ts` | **modify** — add `applySkipDate` |
| `netlify/functions/csv-import.ts` | **modify** — header-shape branch |
| `netlify/functions/__tests__/skip-dates.test.ts` | **new** |
| `netlify/functions/__tests__/csv-import.test.ts` | **modify** — add skip-dates cases |

### Architectural flags (Stage 7)
None — ADR-0031 already settled the mechanism (CSV seam, additive to this already-built function); the same-endpoint-vs-new-route choice above is delivery detail, not a new access pattern (same trust boundary, same admin check, no new residency/PII surface — the spec's own addendum already noted skip dates carry no PII).

## Sign-off — Stage 7
- [x] **Human sign-off on Stage 7** (2026-07-24, mehta.maulik@gmail.com) → ready for `/build` (F12–F16), independent of and non-blocking for the Coordinator compliance-dashboard screen.
`/test` → full integration suite: POST real CSVs against the running local stack; adversarial tests (missing token, non-admin caller, corrupt CSV, re-import idempotency, partial-auth-failure recovery).

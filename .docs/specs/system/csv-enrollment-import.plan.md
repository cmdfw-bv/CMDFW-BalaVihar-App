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
`/test` → full integration suite: POST real CSVs against the running local stack; adversarial tests (missing token, non-admin caller, corrupt CSV, re-import idempotency, partial-auth-failure recovery).

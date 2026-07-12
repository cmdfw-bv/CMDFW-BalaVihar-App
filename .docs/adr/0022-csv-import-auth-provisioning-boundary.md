# ADR-0022: CSV import — auth provisioning after DB commit (DB-first boundary)

**Status:** Closed · **Date:** 2026-07-11 · **Deciders:** Project owner + architect
**Governs:** System → `csv-enrollment-import` (`.docs/specs/system/csv-enrollment-import.md`).

### Context

The CSV enrollment import function must both write Postgres rows (families, students, enrollments) and provision Supabase Auth accounts (guardians, HS students) via `auth.admin.createUser`. These are two different transactional domains: Postgres writes can be rolled back atomically; Auth API calls cannot — they are external HTTP calls that are not part of any Postgres transaction. If the two domains are interleaved, a Postgres rollback leaves behind orphaned `auth.users` records that have no corresponding `family_members` row. These orphaned users cannot log in, but they occupy the email address in `auth.users`, causing a confusing "user already exists" response on re-import.

### Options Considered

- **Option A — Auth-first, delete orphans on rollback.** Provision all auth users before opening the DB transaction. On DB failure, call `auth.admin.deleteUser` for each user provisioned in this run. Pros: single linear pass through the CSV. Cons: cleanup is best-effort — a transient error during cleanup silently leaves orphaned auth accounts that break re-import ("user exists" branch fires when it should not).

- **Option B — DB-first, auth after commit (chosen).** Open a Postgres transaction, write all family/student/enrollment rows (initially with `students.user_id = null`, no `family_members` rows yet), commit. Then provision auth users sequentially and link them by updating `students.user_id` and inserting `family_members` rows. If auth provisioning fails partway, the DB rows exist with some users unlinked — a re-import is safe (DB rows upsert as no-ops; auth provisioning resumes for the failed subset). Pros: no orphaned auth users possible; failure mode is recoverable by re-import with no manual cleanup; consistent with the existing idempotency guarantee. Cons: a partially-complete import leaves some guardians/HS students without accounts until re-import; the function response must clearly indicate which accounts were not yet provisioned.

- **Option C — Two explicit phases (separate calls).** Phase 1 writes DB rows and returns. Phase 2 (a separate endpoint or queue step) provisions auth accounts. Pros: cleanest failure isolation; phase 2 is independently retryable. Cons: requires a second surface and UI trigger; over-engineered for a POC with ~100 students per session.

### Decision

Use **Option B — DB-first, auth after commit.** The Postgres transaction commits all structural rows first. Auth provisioning runs after, sequentially, as a best-effort step within the same function invocation. The response always distinguishes DB-committed rows from auth-provisioned rows, so Admin knows if a re-import is needed to complete account linking.

The function tracks which auth accounts were successfully created in the current invocation. On a re-import (same CSV or corrected CSV), already-provisioned auth users are recognized by email and reused (no duplicate provisioning); already-linked rows (`family_members`, `students.user_id`) are upserted as no-ops. This makes re-import the recovery path for any partial auth failure, with no manual cleanup required.

### Consequences

- **Implementation:** The Netlify Function has two sequential phases in one invocation: (1) a Postgres transaction covering family/student/enrollment writes, (2) a post-commit loop provisioning auth accounts and updating the linking rows.
- **Response shape:** The response must include a `auth_pending` list (rows where DB write succeeded but auth provisioning was not completed) so Admin can act on it without guessing.
- **Re-import safety:** The existing idempotency guarantee (AC #6 in the spec) now also covers auth provisioning — re-importing with the same rows completes any pending account creation without side effects.
- **No auth cleanup logic needed:** The function never needs to call `auth.admin.deleteUser` as a rollback mechanism. The only case where a user should be deleted is an explicit Admin action (out of scope for this item).
- **Audit log:** `audit_log` is not extended for import — `audit_log.action`'s `CHECK (action IN ('read','denied'))` constraint (ADR-0019) is unchanged, since a bulk-provisioning write isn't the minor-record-read event that table exists to cover (see design decision #4 in the spec). A completed import instead emits one PII-free structured log line (`{ event: "csv_import_complete", session, processed_count, admin_user_id }`) from the Netlify runtime, as shipped in `netlify/functions/csv-import.ts`. *(Corrected 2026-07-11 — this bullet previously and incorrectly described an `audit_log` row insert that was never implemented and would have violated the CHECK constraint; the structured-log-line approach was the actual decision all along and is now the explicit precedent [ADR-0024](0024-user-role-approval-tiering-and-audit.md) cites for the same gap in `user-role-approval`.)*

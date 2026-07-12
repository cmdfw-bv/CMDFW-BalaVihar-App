# ADR-0026: user-role-approval — tiered privilege-escalation guard; grant/revoke audited via structured log, not `audit_log`

**Status:** Closed · **Date:** 2026-07-11 · **Deciders:** Project owner + architect
**Governs:** System → `user-role-approval` (`.docs/specs/system/user-role-approval.md`). Resolves `core-schema-and-rls`'s deferred write path (line 164: `user_roles` shipped with zero client write grants, naming this item as "the later function" that safely writes to it) and the brief's explicitly flagged open question ("`audit_log` schema changes... an open question for `/architect`").

### Context

`user_roles` is the single table the Postgres Custom Access Token Hook (ADR-0004, `auth-hook-and-identity`) reads to stamp `active_role`/`scope_type`/`scope_id` into every JWT — it is the table that decides access everywhere else in the system. `core-schema-and-rls` deliberately shipped it with **zero client-writable RLS policies**, locking it down correctly while explicitly naming this item as the only sanctioned future write path (a privileged, service-role Netlify function — same trust tier as the auth hook itself).

This item is that write path, in two parts: (A) a mechanical auto-activation sweep granting `parent`/`student` rows for accounts `csv-enrollment-import` already provisioned but never granted access to, and (B) a manual grant/revoke path for `teacher`/`coordinator`/`bv_coordinator`/`admin` roles, gated by a tiering rule (Admin > BV Coordinator > Coordinator) so no caller can grant or revoke a role at or above their own tier — including targeting themselves. Since this is the *first* write path of any kind to `user_roles`, and it directly controls who can subsequently access every other RLS-gated table including minors' records, the write path and its escalation guard are architecturally significant and warrant explicit sign-off, even though `/refine` already worked out the tiering table itself (§ "Grant tiering" in the spec) and no competing design was in play there — the persona role hierarchy it encodes is the same one already fixed by ADR-0004/`persona-scope`, not a new hierarchy invented here.

The one live open question was whether grant/revoke events get a persisted, queryable audit trail. `audit_log.action` currently has `CHECK (action IN ('read','denied'))` (`20260709040853_audit_log_and_staff_rpcs.sql`), and per ADR-0019 `audit_log`'s scope is deliberately narrow: an append-only record of *reads of a minor's record*, with RLS policies (`audit_log_coordinator_read` etc.) keyed off `target_student_id`/`enrollments` — not a general security-events log. `csv-enrollment-import` hit the identical gap for its own bulk-write event and resolved it (design decision #4 in that spec) with a structured, PII-free log line instead of extending `audit_log` — that precedent was never elevated to its own ADR.

### Options Considered

- **Option A — Extend `audit_log`'s CHECK constraint** to allow `'grant'`/`'revoke'`. Pros: one unified security-events surface, in-app queryable by Admin/BV Coordinator. Cons: `audit_log`'s existing RLS policies are built around `target_student_id`/session-enrollment checks for minors'-record reads (ADR-0019) — a `user_roles` grant/revoke row doesn't fit that shape and would need new, parallel RLS policies just for this action type, diluting ADR-0019's precise "audit_log = minor-record-read" scope for a POC-stage add.
- **Option B — Structured log line only (chosen).** Emit a PII-free structured log line from the Netlify function runtime (row/entity identifiers only, no raw emails/names — matching AC#8 and the `csv-enrollment-import` precedent exactly). Pros: consistent with the only existing precedent for this exact gap; zero new schema/RLS surface; appropriate for a POC maintained by three non-technical volunteers. Cons: not queryable in-app; no persisted, browsable "who granted what, when" table.
- **Option C — New dedicated `role_grants_log` table**, append-only (actor, target, role, scope, action, timestamp), separate from `audit_log`. Pros: a real persisted, queryable trail for the highest-stakes security event in the system (privilege grants) without stretching `audit_log`'s established semantics. Cons: new migration + new RLS policies for a POC; can be added later as a follow-up ADR (mirroring ADR-0019's own noted "residual risk" pattern) if legal/audit needs it — not assumed now.

### Decision

**Option B.** Grant/revoke actions are **not** written to `audit_log`. Each manual grant/revoke and each auto-activation-sweep grant emits one structured, PII-free log line from the Netlify function runtime (entity identifiers — `user_roles.id`, role, scope — not raw email/name), per AC#8. `audit_log`'s CHECK constraint and RLS policies are unchanged; its scope remains exactly what ADR-0019 defined (minors'-record reads), not a general security-events log.

Separately, the tiering/self-escalation design already specified in the refined brief is **sanctioned as-is** as the governing access-control shape for this item's manual grant/revoke path:
- No caller may grant or revoke a role at or above their own tier (Admin: any role, org-wide; BV Coordinator: student/parent/teacher/coordinator, org-wide; Coordinator: student/parent/teacher, own session only).
- The check applies uniformly regardless of target, including `target_user_id = caller` — there is no self-grant/self-revoke bypass.
- Both the sweep and the manual path run as privileged Netlify Functions using the service-role key (never a client-side RLS write path), enforced by decoding the caller's JWT and re-checking their own `user_roles` row(s) server-side — mirroring `csv-enrollment-import` Phase 0's existing trust-tier pattern, not inventing a new one.

### Consequences

- `/design` for `user-role-approval` specifies exact function signatures, request/response shapes, and the structured log line's field set (event name, actor role/tier, target role/scope, action) for both the sweep and the manual grant/revoke path.
- The adversarial pgTAP/integration suite for this item (pre-`/promote`, per constitution non-negotiable #4) must prove the tiering table's every caller-tier × target-role combination, including the degenerate self-target case in AC#6, and that a Coordinator cannot target a session outside their own active scope (AC#7).
- `audit_log` is untouched by this item — no migration needed there. If a later legal/compliance review requires a persisted, queryable trail for role grants specifically, that is a follow-up ADR introducing Option C, not a reopening of this one.
- This closes `core-schema-and-rls`'s deferred write path (line 164) — `user_roles` now has exactly one sanctioned write path, described here, and remains client-unwritable via RLS.

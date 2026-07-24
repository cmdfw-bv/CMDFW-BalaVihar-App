# ADR-0030: `class_updates` is a System-owned schema addition, not Coordinator-owned or Teacher-gated

**Status:** Closed · **Date:** 2026-07-24 · **Deciders:** Project owner + architect
**Governs:** System → `core-schema-and-rls` (`.docs/specs/system/core-schema-and-rls.md`, schema addendum, detailed at `/design`) · consumed by Coordinator → `compliance-dashboard` (`.docs/specs/coordinator/compliance-dashboard.md`) and, later, Teacher's not-yet-refined "post class update" item.

### Context

`compliance-dashboard.md`'s refine pass correctly identified that its second metric (class-update-posting rate) needs a `class_updates`-shaped table that does not exist yet, and that the natural writer of that table — Teacher's "post class update" item (doc 2 §Teacher) — has not been refined. The brief flagged this as an open dependency for `/architect` and offered three options: Coordinator defines the table now, this item waits for Teacher's item to be refined and own it, or some other sequencing.

### Options Considered

- **Coordinator owns and defines the schema now** — Pros: unblocks this item immediately, no waiting. Cons: Coordinator would be defining the write-side shape of a table it never writes to (AC6: read-only) and has no operational stake in beyond reading a rate off it; inconsistent with how every other cross-persona operational table in this schema is actually owned.
- **Bounce to `/refine`, wait for Teacher's item to own the table** — Pros: table owned by its primary writer, matching the illustrative `owner: Teacher` example in doc 3 §12.12. Cons: needlessly serializes two independently-parallelizable Units of Work (§12.6 exists specifically to avoid this); and the illustrative §12.12 example is aspirational, not what this codebase actually does — see next option.
- **System owns it (chosen)** — Pros: matches actual precedent exactly. `attendance`, `students`, `enrollments`, `consents` — every table more than one persona touches — are already owned by System's `core-schema-and-rls.md`, not by whichever persona's day-to-day action produces the rows (Teacher marks attendance; System owns the table; both Teacher's write RPC (ADR-0021) and Coordinator's/BV Coordinator's/Admin's read RPCs (ADR-0019) are consumers). `class_updates` is the same shape of table: one persona writes it (Teacher, eventually), a different persona needs to read an aggregate off it now (Coordinator). Keeping it System-owned means neither item blocks on the other's refine cycle. Cons: adds one more table to System's already-large `core-schema-and-rls.md` surface (mitigated — it is a small, additive addendum, not a rewrite, mirroring how ADR-0021 added the `mark_attendance_for_staff` RPC as an addendum to the same file after it was already "Built").

### Decision

`class_updates` is a **System-owned** schema addition, added as an addendum to `core-schema-and-rls.md` (same pattern ADR-0021 used to extend that already-built spec), not defined by `compliance-dashboard.md` and not gated on Teacher's "post class update" item being refined first.

Minimum shape needed to unblock Coordinator's read (exact columns finalized at `/design`): `class_id` (references `classes`), `posted_by` (references `auth.users`), `posted_at`. Read access for Coordinator's compliance dashboard follows the ADR-0019 RPC pattern (security-definer, scope-checked, audited) rather than a direct table grant — consistent with every other operational table a staff role reads outside its own scope. Teacher's write path, once that item is refined, follows the ADR-0021 RPC pattern (security-definer write RPC, no direct grant) rather than a generic `.insert()` — it becomes a **consumer of this table's write path**, not its schema owner.

### Consequences

- Coordinator's `/design` for `compliance-dashboard.md` must coordinate a small schema addendum to `core-schema-and-rls.md` (new table + a staff-facing read RPC) before its own data/RLS section is complete — same shape of cross-reference the item's `/refine` pass already anticipated, just resolved as "System addendum" instead of "wait on Teacher."
- When Teacher's "post class update" item is eventually refined, its `/architect` pass should link back to this ADR rather than re-litigate ownership; that item's governing ADR for the table itself is this one, not a new one, unless its write requirements turn out to need a schema shape this ADR didn't anticipate.
- This is the second table (after `attendance`) where the RPC-mediated "owned by System, written by one persona, read by another" pattern originates from a consuming item's `/architect` review rather than from `core-schema-and-rls.md`'s own original build pass — establishes that as the normal path, not a one-off.

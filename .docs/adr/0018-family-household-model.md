# ADR-0018: Family/household data model

**Status:** Closed · **Date:** 2026-07-08 · **Deciders:** Project owner + architect
**Governs:** System → `core-schema-and-rls` (`.docs/specs/System/core-schema-and-rls.md`). Resolves doc 3 §6.2's deferred "schema design is a downstream task" for the family/guardian/student shape; informs the Parent row of the §5.4 scope model ("own-children").

### Context
Doc 3 §6.2 lists `families` as part of the canonical relational core but explicitly defers its column-level shape to the schema-design pass. That shape matters architecturally: it determines how the Parent role's `own-children` scope (§5.4) is expressed in RLS — via a direct FK, a join table, or something richer — and whether the schema needs to support multiple guardians per household and/or a student split across two households (joint custody/co-parenting).

### Options Considered
- **Many-to-many guardianship** (join table linking any student to any number of family/guardian records) — Pros: models split-custody/joint-guardianship households realistic for a community program. Cons: adds a join table and more complex RLS (`own-children` becomes "any family I'm linked to, for any student linked to that family or to me directly") for a need not yet confirmed present in the pilot cohort.
- **One family per student, household = one-to-many from family** (chosen) — Pros: matches the common case directly — a `families` record is a household containing multiple parent/guardian users and multiple enrolled students; `own-children` scope resolves as "all students whose `family_id` equals my linked family." Simple FK-based RLS. Cons: does not model a student split across two households; if that need surfaces during the pilot it requires a follow-up migration (a genuine gap, accepted deliberately rather than solved speculatively).
- **Guardian-as-attribute-on-student** (no separate family entity, guardian emails/phones stored directly on the student row) — Cons: rejected outright — can't represent multiple guardians per student or siblings sharing a household cleanly; also complicates consent (`consents` scopes to "subject's family," which needs a real family entity).

### Decision
`families` is a **household unit**: one family record holds **multiple parent/guardian users** and **multiple enrolled students**. Each student belongs to **exactly one** family. Parent `own-children` scope (§5.4) is enforced as "students where `family_id` = the parent's linked family." Split-custody / joint-guardianship across two households is **explicitly out of scope** for the POC schema.

### Consequences
- `core-schema-and-rls` ships `families`, `students.family_id` (FK, not null), and a `family_members` (or equivalent) linking table for the multiple-parents-per-family case.
- `consents` scoping ("subject's family/org," doc 3 §6.2) resolves cleanly against this shape — a consent record's subject family is unambiguous.
- **Residual risk, tracked for doc 3 §13:** if a pilot household needs split-custody representation, it requires a new migration + a superseding ADR — not a silent workaround. `/architect` should watch for this surfacing during `/test` or pilot feedback.
- No new external processor, no residency impact — pure schema shape.

# ADR-0013: Sequential refine → architect-review → design for every feature item

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect
**Extends:** ADR-0008 (delivery system). **Supersedes** the §12.10 stance that trivial items skip `/architect`.

### Context
Per-persona *business* refinement (turning doc 2's high-level capabilities into buildable, prioritized requirements with stories/acceptance) had no explicit owner — it fell between `/architect` (gated to significant items) and `/design` (per-screen). We also want an architecture checkpoint on **every** item, not only self-declared "significant" ones, so nothing reaches build without a review.

### Options Considered
- **Sequential `/refine` → `/architect` (review) → `/design`, every item** — Pros: per-persona refinement is explicit and owned; an architecture review gates every item; ADRs still only when significant; scoped per item (one persona + one POC item per `/refine`) → small, parallelizable sessions. Cons: one extra step per item.
- **Broaden `/architect` to own refinement** — Cons: overloads architect with product work; runs heavy even for trivial items. Rejected.
- **Fold refinement into `/design`** — Cons: mixes "what features exist" with "detailed spec"; no independent architecture checkpoint. Rejected.
- **Keep ASR-gated architect (skip when trivial)** — Cons: trivial items reach `/design`/build with no architecture review. Rejected.

### Decision
Delivery Stage 1 is the **sequence**: **`/refine <persona> "<one POC item>"` → `/architect` (review) → `/design`.**
- `/refine` elaborates ONE item for ONE persona into a feature brief (story · acceptance · edge cases · priority · consumers · scope) → `.docs/specs/<persona>/<functionality>.md` (`Requirements (refined)`) + a row in `.docs/specs/<persona>/_index.md`. Never a whole-persona session.
- `/architect` **reviews every brief**: records an ADR only when there's an architecturally-significant decision, else signs off; may bounce back to `/refine`.
- `/design` always follows an architect sign-off.

### Consequences
Stage 1 = refine → architect-review → design; then `/plan → /build → /test → /deploy-staging → /promote` (ADR-0008). The per-persona `_index.md` backlog grows one reviewed item at a time → parallel across people/personas (§12.6). See 3_ARCHITECTURE §12.3, §12.10, §12.11, §12.13.

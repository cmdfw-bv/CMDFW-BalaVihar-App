---
name: architect
description: Stage 1 step 2 (mandatory review) — review a refined feature item, record an ADR if there's a significant decision, then hand to design. Runs after /refine, before /design.
disable-model-invocation: true
---

# Architect (review) — sequential gate between /refine and /design

Authoritative detail: `.docs/3_ARCHITECTURE.md` §12.10–§12.12. Use `superpowers:brainstorming` and `writing-plans` under the hood.
**Sequence (always): `/refine` → `/architect` (this) → `/design`.**

## Role — review every refined item
- **System-level architecture is already complete** (`.docs/3_ARCHITECTURE.md` + the ADR log). Don't re-run it for the whole system.
- **Per item:** architect **reviews every refined feature brief** (from `/refine`) before it reaches `/design`. It is a checkpoint, not optional.
- **Record an ADR only when the item carries an architecturally-significant decision** (new cross-scope access pattern, new external processor, new schema/RLS shape, realtime/perf concern, anything touching minors' data or residency). No significant decision → sign off with no ADR.
- If the brief is unsound or under-specified, **bounce it back to `/refine`**.

## Inputs
The refined brief from `/refine` (`.docs/specs/<persona>/<functionality>.md` → Requirements + the `_index.md` row), plus `.docs/1_GREENFIELD_POC_PROPOSAL.md`, `.docs/2_POC_FEATURE_SCOPE.md`, `.docs/3_ARCHITECTURE.md`, and the existing `.docs/adr/` index.

## Outputs
1. **ADR(s)** — *when significant* — in `.docs/adr/NNN-<slug>.md` using the repo format (`Status · Date · Deciders · Context · Options Considered (Pros/Cons) · Decision · Consequences`); update `.docs/adr/README.md`. **Never edit a Closed ADR — supersede it.**
2. **Review sign-off** recorded on the item: set its `governing ADR` (or "none") in `.docs/specs/<persona>/<functionality>.md` + the `_index.md` row; confirm owner / consumers / scope are sound (§12.12).

## Method (AI-DLC rhythm — plan → ask → human-validate)
1. Read the refined brief; restate it.
2. Check it against the architecture (scope/RLS, residency, minors' data, realtime/perf). If under-specified → **bounce to `/refine`**.
3. Identify any architecturally-significant decision. **None → sign off, no ADR.** Some → present 2–3 options with trade-offs + a recommendation and **ask the human to decide**, then write the ADR(s).
4. Record the sign-off + governing ADR on the item, then hand to **`/design`**.

## Guardrails
RLS-in-DB, US residency, minors'-data minimization apply to every option (see `privacy-rules`, `rls-patterns`, `persona-scope`).

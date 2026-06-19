---
name: design
description: Stage 1 (Design) — turn a feature use case into a spec. Invoke with /design <feature>.
disable-model-invocation: true
---

# /design <feature> — Stage 1 (SDD specify + clarify; AI-DLC Inception)

Authoritative: `.docs/3_ARCHITECTURE.md` §12.3, §12.11–§12.12. Uses `superpowers:brainstorming` + `writing-plans`.

1. Start from the **architect-reviewed brief** (`.docs/specs/<persona>/<functionality>.md` → `Requirements (refined)`, with its sign-off + governing ADR). Confirm the owner persona. *(Sequence: `/refine` → `/architect` → `/design` — design always follows an architect review.)*
2. Brainstorm the spec: purpose, user flow, data touched, access scope, edge cases. **Ask clarifying questions; do not assume.**
3. Write `.docs/specs/<persona>/<functionality>.md` with the mandatory header:
   `owner · consumers · scope · governing ADR · covers`
   then sections: Behavior, Data & RLS impact, UI, Edge cases, Out of scope.
4. **Design (Open Design):** confirm/generate the Sankalp **prototype** for the screen(s) and reference it in the spec's UI section; apply the design Definition-of-Done (see `design-system` skill). *(Sankalp import is pending the team's design refinement — until then, spec to the DoD behaviors, don't hardcode visual values.)*
5. Cross-reference (don't duplicate) any consumer personas (§12.12).
6. Get human sign-off on the spec → hand to `/plan`.

Guardrails: RLS-in-DB, US residency, minors'-data minimization (see `persona-scope`, `privacy-rules`); design DoD (see `design-system`).

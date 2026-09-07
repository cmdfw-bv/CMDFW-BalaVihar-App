# Parent — persona backlog

Parent scope (doc 3 §5.4): **own-children** — sees only their own children's records.

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [children-attendance-view](children-attendance-view.md) | POC-core | Parent | Parent | own-children (ADR-0018) | `/build` ✓ → **merged 2026-08-16** (`9215b0c`, PR #51; issue #22 closed) — client-only, no migration needed. Two review rounds (PR #51): the merge-resolution routing bug (Student fell through to the Teacher roster, tripping a `denied` audit write) fixed in `3116e8f`; the null-embed / error-disclosure / query-guard / in-flight items fixed in the round after. Next: `/deploy-staging`. **Open:** no `/test` gate marker was recorded for this item — it merged on green CI, but the `/test` sign-off this row previously required (review Minor #8) is still unaccounted for; confirm before `/promote` ([plan](children-attendance-view.plan.md)) |

**POC-core, not yet refined** (doc 2 §2, Parent): home feed (announcements + class updates) · two-way comments · notifications · view events. Each is a separate `/refine` pass when picked up.

**Defer** (doc 2 §2): full parent engagement module · self-serve onboarding.

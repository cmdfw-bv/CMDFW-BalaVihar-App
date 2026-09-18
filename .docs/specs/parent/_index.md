# Parent — persona backlog

Parent scope (doc 3 §5.4): **own-children** — sees only their own children's records.

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [children-attendance-view](children-attendance-view.md) | POC-core | Parent | Parent | own-children (ADR-0018) | `/build` ✓ → **merged 2026-08-16** (`9215b0c`, PR #51; issue #22 closed) — client-only, no migration needed. Two review rounds (PR #51): the merge-resolution routing bug (Student fell through to the Teacher roster, tripping a `denied` audit write) fixed in `3116e8f`; the null-embed / error-disclosure / query-guard / in-flight items fixed in the round after. Next: `/deploy-staging`. **Open — needs a decision:** no `/test` gate marker was recorded for this item. A missing marker is not itself a gap (see the note in `system/_index.md` — markers are ephemeral and CI is the durable evidence), but review Minor #8 asked for an explicit sign-off on this item specifically; settle that before `/promote` ([plan](children-attendance-view.plan.md)) |

**POC-core, not yet refined** (doc 2 §2, Parent): home feed (announcements + class updates) · two-way comments · notifications · view events. Each is a separate `/refine` pass when picked up.

**Defer** (doc 2 §2): full parent engagement module · self-serve onboarding.

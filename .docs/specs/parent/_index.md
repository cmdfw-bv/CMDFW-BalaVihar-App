# Parent — persona backlog

Parent scope (doc 3 §5.4): **own-children** — sees only their own children's records.

| functionality | priority | owner | consumers | scope | status |
|---|---|---|---|---|---|
| [children-attendance-view](children-attendance-view.md) | POC-core | Parent | Parent | own-children (ADR-0018) | Planned ✓ — no migration needed (client-only), ready for `/build` ([plan](children-attendance-view.plan.md)) |

**POC-core, not yet refined** (doc 2 §2, Parent): home feed (announcements + class updates) · two-way comments · notifications · view events. Each is a separate `/refine` pass when picked up.

**Defer** (doc 2 §2): full parent engagement module · self-serve onboarding.

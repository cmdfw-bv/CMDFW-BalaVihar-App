# ADR-0014: Access UX — no permission-denied, role-derived navigation, conditional persona switcher

**Status:** Closed · **Date:** 2026-06-20 · **Deciders:** Project owner + architect
**Refines:** ADR-0003 (DB-layer RLS), ADR-0004 (multi-persona auth hook). **Supersedes** the 3_ARCHITECTURE §12.13 stance that *permission-denied* is one of five required states, and the §5.3 implication that the role switcher is always present.

### Context
The Sankalp Definition of Done (§12.13) and the kit's five-state discipline treated **permission-denied-as-designed (offer switch-role)** as a first-class screen state, and the reference shell rendered an always-present role pill. Owner direction: an in-scope user should **never** reach a permission-denied screen; the app should render only the screens a user's roles grant; and a single-role user should not see a switcher at all. Access is already DB-enforced (ADR-0003) — this ADR governs the **UX layer on top of RLS**, not the enforcement.

### Options Considered
- **Role-derived navigation + four states + redirect + conditional switcher** (chosen) — Pros: a user can't navigate to what they can't see, so denial never surfaces; single-role users get a calmer UI; matches "switching re-scopes the whole app" (§5.3). Cons: route guards + nav must be derived from the active role's grants.
- **Keep permission-denied-as-designed** — Cons: surfaces denial in normal use; "denied" leaks that an out-of-scope record *exists* — wrong posture for minors' data. Rejected.
- **Merged multi-role view** (one app showing the union of all roles) — Cons: blurs scope; harder to reason about which scope is active. Rejected in favor of distinct role modes.

### Decision
1. **Four required states**, every screen: **loading · empty · error (work preserved) · content.** **No permission-denied state.**
2. **Out-of-scope / stale routes** (e.g. a bookmarked link after a role is removed) **silently redirect to the user's home feed**; anything whose existence shouldn't leak resolves to a neutral **not-found**, never "denied".
3. **Navigation is role-derived.** The tab bar + screen set are built from the **active role**; roles are **distinct modes** — switching **swaps the whole app**, never a merged view.
4. **Conditional switcher.** Shown **only when an account holds ≥2 roles.** A single-role user sees a **static, non-interactive context chip** naming the bound scope — **Center · Session · Grade/Class** (e.g. "Teacher · Brampton · Sunday AM · Junior A").

### Consequences
RLS (ADR-0003/0004) remains the enforcement; this is a UX guarantee layered above it — route guards must mirror the JWT's `active_role`/scope claims. Patch: 3_ARCHITECTURE §12.13 DoD ("five states incl. permission-denied-as-designed" → "four states; no permission-denied"), §5.3 (add role-derived nav + conditional switcher); `.claude/rules/design-system.md`, Sankalp `USAGE.md`, and the kit README adopt the four-state language.

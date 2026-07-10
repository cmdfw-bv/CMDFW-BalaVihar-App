# ADR-0010: Design tooling — Open Design (local-first), artifacts exported into the repo

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
The team needs design, prototyping, and a design system for a multi-surface app (web PWA + native), driven by non-technical maintainers + Claude Code. Open Design (`nexu-io/open-design`, local-first, self-hostable) is already in use and produces a project-specific design system, **"Sankalp"** — a `DESIGN.md` brand contract + `tokens.css` + `design-tokens.json` (od-design-tokens/v1) + components + HTML prototypes — and can package a design system as a Claude plugin/skill and hand prototypes to a code agent.

### Options Considered
- **Open Design, artifacts exported into the repo** — Pros: local-first/US-resident, no runtime dependency (dev-time only); design system is token-based and already architecture-aware (Expo+RLS, multi-role, permission-denied-as-designed); prototypes are a concrete visual spec for `/build`; hands off to Claude Code. Cons: artifacts must be exported + kept in sync.
- **Live via Open Design MCP** — Cons: live dependency, weaker reproducibility. Rejected as the source of truth.
- **No dedicated design tool** — Cons: no shared visual contract; fidelity/consistency suffer. Rejected.

### Decision
Adopt **Open Design** as the dev-time design/prototyping/design-system tool. The **Sankalp** design system is the visual source of truth, **exported into `design/sankalp/`** (committed) when finalized. Open Design is **not** a runtime/residency component.

### Consequences
`design-tokens.json` feeds the styling bridge (ADR-0011). The `USAGE.md` Definition-of-Done becomes enforceable design rules (`.claude/rules/design-system.md`). **Import is deferred** until the broader team refines edge cases + validates components; keep the od-design-tokens/v1 *taxonomy* stable meanwhile. See 3_ARCHITECTURE §12.13.

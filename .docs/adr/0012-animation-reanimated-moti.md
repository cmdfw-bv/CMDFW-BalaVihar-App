# ADR-0012: Animation — Reanimated engine + Moti declarative layer (for future gamification)

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
Gamification (XP, badges, celebratory motion) is a **deferred** future state (doc 1/2). In React Native, animation is a layer separate from styling; both Unistyles and Tamagui ultimately animate via Reanimated. We want the future ceiling without paying complexity now, and the motion authoring to be agent-friendly. Verified live: Reanimated 10.9k★ (engine; worklets — powerful but least LLM-reliable raw), Moti 4.5k★ (declarative `<MotiView from/animate/exit>` on Reanimated 3, web+native).

### Options Considered
- **Unistyles now + Moti (on Reanimated 3) when gamification lands** — Pros: same animation ceiling as Tamagui; purely additive (no rework); Moti is the most agent-friendly motion API; YAGNI-correct for a deferred feature. Cons: two focused libraries vs one integrated system.
- **Tamagui (integrated style+animation+components) now** — Pros: one system, animation is its sweet spot. Cons: heavier now for a deferred benefit; compiler + token DSL. Rejected (see ADR-0011).
- **Raw Reanimated worklets as the default** — Cons: least LLM-reliable; error-prone for non-technical maintainers. Rejected as a default.

### Decision
Animation engine = **Reanimated 3**; default authoring layer = **Moti** (declarative). Adopt Moti **when gamification is built**. **Declarative-only is the rule** (`.claude/rules/motion.md`) — no raw worklets unless justified. **Motion tokens** (durations/easings) live in `design-tokens.json` now (cheap) so motion is token-driven and the bridge already carries them.

### Consequences
Open Design HyperFrame can prototype motion (→ MP4) as a visual spec. No POC dependency added now. See 3_ARCHITECTURE §12.13.

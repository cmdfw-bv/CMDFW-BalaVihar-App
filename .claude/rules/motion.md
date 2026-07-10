---
paths: ["app/**", "features/**", "components/**"]
---

# Motion / animation rules (3_ARCHITECTURE §12.13; ADR-0012)

> Animation engine = **Reanimated 3**; default authoring layer = **Moti** (declarative). Adopted **when gamification is built** — not part of the POC.

- **Declarative-only by default.** Use Moti (`<MotiView from={} animate={} exit={} transition={} />`) or equivalent declarative props. **Do not write raw Reanimated worklets / `useSharedValue`** unless a case genuinely requires it and it's justified in review — worklets are the least reliable to author and read.
- **Motion is token-driven.** Durations/easings come from `theme.motion` (generated from `design/sankalp/design-tokens.json`), not magic numbers.
- **Respect reduced-motion** and keep motion purposeful (feedback, state change, delight in gamification) — never gratuitous on data-dense utility screens.
- **Prototype motion** with Open Design HyperFrame (→ MP4) as the visual spec to match, same as static screens.
- Keep animation a separate layer from styling (Unistyles) — don't couple the two.

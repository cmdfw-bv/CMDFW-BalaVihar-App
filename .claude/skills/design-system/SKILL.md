---
name: design-system
description: Use when building or styling any UI — the Sankalp design system, the Unistyles token bridge, and the design Definition-of-Done for the CMDFW Bala Vihar app.
---

# Design system — Sankalp + Unistyles

Authoritative: `.docs/3_ARCHITECTURE.md` §12.13; ADR-0010 (Open Design), ADR-0011 (Unistyles), ADR-0012 (animation). Rules: `.claude/rules/design-system.md` + `motion.md`.

## Source of truth
- **Sankalp** (from Open Design) is the visual contract: `design/sankalp/DESIGN.md` (brand) + `USAGE.md` (DoD) + `design-tokens.json` (tokens) + `components.html` + `prototypes/<screen>.html`.
- Styling is **Unistyles 3** driven by generated **`lib/theme.ts`** (`gen:theme` reads `design-tokens.json`, pre-resolves `color-mix()`).
- Tokens: color `bg / accent (indigo, the one primary action) / brand (saffron, identity-only) / status{present,absent,excused,info} / role{per-persona}`; `space / radius / type / motion`.

> **Status:** the Sankalp artifacts + `theme.ts` are **imported after the broader team refines edge cases + validates components** (ADR-0010). Until then, build to the DoD behaviors (stable) and don't hardcode visual values. Keep the od-design-tokens/v1 *taxonomy* stable.

## Build to the Definition of Done (`.claude/rules/design-system.md`)
Compose from `theme` tokens never hex · one primary action · saffron identity-only · tabular numerics · all five states incl. **permission-denied-as-designed** (offer switch-role) · role badge + scope · ≥44px · breakpoints 360/768/1024/1440 · serif display for showcase only.

## Workflow (Open Design → code)
Per screen: confirm/generate the Open Design **prototype** → implement in RN with Unistyles + `theme` → match the prototype → verify with a **playwright-cli design review** (`/test`). Media is orthogonal (`expo-image/expo-video/expo-audio/react-native-youtube-iframe`). Animation (future gamification) = Moti, declarative-only (`.claude/rules/motion.md`).

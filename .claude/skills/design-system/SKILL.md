---
name: design-system
description: Use when building or styling any UI — the Sankalp design system, the Unistyles token bridge, and the design Definition-of-Done for the CMDFW Bala Vihar app.
---

# Design system — Sankalp + Unistyles

Authoritative: `.docs/3_ARCHITECTURE.md` §12.13; ADR-0010 (Open Design), ADR-0011 (Unistyles), ADR-0012 (animation). Rules: `.claude/rules/design-system.md` + `motion.md`.

## Source of truth
- **Sankalp** (from Open Design) is the visual contract, mirrored locally: `design/sankalp/DESIGN.md` (brand) + `USAGE.md` (DoD) + `design-tokens.json` (tokens).
- The **live, canonical** source is the **Chinmaya Mission Design System** project on claude.ai/design (`bv-connect/**` — components as `<Component>.jsx` + `.card.html` preview, full screens under `bv-connect/screens/{desktop,phone}`). Pull files with the `DesignSync` tool (`list_files` / `get_file`) — don't rely on a stale local copy.
- Styling is **Unistyles 3** driven by generated **`lib/theme.ts`** (`gen:theme` reads `design-tokens.json`, pre-resolves `color-mix()`).
- Tokens: color `bg / accent (indigo, the one primary action) / brand (saffron, identity-only) / status{present,absent,excused,info} / role{per-persona}`; `space / radius / type / motion`.

> **Status:** the Sankalp artifacts + `theme.ts` **landed in commit `db453e8`** — they are live, not pending import. Every screen/component must be matched against its `bv-connect/**` reference, not just the DoD behaviors.

## Build to the Definition of Done (`.claude/rules/design-system.md`)
Compose from `theme` tokens never hex · one primary action · saffron identity-only · tabular numerics · all **four** states — loading / empty / error-preserving / content, **no permission-denied** (nav is role-derived; out-of-scope routes redirect home, ADR-0014) · role badge + scope · ≥44px · breakpoints 360/768/1024/1440 · serif display for showcase only.

## Workflow (Open Design → code)
Per screen: pull the matching `bv-connect/**` component/screen via `DesignSync` → implement in RN with Unistyles + `theme`, matching its layout/copy/states → verify with a **playwright-cli design review** (`/test`). Media is orthogonal (`expo-image/expo-video/expo-audio/react-native-youtube-iframe`). Animation (future gamification) = Moti, declarative-only (`.claude/rules/motion.md`).

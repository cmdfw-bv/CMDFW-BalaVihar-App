# ADR-0011: Styling — Unistyles 3 with a generated theme from design-tokens.json

**Status:** Closed · **Date:** 2026-06-16 · **Deciders:** Project owner + architect

### Context
The Expo app (RN + RN-Web) must reproduce the Sankalp design with high fidelity on **web and native** from one token source. RN native doesn't support CSS `:root` variables, so `tokens.css` can't be the native source. App UI is forms/lists/dashboards; gamification (animation-heavy) is a deferred future state (ADR-0012). Maintainers are non-technical + Claude (AI-legibility matters). Verified live: Tamagui 14k★ ("100% parity" + compiler), Unistyles 2.9k★ (themes/breakpoints/variants over StyleSheet), NativeWind 7.9k★.

### Options Considered
- **Unistyles 3 + generated `lib/theme.ts`** — Pros: themes/breakpoints/variants + web+native; thin layer over StyleSheet (AI-legible); consumes `design-tokens.json` ~1:1; gamification added later via Moti without rework (ADR-0012). Cons: native needs an Expo dev build (web unaffected; native is EAS anyway); smaller community.
- **Tamagui** — Pros: highest parity, optimizing compiler, integrated animation + UI kit. Cons: compiler/Babel config + token DSL + more concepts — heavier than a forms/lists POC needs, less AI-legible. Best only if heavy near-term animation. Rejected for now.
- **NativeWind** — Cons: tokens go through tailwind.config (not 1:1), some CSS differs on native. Rejected.

### Decision
Use **Unistyles 3**. A build step (`gen:theme`) generates a typed **`lib/theme.ts`** from `design/sankalp/design-tokens.json` (color `bg/accent/brand/status/role`, `space/radius/type/motion`), **pre-resolving `color-mix()`** to static values; Unistyles is configured with that theme + breakpoints 360/768/1024/1440; fonts via `expo-font` (serif display + mono tabular-nums).

### Consequences
Supersedes the old draft ADR-010 "styling library" notion. Media is orthogonal (expo-image/expo-video/expo-audio/youtube-iframe). **Bridge + `theme.ts` are built at app-scaffold time, after the Sankalp import (ADR-0010).** See 3_ARCHITECTURE §12.13.

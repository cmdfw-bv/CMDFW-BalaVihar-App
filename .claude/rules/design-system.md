---
paths: ["app/**", "features/**", "components/**"]
---

# Design-system rules (3_ARCHITECTURE §12.13; ADR-0011)

> Styling is **Unistyles 3** driven by a generated `lib/theme.ts` (from `design/sankalp/design-tokens.json`).
> The Sankalp artifacts + `theme.ts` land after the broader team finishes refining the design — until then, build to the
> behaviors below (they are stable regardless of token values) and don't hardcode visual values.

## Definition of Done (the merge gate — from Sankalp USAGE.md)
- **Compose from `theme` tokens, never hex.** No raw color/spacing literals; reach for a token (or `color-mix` from one, pre-resolved in the bridge).
- **One primary action per view** (indigo `accent`). Everything else secondary / ghost / danger.
- **Saffron (`brand`) is identity-only** — logo, eyebrow, one highlight. Never a competing CTA.
- **Tabular numerics** for any compared number (percentages, counts, dates, IDs) → RN `fontVariant: ['tabular-nums']`.
- **Draw all five states**: loading · empty · error · validation · **permission-denied**. No blank screens, infinite spinners, or raw stack traces.
- **Permission-denied is a designed state** — RLS filtered server-side; show it and offer "switch role" (§5.3).
- **Role badge + scope** on role-specific UI; the active-role switcher is global chrome.
- **≥44px touch targets; no horizontal scroll** at breakpoints **360 / 768 / 1024 / 1440**.
- **Serif display** (`font-display`) for showcase headings only — never body/buttons; **mono** for utility/tabular.

## How
- Style via Unistyles using `theme` tokens; never import design values from anywhere but `lib/theme.ts`.
- Match the Open Design **prototype** for the screen (`design/sankalp/prototypes/<screen>.html`) when present.
- Media (images/video/audio/YouTube) is orthogonal — use `expo-image` / `expo-video` / `expo-audio` / `react-native-youtube-iframe`; style only their containers.

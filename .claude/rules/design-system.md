---
paths: ["app/**", "features/**", "components/**"]
---

# Design-system rules (3_ARCHITECTURE §12.13; ADR-0011)

> Styling is **Unistyles 3** driven by a generated `lib/theme.ts` (from `design/sankalp/design-tokens.json`).
> The Sankalp artifacts + `theme.ts` landed in commit `db453e8` — they are the live visual contract, not a future
> import. The **Chinmaya Mission Design System** project on claude.ai/design (`bv-connect/**`) is the canonical
> source; pull it with the `DesignSync` tool. Match its components/screens, don't hardcode visual values.

## Definition of Done (the merge gate — from Sankalp USAGE.md)
- **Compose from `theme` tokens, never hex.** No raw color/spacing literals; reach for a token (or `color-mix` from one, pre-resolved in the bridge).
- **One primary action per view** (indigo `accent`). Everything else secondary / ghost / danger.
- **Saffron (`brand`) is identity-only** — logo, eyebrow, one highlight. Never a competing CTA.
- **Tabular numerics** for any compared number (percentages, counts, dates, IDs) → RN `fontVariant: ['tabular-nums']`.
- **Draw all four states**: loading · empty · error-preserving · content. No blank screens, infinite spinners, or raw stack traces.
- **No permission-denied screen** — navigation is role-derived; out-of-scope routes redirect home (ADR-0014).
- **Role badge + scope** on role-specific UI; the active-role switcher is shown only for accounts with ≥2 roles — single-role users see a static context chip (Center · Session · Grade/Class).
- **≥44px touch targets; no horizontal scroll** at breakpoints **360 / 768 / 1024 / 1440**.
- **Serif display** (`font-display`) for showcase headings only — never body/buttons; **mono** for utility/tabular.

## How
- Style via Unistyles using `theme` tokens; never import design values from anywhere but `lib/theme.ts`.
- Match the design project's reference for the screen/component: `bv-connect/components/<domain>/<Component>.jsx`
  (React reference impl) + the matching `.card.html` preview, or `bv-connect/screens/{desktop,phone}` for
  full-screen layouts. Pull the file with `DesignSync` (`get_file`) before implementing — don't guess the shape.
- Media (images/video/audio/YouTube) is orthogonal — use `expo-image` / `expo-video` / `expo-audio` / `react-native-youtube-iframe`; style only their containers.

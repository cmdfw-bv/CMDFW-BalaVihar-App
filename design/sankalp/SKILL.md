---
name: chinmaya-mission-design
description: Use this skill to generate well-branded interfaces and assets for Chinmaya Mission, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

## Quick start
- **Tokens & fonts:** link `styles.css` (it `@import`s `tokens/*` and the four Google webfonts). Reference everything via `var(--name)`; never hard-code a value a token covers.
- **Components:** load `_ds_bundle.js`, then read primitives from `window.ChinmayaMissionDesignSystem_52eae1` (e.g. `const { Button, StatusChip, RoleBadge } = window.ChinmayaMissionDesignSystem_52eae1`). See each `components/**/*.prompt.md` for usage.
- **Whole screens to start from:** `templates/bala-vihar-app/` (CMDFW Bala Vihar App — multi-role attendance PWA; a Template starting point) and `ui_kits/events-site/` (events + registration website).

## The rules that matter most
- **One terracotta (`--primary`) action per view.** Indigo and gold are identity/atmosphere, never competing CTAs.
- **Warm-paper foundation; warm-tinted shadows.** No beige/peach/gray washes.
- **Type:** Marcellus for display/identity (screen titles, event names; single weight — use size & color for hierarchy, never synthetic bold); Mukta for UI/body and Devanagari; JetBrains Mono (tabular) for any compared figure. Fits react-native-unistyles 3 — see the readme "React Native / Unistyles 3" section.
- **Voice:** warm, reverent, plain; sentence case; "Hari Om!" / "With Prem and Om". No emoji.
- **App surfaces draw all five states** (loading / empty / error / validation / permission-denied) and treat permission-denied as a designed state.
- **Mobile-first**, ≥44px touch targets, capsule pills, 18px card radius.

See `readme.md` for the full content, visual, and iconography guidelines.

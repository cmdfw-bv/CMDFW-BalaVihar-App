# Sankalp export → CMDFW Bala Vihar App

Design-system export for the repo. Everything here mirrors the paths it lands at
in `CMDFW-BalaVihar---Pilot-App/`, so you can drop the tree in as-is. Values come
verbatim from the **Chinmaya Mission Design System** (the source of truth).

## Drop-in map

| From this export | → Repo path | Action |
|---|---|---|
| `design/sankalp/design-tokens.json` | `design/sankalp/design-tokens.json` | **new** — token source of truth (od-design-tokens/v1) |
| `design/sankalp/tokens.css` | `design/sankalp/tokens.css` | **new** — CSS var mirror (web / RN-Web) |
| `design/sankalp/DESIGN.md` | `design/sankalp/DESIGN.md` | **new** — brand contract |
| `design/sankalp/USAGE.md` | `design/sankalp/USAGE.md` | **new** — Definition of Done → seeds `.claude/rules/design-system.md` |
| `design/sankalp/UNISTYLES.md` | `design/sankalp/UNISTYLES.md` | **new** — per-component RN mapping notes |
| `design/sankalp/components/**` | `design/sankalp/components/**` | **new** — component contracts (`.prompt.md` + `.d.ts`) to build RN components against |
| `lib/theme.ts` | `lib/theme.ts` | **replace** the placeholder — generated, real values |
| `scripts/gen-theme.mjs` | `scripts/gen-theme.mjs` | **replace** the TODO stub — real JSON→theme.ts generator |
| `assets/fonts/*.ttf` | `assets/fonts/*.ttf` | **new** — the 6 font files, bundled |
| `assets/fonts/README.md` | `assets/fonts/README.md` | **new** — `expo-font` registration snippet |
| `assets/images/chinmaya-om.png` | `assets/images/chinmaya-om.png` | **new** — OM mark |
| `assets/images/gurudev.jpg` | `assets/images/gurudev.jpg` | **new** — Gurudev portrait |

Nothing else in the repo changes. `package.json` already wires
`"gen:theme": "node scripts/gen-theme.mjs"`, and `lib/unistyles.ts` already types
against `typeof lightTheme`, so no downstream edits are needed.

## Verify after dropping in

```bash
npm run gen:theme   # ✓ design-tokens.json found — regenerated lib/theme.ts with real Sankalp values.
npm run typecheck   # theme shape flows through unistyles.ts
npm run start       # app boots on the real palette
```

Then register the fonts in `app/_layout.tsx` (the six `.ttf` are already in
`assets/fonts/` — see its README for the snippet).

## How to build components with fidelity

1. **Read the contract, don't copy web code.** The design system's React
   components are web-only (`React.createElement`). Each `components/**/*.prompt.md`
   + `.d.ts` is the port target: match the props, states, and tokens in React
   Native. `UNISTYLES.md` gives the per-component RN mapping (which parts are
   `Pressable`, which token each surface uses, keyboard handling, etc.).
2. **Only tokens.** Read `theme.*` via Unistyles `StyleSheet.create(theme => …)`.
   No raw hex — `USAGE.md` makes this a review gate.
3. **Obey the brand rules** in `DESIGN.md`: one terracotta action color; indigo +
   gold identity-only; status ramp = one meaning each; role hues data-only;
   Marcellus single-weight (size + color for hierarchy).
4. **Ship the five states** on every data surface: loading, empty, error,
   permission-denied (as-designed), offline.
5. **Change values in `design-tokens.json`, never in `lib/theme.ts`** — regenerate
   with `npm run gen:theme`.

## What is NOT in this export (by design)

- **Prebuilt RN components** — the DS ships web React (`React.createElement`);
  native components are built in-repo from the contracts above (fidelity comes from
  the contract + tokens, not a copy of web code).
- **The BV POC components** (FeedCard, ChatBubble, PersonaSwitcher, …) — their RN
  mapping notes are in `UNISTYLES.md`; build them in-repo the same way.

# Bala Vihar Connect — UI kit

A **mobile-first** recreation of the Sankalp / Bala Vihar Connect attendance &
announcements app (source: the Bala Vihar Connect POC spec in the Chinmaya
Mission DFW source codebase). PWA-shaped: phone-width
shell, sticky app bar with a **global role switcher**, and a bottom tab bar.

## Run
Open `index.html`. Links root `styles.css` + `kit.css`, loads `_ds_bundle.js`, mounts the app.

## Screens (bottom tabs)
- **Register** — class attendance roster with present/absent marking, plus the loading / empty / error states. Switch to **Parent** to see the designed **permission-denied** state (data RLS-filtered server-side).
- **Feed** — scoped announcements + class updates with role badges and public/private comments.
- **Dashboard** — Coordinator session view / BV Coordinator org rollup; compliance bar; honest `—` placeholders for absent centers.
- **Admin** — user/role management with multi-persona badges and an audit-log trail.

## Role switcher
Tap the role pill (top-right) to switch active role — it re-scopes what each
screen shows (the whole point of the multi-persona model). Roles: Teacher,
Coordinator, BV Coordinator, Parent.

## DS components used
`RoleBadge`, `StatusChip`, `Button`, `StatTile` from `window.ChinmayaMissionDesignSystem_52eae1`.

## Notes
Recreation fixture — no real student data. It demonstrates the system's
distinguishing rule: every data surface draws the five required states, and
permission-denied is a *designed* state, not a dead end.

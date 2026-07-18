# Sankalp — Design Contract (DESIGN.md)

The brand contract for the **CMDFW Bala Vihar Connect** app. Exported from the
**Chinmaya Mission Design System**. This is the source of truth for *intent*;
`design-tokens.json` is the source of truth for *values*. Components must honor
both. (ADR-0010/0011.)

> Brand: **Chinmaya Mission DFW**. Voice: warm, reverent, plain — devotional but
> never stiff. No emoji; the ॐ glyph and OM mark are the only symbols.

---

## Non-negotiable rules

These are the rules the `/test` design check enforces (see `USAGE.md`). Break one
and the build fails review.

1. **One action color.** `color.accent` (terracotta `#b8531a`) is the *only*
   call-to-action color. `indigo` and `gold` are identity/atmosphere — poster
   grounds, festival highlights, halos — and must **never** be used as a second
   CTA or a primary button fill.
2. **No hardcoded brand hex.** Every color, space, radius, and font comes from
   `theme.*` (native) or `var(--*)` (web). Never inline a hex a token covers.
3. **Status ramp means one thing each.** present / absent / excused / info map
   1:1 to `color.status.*`. Don't reuse a status hue decoratively.
4. **Role hues are data-only.** The six role hues (`color.role.*`) code personas
   in badges/chips/legends. Never a page background, never an action.
5. **Marcellus is single-weight (400).** Hierarchy comes from **size + color**,
   never synthetic bold. For body emphasis switch the Mukta family
   (`fonts.medium` / `fonts.semibold`), never `fontWeight` on display text.
6. **Type roles never mix by accident.** Marcellus = display & identity (screen
   titles, event names, display numerals). Mukta = all UI, body, and Devanagari.
   JetBrains Mono (tabular) = counts, IDs, scope labels, timestamps. Never set
   body or buttons in the serif.

---

## Visual foundations

- **Canvas.** Warm-paper background (`bg #f7f1e6`); app canvas is slightly cooler
  (`app.canvas #f4eee1`). Cards lift to `surface` / `app.surface`. Dark grounds
  (posters, notify bands) use `indigo` or near-black `ink`, lit with soft gold /
  terracotta radial glows at the corners.
- **Cards & shape.** `surface` fill + hairline `line` border + the signature
  radius. Editorial cards use 18px (`radius.lg`); app cards are tighter at 14px
  (`radius.card`). Pills/badges/buttons are fully capsule (`radius.pill 999`).
- **Shadows.** Warm-tinted, never neutral gray. Rest → hover lift. Floating
  posters use the deep indigo-tinted poster shadow.
- **Hover / press.** Buttons darken (`accent → accentPressed`) and lift
  `translateY(-1px)` with a colored shadow; cards lift `-2/-3px` and gain a
  terracotta border. Tabs/pills fill with `ink` when active.
- **Motion.** Restrained — `motion.ease` (cubic-bezier(.2,.7,.2,1)), 150–250ms,
  fades and short slides. One decisive flourish per screen. Honor
  `prefers-reduced-motion`.
- **Layout.** Mobile-first. Phone column maxes at `chrome.maxw 440`; desktop
  dashboard at `chrome.deskw 1180`. Bottom tab bar on phone (`chrome.tabbar 64`),
  header `chrome.header 56`. ≥44px (`chrome.hitMin`) touch targets. No horizontal
  scroll at 360 / 768 / 1024 / 1440.

## Imagery & marks

- Portraits of Gurudev sit on a soft gold radial **halo with `multiply` blend** so
  the paper shows through — never a hard crop or drop shadow.
- Missing poster art → the token-built placeholder (indigo→terracotta gradient +
  a faint, hue-shifted OM). Never stock photos.
- **Icons:** inline stroked SVGs, ~1.8px stroke, `currentColor`. Copy from the
  design system's `icons.jsx`; match the weight (Lucide / Feather are the closest
  CDN fallbacks — flag any substitution). No emoji, no unicode-symbol icons
  beyond ॐ.

---

## Token map (design-tokens.json → theme)

| Group | Keys | Notes |
|---|---|---|
| `color` (v1 aliases) | `bg` `accent` `brand` `status.*` `role.*` | Stable od-design-tokens/v1 contract. `accent`=terracotta, `brand`=gold. |
| `color` (brand ramp) | `ink/2/3/4` `line/2` `surface` `indigo` `gold` `primary*` | Full editorial palette. |
| `color.status` | present/absent/excused/info + `Soft`/`Line` | Functional ramp. |
| `color.role` | student parent teacher coordinator bv admin | Six persona hues. |
| `color.app` | canvas surface surface2 overlay scope.* chat* private* | App layer. |
| `space` | 1–16 + xs/sm/md/lg/xl | 4px base step. |
| `radius` | sm md lg control card bubble pill | |
| `font` | display body medium semibold bold mono | RN family names. |
| `type` | body display scale.* leading.* tracking.* | |
| `motion` | fast base ease | |
| `chrome` | header tabbar gutter maxw deskw hitMin | Fixed app chrome. |

Edit values in `design-tokens.json`, then `npm run gen:theme` to regenerate
`lib/theme.ts`. Never hand-tune the generated file.

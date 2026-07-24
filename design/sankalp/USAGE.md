# Sankalp — Usage & Definition of Done (USAGE.md)

The enforceable checklist a component or screen must pass before it merges. Per
ADR-0010, this becomes `.claude/rules/design-system.md` and is run by `/test`'s
design check. Every item is objective and greppable.

## Tokens

- [ ] **No hardcoded brand hex, spacing, or radius.** All values read from
      `theme.*` (native) or `var(--*)` (web). A raw `#rrggbb` in a component that
      matches a token value is a failure.
- [ ] **`gen:theme` is the only writer of `lib/theme.ts`.** The file carries the
      GENERATED header; no hand edits.
- [ ] **od-design-tokens/v1 taxonomy is intact.** `design-tokens.json` still
      exposes `color.bg/accent/brand/status/role`, `space/radius/type/motion`.

## Color discipline

- [ ] Exactly **one** action color in view — `accent` (terracotta). No indigo or
      gold button fills / links-as-CTA.
- [ ] Status colors used only for their one meaning (present/absent/excused/info).
- [ ] Role hues appear only in data coding (badges/chips/legends), never as a page
      background or action.

## Type

- [ ] Display text (Marcellus) never receives `fontWeight` — hierarchy is size +
      color only.
- [ ] Body emphasis uses `fonts.medium` / `fonts.semibold`, not `fontWeight`.
- [ ] Serif is display/identity only; body and controls are Mukta; counts/IDs/
      timestamps are JetBrains Mono with tabular-nums.

## Layout & touch

- [ ] Touch targets ≥ 44px (`chrome.hitMin`).
- [ ] No horizontal scroll at 360 / 768 / 1024 / 1440.
- [ ] Phone column ≤ `chrome.maxw` (440); desktop dashboard ≤ `chrome.deskw` (1180).

## The four required states

Every data-bearing surface implements all four. Copy stays calm and honest and
preserves the user's work. **No permission-denied state** — navigation is
role-derived and out-of-scope routes redirect home instead of rendering a denial
screen (ADR-0014).

- [ ] **Loading** — skeletons or a calm spinner; never a blank flash.
- [ ] **Empty** — a reassuring line, e.g. *"Nothing here yet."* Not an error tone.
- [ ] **Error** — recoverable, honest, offers a retry. Never blames the user.
- [ ] **Content** — the real data, once loaded.

## Motion & accessibility

- [ ] Transitions use `motion.ease` at 150–250ms; one flourish per screen max.
- [ ] `prefers-reduced-motion` honored (no essential info conveyed by motion only).
- [ ] Color is never the sole carrier of meaning (pair status hue with a label/icon).

## Voice

- [ ] Sentence case for headings and buttons; uppercase only for tiny tracked
      eyebrows.
- [ ] No emoji. ॐ and the OM mark are the only symbols. Romanize Sanskrit on first
      use.
- [ ] Utility copy reassures and preserves work; no jargon leaks to parents/students.

# Plan — System: sankalp-component-kit

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended — this item has zero cross-file coupling, see Shared seam) or `superpowers:executing-plans` to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the full Sankalp design-kit component surface (8 `core/*` + `brand/EventDateBlock` + 17 `bv-connect/components/**` domain components) plus two new primitives (`ListRow`, `StateView`) into typed, theme-token-only, unit-tested RN/TS components under `components/`, per ADR-0029 and the `/design`-validated spec at `sankalp-component-kit.md`.

**Architecture:** Every component is presentational and prop-driven — no Supabase, no RLS, no privileged operations (`client-privacy.md`). Each component's non-trivial **prop→derived-value contract** (which variant maps to which token, which prop combination yields which visible branch) is extracted into a colocated pure `.ts` module and TDD'd with `vitest`, matching this repo's established pure-logic-boundary convention (`components/brand/logoTitleFontSize.ts`, `components/appHeaderSubtitle.ts`). The JSX/TSX render itself is wiring — ported from the already-approved `design/sankalp/**` reference `.jsx` + `.d.ts`, verified visually via the `app/(dev)/kit-gallery.tsx` harness at `/test` (`playwright-cli`), not by a component-render unit test (this repo has no `@testing-library/react-native` harness — see Testing strategy below).

**Tech Stack:** Expo (RN + RN-Web) · TypeScript · `react-native-unistyles@3` (`lib/theme.ts`, generated, do not hand-edit) · `vitest` (existing config, `node` environment, `react-native`/`expo-secure-store` aliased to mocks) · `expo-router` (dev-only `(dev)` route group) · `playwright-cli` for visual/DoD verification.

## Global Constraints (from spec + USAGE.md DoD — every task implicitly includes these)

- Style exclusively via `theme.*` tokens from `lib/theme.ts` — **no hardcoded hex, spacing, or radius literals** anywhere in a component `.tsx` file (AC#2).
- Four states only — loading / empty / error-preserving / content — **no fifth "permission-denied" state** (ADR-0014; already patched into `USAGE.md`/`design-system` skill/`.claude/rules/design-system.md`).
- ≥44px touch targets (`theme.chrome.hitMin`); no horizontal scroll at 360/768/1024/1440; `fontVariant: ['tabular-nums']` on any compared/counted number; exactly one primary `accent` action per composed view; `brand`/saffron (`theme.colors.gold`) is identity-only, never a competing CTA; display serif (`theme.fonts.display`) for showcase/identity only, never body or buttons.
- No Supabase client calls, no data fetching, no privileged operations inside `components/**` for this item (AC#6). `ConsentCapture`/`AuditEntry`/`UserRoleRow`/`CsvImport` accept all data via props only, never log PII (AC#10, edge cases).
- Every component must render correctly on both RN-Web and native Expo (AC#11) — no web-only APIs (`window`, raw `<div>`/CSS strings) in the ported `.tsx`.
- `RoleBadge`/`PersonaSwitcher`/`MagicLinkLogin` ship as independent primitives; `components/AppHeader.tsx`, `components/RoleSwitcher.tsx`, `app/(auth)/sign-in.tsx` are **not touched** in this item (ADR-0029, out of scope).
- **Marcellus (display font) is single-weight** — never pass `fontWeight` alongside `theme.fonts.display`; use `theme.fonts.medium`/`.semibold`/`.bold` (Mukta) for body/label emphasis instead (`UNISTYLES.md`).
- Every `.tsx` file with a module-scope `StyleSheet.create()` needs the direct `import "../../lib/unistyles"` (or correct relative depth) per issue #29 / `scripts/check-unistyles-config.js` — same pattern as `Logo.tsx`/`AppHeader.tsx`. Forgetting this fails `app-tests` CI (F30 precedent).

---

## Already done (do not re-task)

- **AC#7 doc patches** — `design/sankalp/USAGE.md` and `.claude/skills/design-system/SKILL.md` are already patched (four-state language, no permission-denied) as part of the `/design` pass; `git diff` on both files shows the completed patch in the working tree. Nothing to do here.
- **ADR-0029** recorded and Closed; `.docs/adr/README.md` index updated.
- Design mirror confirmed current — no `DesignSync` refresh needed; all 27 `.jsx`/`.d.ts`/`.prompt.md` triples exist under `design/sankalp/components/{core,brand}/**` and `design/sankalp/bv-connect/components/**`.

## Testing strategy (plan-level decision — not architecturally significant, no bounce to `/architect`)

Spec AC#9 explicitly deferred "exact test/demo mechanism" to `/design` + `/plan`. Decision: **extend the repo's existing pure-logic-boundary TDD convention** (documented in `client-auth-session-and-nav.plan.md`'s Shared seam — this repo has no React/RN component-render harness; `vitest.config.ts` runs in `node` with `react-native` aliased to a mock) to every kit component:

- Each component that has a real prop→derived-value contract (a variant/status/role lookup table, a threshold-derived tone, a normalize/format function, a visibility branch) gets a colocated `<Component>.logic.ts` pure module, red-then-green `vitest` unit tested against every documented variant in its `.d.ts` JSDoc. This is what satisfies AC#9's "render/variant/prop-contract level" unit test for that component.
- A small number of components have **no** real derived logic (`PushPermissionPrompt`, `MessageComposer`, `ListRow`) — pure prop pass-through, same shape as the already-shipped `Logo.tsx`. For these, AC#9 is satisfied by the `kit-gallery` + `playwright-cli` visual/variant pass at `/test` only, same as `Logo.tsx`'s precedent (no fabricated logic module).
- The `.tsx` render/JSX itself is **wiring** — verified by hand at `/build` (does it render, does it match the reference) and again at `/test` via `playwright-cli` screenshots of `kit-gallery` against `design/sankalp/**`'s reference — not by a component-render unit test.
- `vitest.config.ts` already includes `'components/**/__tests__/**/*.test.ts'` (added in Stage 12 of `client-auth-session-and-nav.plan.md`) — **no config change needed.**

## Token-mapping reference (build once, use for every port below)

The `design/sankalp/**` reference `.jsx` files style via CSS custom properties (`var(--x)`); the generated `lib/theme.ts` (Unistyles) has different, sometimes differently-shaped keys. Get this mapping wrong in one file and AC#2/AC#11 both fail. Two gotchas below are the ones most likely to bite:

| CSS var (`.jsx` reference) | `theme.*` (RN target) | Note |
|---|---|---|
| `--ink` / `--ink-2` / `--ink-3` / `--ink-4` | `colors.ink` / `.ink2` / `.ink3` / `.ink4` | |
| `--line` / `--line-2` | `colors.line` / `.line2` | |
| `--surface` / `--surface-alt` / `--bg-cream` | `colors.surface` / `.surfaceAlt` / `.bgCream` | |
| `--app-surface` / `--app-surface-2` | `colors.appSurface` / `.appSurface2` | different from `--surface` — app-layer vs. marketing-layer token, keep them distinct |
| `--primary` / `--primary-2` / `--primary-soft` | `colors.primary` / `.primaryPressed` / `.primarySoft` | |
| `--indigo` / `--indigo-2` | `colors.indigo` / `.indigo2` | |
| `--gold` / `--gold-2` / `--gold-light` | `colors.gold` / `.gold2` / `.goldLight` | |
| `--on-dark` | `colors.onDark` | |
| `--success` | `colors.status.present` (soft/line: `colors.statusRamp.presentSoft` / `.presentLine`) | CSS names it "success", theme names it "present" — attendance-domain naming reused for generic tone |
| `--warning` | `colors.status.excused` (`statusRamp.excusedSoft` / `.excusedLine`) | |
| `--danger` | `colors.status.absent` (`statusRamp.absentSoft` / `.absentLine`) | |
| `--info` | `colors.status.info` (`statusRamp.infoSoft` / `.infoLine`) | |
| `--role-student/parent/teacher/coordinator/admin/bv` | **`colors.roles.*`** (plural) | **Gotcha:** `theme.ts` has *two* role maps — `colors.role` (singular, 5 keys, **no `bv`**) and `colors.roles` (plural, 6 keys, has `bv`). Any component touching the `bv_coordinator` hue (`RoleBadge`, `Comment`, `ConversationRow`, `PersonaSwitcher`, `UserRoleRow`) **must** use `colors.roles.*`, never `colors.role.*` — the singular map will silently omit BV Coordinator and TypeScript won't catch it if you only test the other 5 roles. |
| `--rad-pill` / `--app-rad-pill` | `radius.pill` | |
| `--rad-lg` | `radius.lg` | |
| `--rad` / `--app-rad-control` | `radius.control` | |
| `--app-rad-card` | `radius.card` | |
| `--app-rad-bubble` | `radius.bubble` | |
| `--chat-out` / `--chat-out-ink` / `--chat-in` / `--chat-in-ink` / `--chat-in-line` / `--chat-unread` | `colors.chatOut` / `.chatOutInk` / `.chatIn` / `.chatInInk` / `.chatInLine` / `.chatUnread` | |
| `--private` / `--private-soft` / `--private-line` | `colors.private` / `.privateSoft` / `.privateLine` | |
| `--scope-org/center/class` | `colors.scope.org` / `.center` / `.class` | |
| `--hit-min` | `chrome.hitMin` | |
| `--sans` / `--serif` / `--mono` | `fonts.body` / `fonts.display` / `fonts.mono` | |
| `--shadow-sm` / `--shadow-lg` / `--app-shadow-row` / `--app-shadow-card` | **no token exists** | RN has no CSS `box-shadow`. Use platform shadow props (`shadowColor: theme.colors.ink, shadowOpacity: 0.08–0.16, shadowOffset, shadowRadius` on iOS/web; `elevation` on Android) — `shadowColor` still comes from `theme.colors.ink`, so AC#2 holds. |
| `transition: "..."` (any CSS transition) | **no RN equivalent** | RN has no CSS `transition`. Drop it — render the final-state styles only. Animation is explicitly future/gamification scope via Moti (`.claude/rules/motion.md`), not this item. `Card`'s `interactive` hover-lift is a **web-only, non-blocking enhancement** (`Pressable`'s `style` callback or a plain `onHoverIn`/`onHoverOut` on web) — do not block a task on getting it pixel-perfect on native, where there is no hover concept. |
| `#e8c597` (`StatusChip` "soon" border, raw hex, no var) | `colors.primarySoft` | Reference `.jsx` itself hardcodes this one value with no CSS var — closest existing token substituted to hold AC#2. Flag at `/test` playwright pass if visually off; not a blocker. |
| `#efe8db` (`StatusChip` "past" bg, raw hex, no var) | `colors.surfaceAlt` | Same reasoning as above. |
| `#fbf3df` (`StatusChip` "featured" fg, raw hex, no var) | `colors.onAction` | Exact value match — `theme.colors.onAction === "#fbf3df"`, no substitution needed. |

---

## File manifest

| Domain | Files (new unless noted) |
|---|---|
| core | `components/core/{Button,Card,Field,StatusChip,StatTile,SegmentedTabs,Stepper,RoleBadge}.tsx` + paired `.logic.ts`/`__tests__/*.test.ts` (Stepper's clamp logic only) |
| core (new) | `components/core/ListRow.tsx`, `components/core/StateView.tsx` + `StateView.logic.ts`/`__tests__/StateView.logic.test.ts` |
| brand | `components/brand/EventDateBlock.tsx` + `.logic.ts`/test |
| comments | `components/comments/{CommentThread,Comment,CommentComposer}.tsx` + logic/tests |
| privacy | `components/privacy/{AuditEntry,ConsentCapture}.tsx` + logic/tests |
| chat | `components/chat/{ConversationRow,ChatBubble,MessageComposer}.tsx` + logic/tests (MessageComposer: no logic module) |
| admin | `components/admin/{CsvImport,UserRoleRow}.tsx` + logic/tests |
| navigation | `components/navigation/PersonaSwitcher.tsx` + logic/test |
| dashboard | `components/dashboard/{ComplianceBar,CenterRollupRow}.tsx` + logic/tests |
| feed | `components/feed/FeedCard.tsx` + logic/test |
| notifications | `components/notifications/{NotificationItem,PushPermissionPrompt}.tsx` + logic/test (PushPermissionPrompt: no logic module) |
| auth | `components/auth/MagicLinkLogin.tsx` + logic/test |
| harness | `app/(dev)/kit-gallery.tsx` (new); `app/_layout.tsx` (modify — register `(dev)` route) |

## Shared seam

**No serialized gate — this item touches zero schema/RLS/migration.** **Addendum (post-build, recorded during `/build`'s Stage 14 final review):** this section's original zero-coupling claim did not hold as built. Several domain components deliberately compose core primitives instead of re-inlining their layout/markup — `ConversationRow`, `UserRoleRow`, `CenterRollupRow`, `NotificationItem` build on `core/ListRow`; `FeedCard` composes `core/Card` + `core/RoleBadge`; `PushPermissionPrompt` composes `core/Card` + `core/Button`. This is better engineering than the originally-assumed independence (it avoids re-deriving row-layout/card/badge markup 8 times) but means the 12 domain stages are **not** actually mutually independent at the file level — each one that composes a core primitive has a real compile-time dependency on that primitive already existing. Two same-domain reuse cases also exist as designed: `CommentThread`→`Comment` and `CenterRollupRow.logic.ts`→`ComplianceBar.logic.ts`'s exports; plus the explicitly-sanctioned `MagicLinkLogin`→`Logo` (#17) case.

**Recommended execution order for a single engineer (now a real dependency, not just a recommendation):** Stage 1 (core) → Stage 3 (new primitives) → Stages 4–12 (domain, any order — each domain stage may depend on Stage 1/3 primitives already existing, but not on any other domain stage) → Stage 13 (gallery + route) → Stage 14 (full verification). A parallel/worktree execution strategy must land Stage 1 and Stage 3 first, serialized ahead of Stages 4–12, rather than treating all 12 domain stages plus core as one fully-parallel batch.

**Branch:** current branch `ssrinivas90/issue-18-sankalp-component-kit`, cut from `origin/main`. Single item, no worktree required for a solo build; if using `subagent-driven-development` with multiple parallel workers, each domain stage is small enough to run as an independent subagent task against this same branch (file-disjoint, no lock contention).

---

## Stage 1 — `core/*` (8 primitives)

### Task 1.1 — `Button`

**Files:**
- Create: `components/core/Button.logic.ts`, `components/core/__tests__/Button.logic.test.ts`
- Create: `components/core/Button.tsx`

**Interfaces:**
- Produces: `export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "gold" | "danger" | "dark";`, `export type ButtonSize = "sm" | "md" | "lg" | "xl";`, `export function resolveButtonMode(href?: string, disabled?: boolean): "link" | "button"`

- [ ] **Step 1: Write the failing test** `components/core/__tests__/Button.logic.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { resolveButtonMode, BUTTON_VARIANTS, BUTTON_SIZES } from '../Button.logic';

describe('resolveButtonMode', () => {
  it('renders as a link only when href is set and not disabled', () => {
    expect(resolveButtonMode('/x', false)).toBe('link');
  });
  it('falls back to button when disabled, even with href', () => {
    expect(resolveButtonMode('/x', true)).toBe('button');
  });
  it('falls back to button when no href', () => {
    expect(resolveButtonMode(undefined, false)).toBe('button');
  });
});

describe('BUTTON_VARIANTS contract', () => {
  it('defines all 7 documented variants', () => {
    expect(Object.keys(BUTTON_VARIANTS).sort()).toEqual(
      ['danger', 'dark', 'ghost', 'gold', 'outline', 'primary', 'secondary'].sort()
    );
  });
});

describe('BUTTON_SIZES contract', () => {
  it('defines all 4 documented sizes', () => {
    expect(Object.keys(BUTTON_SIZES).sort()).toEqual(['lg', 'md', 'sm', 'xl'].sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run components/core/__tests__/Button.logic.test.ts` — Expected: FAIL, `Button.logic` not found.

- [ ] **Step 3: Implement** `components/core/Button.logic.ts`
```typescript
export type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "gold" | "danger" | "dark";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

// Token keys only — Button.tsx resolves these against `theme.colors`/`theme.space` at render time.
export const BUTTON_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary:   { bg: 'primary',   fg: 'onAction',  border: 'transparent' },
  secondary: { bg: 'surface',   fg: 'ink',       border: 'line2' },
  ghost:     { bg: 'transparent', fg: 'ink',     border: 'line2' },
  outline:   { bg: 'transparent', fg: 'onDark',  border: 'onDark' },
  gold:      { bg: 'gold',      fg: 'ink',       border: 'transparent' },
  danger:    { bg: 'status.absent', fg: 'onAction', border: 'transparent' },
  dark:      { bg: 'ink',       fg: 'onDark',    border: 'transparent' },
};

export const BUTTON_SIZES: Record<ButtonSize, { paddingX: number; paddingY: number; fontSize: 'xs' | 'sm' | 'body' }> = {
  sm: { paddingX: 16, paddingY: 9, fontSize: 'xs' },
  md: { paddingX: 18, paddingY: 11, fontSize: 'sm' },
  lg: { paddingX: 24, paddingY: 14, fontSize: 'sm' },
  xl: { paddingX: 30, paddingY: 16, fontSize: 'body' },
};

export function resolveButtonMode(href?: string, disabled?: boolean): 'link' | 'button' {
  return href && !disabled ? 'link' : 'button';
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run components/core/__tests__/Button.logic.test.ts` — Expected: PASS (4 tests).

- [ ] **Step 5: Implement the render** `components/core/Button.tsx` — port `design/sankalp/components/core/Button.jsx` to a `Pressable`-based RN component. Props type verbatim from `design/sankalp/components/core/Button.d.ts` (`ButtonProps`, translating `React.MouseEvent`→`GestureResponderEvent`, `React.CSSProperties`→`StyleProp<ViewStyle>`). On web, `resolveButtonMode() === 'link'` should still render a `Pressable` (RN-Web has no native anchor semantics without `react-native-web`'s `href`/`hrefAttrs` props on `Pressable`, which *are* supported — pass `href` through when in link mode). Style via `StyleSheet.create((theme) => ...)` resolving `BUTTON_VARIANTS[variant]`/`BUTTON_SIZES[size]` token-key strings against `theme.colors`/`theme.space`/`theme.type.scale`; `minHeight: theme.chrome.hitMin`; `borderRadius: theme.radius.pill`; `opacity: disabled ? 0.5 : 1`; `width: fullWidth ? '100%' : undefined`. Follow the `Logo.tsx`/`AppHeader.tsx` pattern for the direct `lib/unistyles` import. No `transition` (dropped per token-mapping table).

- [ ] **Step 6: Add to gallery harness** — placeholder note only; the actual `kit-gallery.tsx` entry is written in Stage 13 once every component exists. Record here: "Button: 7 variants × 4 sizes grid, one row per variant, disabled + `fullWidth` variants shown once each."

- [ ] **Step 7: Commit**
```bash
git add components/core/Button.tsx components/core/Button.logic.ts components/core/__tests__/Button.logic.test.ts
git commit -m "feat: port Button core primitive (sankalp-component-kit)"
```

### Task 1.2 — `Card`

**Files:** Create `components/core/Card.logic.ts` + test, `components/core/Card.tsx`.

**Interfaces:** Produces `export type CardTone = "surface" | "cream" | "indigo";`, `export function cardToneStyle(tone: CardTone): { bg: string; fg: string; border: string }`.

- [ ] **Step 1 (RED)** `components/core/__tests__/Card.logic.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { cardToneStyle } from '../Card.logic';

describe('cardToneStyle', () => {
  it('surface tone uses surface bg + ink fg + line border', () => {
    expect(cardToneStyle('surface')).toEqual({ bg: 'surface', fg: 'ink', border: 'line' });
  });
  it('cream tone uses bgCream bg', () => {
    expect(cardToneStyle('cream')).toEqual({ bg: 'bgCream', fg: 'ink', border: 'line' });
  });
  it('indigo tone flips fg to onDark and borders with indigo2', () => {
    expect(cardToneStyle('indigo')).toEqual({ bg: 'indigo', fg: 'onDark', border: 'indigo2' });
  });
});
```
- [ ] **Step 2** Run, confirm FAIL.
- [ ] **Step 3 (GREEN)** `components/core/Card.logic.ts`
```typescript
export type CardTone = "surface" | "cream" | "indigo";

export function cardToneStyle(tone: CardTone): { bg: string; fg: string; border: string } {
  switch (tone) {
    case 'cream': return { bg: 'bgCream', fg: 'ink', border: 'line' };
    case 'indigo': return { bg: 'indigo', fg: 'onDark', border: 'indigo2' };
    default: return { bg: 'surface', fg: 'ink', border: 'line' };
  }
}
```
- [ ] **Step 4** Run, confirm PASS.
- [ ] **Step 5** Implement `components/core/Card.tsx` porting `Card.jsx`'s `View`-wrapper (RN has no polymorphic `as` tag the way the web reference does — drop the `as` prop, always render `View`, note the divergence in a one-line comment referencing this task) with `padding` prop (default 24), `borderRadius: theme.radius.lg`. `interactive` hover-lift: web-only via `Pressable`'s `style` function reading `pressed`/hover pseudo-state is not applicable to hover — use `onHoverIn`/`onHoverOut` (RN-Web supports these on `Pressable`) to toggle a local `hover` boolean state, applying `transform: [{ translateY: -3 }]` + `borderColor: theme.colors.primary` when true; native ignores hover events entirely (no-op, not a bug). Shadow: `shadowColor: theme.colors.ink, shadowOpacity: 0.08, shadowOffset: {width:0,height:2}, shadowRadius: 6` (web/iOS) + `elevation: 2` (Android).
- [ ] **Step 6** Gallery note: "Card: 3 tones × interactive on/off, one example each."
- [ ] **Step 7 Commit** `git add components/core/Card.tsx components/core/Card.logic.ts components/core/__tests__/Card.logic.test.ts && git commit -m "feat: port Card core primitive (sankalp-component-kit)"`

### Task 1.3 — `Field`

**Files:** Create `components/core/Field.logic.ts` + test, `components/core/Field.tsx`.

**Interfaces:** Produces `export function fieldControlMeta(as: "input"|"textarea"|"select", hasError: boolean): { minHeight: number; borderTokenKey: string; multiline: boolean }`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { fieldControlMeta } from '../Field.logic';

describe('fieldControlMeta', () => {
  it('textarea gets a taller reserved minHeight and is multiline', () => {
    expect(fieldControlMeta('textarea', false)).toEqual({ minHeight: 96, borderTokenKey: 'line2', multiline: true });
  });
  it('input/select use hitMin height and are single-line', () => {
    expect(fieldControlMeta('input', false)).toEqual({ minHeight: 44, borderTokenKey: 'line2', multiline: false });
    expect(fieldControlMeta('select', false)).toEqual({ minHeight: 44, borderTokenKey: 'line2', multiline: false });
  });
  it('error presence switches the border token to the danger tone, any `as`', () => {
    expect(fieldControlMeta('input', true).borderTokenKey).toBe('status.absent');
  });
});
```
- [ ] **Step 2** Run, confirm FAIL.
- [ ] **Step 3 (GREEN)** `components/core/Field.logic.ts`
```typescript
export type FieldAs = "input" | "textarea" | "select";

export function fieldControlMeta(as: FieldAs, hasError: boolean): { minHeight: number; borderTokenKey: string; multiline: boolean } {
  return {
    minHeight: as === 'textarea' ? 96 : 44, // 44 === theme.chrome.hitMin; Field.tsx reads the real token, this fixture pins the documented value
    borderTokenKey: hasError ? 'status.absent' : 'line2',
    multiline: as === 'textarea',
  };
}
```
- [ ] **Step 4** Run, confirm PASS.
- [ ] **Step 5** Implement `components/core/Field.tsx` — `as="select"` has no native RN equivalent to an HTML `<select>`; for this port, render `as="select"` as a read-only-styled `View` wrapping `children` (the reference passes `<option>` children — RN has no such primitive). Document in a code comment that a real native picker (`@react-native-picker/picker` or a custom sheet) is a *future* concern for whichever feature first needs a real dropdown — out of scope here (matches `ListRow`'s edge case reasoning: this kit ships the contract, not every possible native widget). `uppercase` toggles `textTransform: 'uppercase'` + `theme.type.tracking.eyebrow` letter-spacing on the label `Text`. Error message renders in a permanently-reserved-height slot (`minHeight: theme.type.scale.xs * theme.type.leading.body`) so layout never jumps, colored `theme.colors.status.absent`.
- [ ] **Step 6** Gallery note: "Field: input default / textarea / select / error state / required, one column."
- [ ] **Step 7 Commit**

### Task 1.4 — `StatusChip`

**Files:** Create `components/core/StatusChip.logic.ts` + test, `components/core/StatusChip.tsx`.

**Interfaces:** Produces `export type StatusChipStatus = "open"|"soon"|"past"|"featured"|"present"|"absent"|"excused"|"info"|"neutral";`, `export function statusChipStyle(status: StatusChipStatus): {bg:string; fg:string; border:string; dot:string}`, `export function statusChipShowsDot(status: StatusChipStatus, dot?: boolean): boolean`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { statusChipStyle, statusChipShowsDot, STATUS_CHIP_KEYS } from '../StatusChip.logic';

describe('STATUS_CHIP_KEYS contract', () => {
  it('covers all 9 documented statuses', () => {
    expect(STATUS_CHIP_KEYS.sort()).toEqual(
      ['absent', 'excused', 'featured', 'info', 'neutral', 'open', 'past', 'present', 'soon'].sort()
    );
  });
});

describe('statusChipStyle', () => {
  it('open and present share the success-family tone', () => {
    expect(statusChipStyle('open')).toEqual(statusChipStyle('present'));
    expect(statusChipStyle('present').fg).toBe('status.present');
  });
  it('soon uses the primary-soft family (no matching token for its raw-hex border, substitutes primarySoft)', () => {
    expect(statusChipStyle('soon')).toEqual({ bg: 'primarySoft', fg: 'primaryPressed', border: 'primarySoft', dot: 'primary' });
  });
  it('featured uses gold fill with onAction text (exact hex match, no substitution)', () => {
    expect(statusChipStyle('featured')).toEqual({ bg: 'gold', fg: 'onAction', border: 'gold2', dot: 'onAction' });
  });
  it('neutral is the default fallback for an unrecognized status', () => {
    // @ts-expect-error deliberately invalid to prove the fallback branch
    expect(statusChipStyle('bogus')).toEqual(statusChipStyle('neutral'));
  });
});

describe('statusChipShowsDot', () => {
  it('defaults on for open/present when dot is unset', () => {
    expect(statusChipShowsDot('open', undefined)).toBe(true);
    expect(statusChipShowsDot('present', undefined)).toBe(true);
  });
  it('defaults off for any other status when dot is unset', () => {
    expect(statusChipShowsDot('info', undefined)).toBe(false);
  });
  it('an explicit dot prop always wins over the default', () => {
    expect(statusChipShowsDot('info', true)).toBe(true);
    expect(statusChipShowsDot('open', false)).toBe(false);
  });
});
```
- [ ] **Step 2** Run, confirm FAIL.
- [ ] **Step 3 (GREEN)** `components/core/StatusChip.logic.ts`
```typescript
export type StatusChipStatus = "open" | "soon" | "past" | "featured" | "present" | "absent" | "excused" | "info" | "neutral";
export const STATUS_CHIP_KEYS: StatusChipStatus[] = ['open', 'soon', 'past', 'featured', 'present', 'absent', 'excused', 'info', 'neutral'];

type ChipStyle = { bg: string; fg: string; border: string; dot: string };

const STYLES: Record<StatusChipStatus, ChipStyle> = {
  open:     { bg: 'statusRamp.presentSoft', fg: 'status.present', border: 'statusRamp.presentLine', dot: 'status.present' },
  present:  { bg: 'statusRamp.presentSoft', fg: 'status.present', border: 'statusRamp.presentLine', dot: 'status.present' },
  soon:     { bg: 'primarySoft', fg: 'primaryPressed', border: 'primarySoft', dot: 'primary' },
  excused:  { bg: 'statusRamp.excusedSoft', fg: 'status.excused', border: 'statusRamp.excusedLine', dot: 'status.excused' },
  absent:   { bg: 'statusRamp.absentSoft', fg: 'status.absent', border: 'statusRamp.absentLine', dot: 'status.absent' },
  info:     { bg: 'statusRamp.infoSoft', fg: 'status.info', border: 'statusRamp.infoLine', dot: 'status.info' },
  past:     { bg: 'surfaceAlt', fg: 'ink3', border: 'line2', dot: 'ink4' },
  featured: { bg: 'gold', fg: 'onAction', border: 'gold2', dot: 'onAction' },
  neutral:  { bg: 'surface', fg: 'ink3', border: 'line', dot: 'ink4' },
};

export function statusChipStyle(status: StatusChipStatus): ChipStyle {
  return STYLES[status] ?? STYLES.neutral;
}

export function statusChipShowsDot(status: StatusChipStatus, dot?: boolean): boolean {
  return dot ?? (status === 'open' || status === 'present');
}
```
- [ ] **Step 4** Run, confirm PASS.
- [ ] **Step 5** Implement `components/core/StatusChip.tsx` — pill `View` (`borderRadius: theme.radius.pill`) with optional leading dot `View` (6px circle) + `Text` child, resolving `statusChipStyle(status)`'s token-path strings against `theme` (write a tiny local `resolveTokenPath(theme, path)` helper reused across every logic-driven component in this kit — e.g. `'statusRamp.presentSoft'.split('.').reduce((o,k)=>o[k], theme.colors)` — put it in `components/core/tokenPath.ts` since `StatusChip` is the first consumer, then reuse from `RoleBadge`/`AuditEntry`/etc. below instead of duplicating).

- [ ] **Step 5b — extract the shared token-path helper** `components/core/tokenPath.ts`
```typescript
import type { AppTheme } from '../../lib/theme';

// Several kit components resolve dotted token-path strings (e.g. "statusRamp.presentSoft")
// from their logic modules against theme.colors at render time, instead of importing theme
// inside a .logic.ts (which would break the .logic.ts files' zero-RN-dependency purity —
// see Testing strategy: pure modules must stay importable under the vitest RN mock).
export function colorAtPath(colors: AppTheme['colors'], path: string): string {
  return path.split('.').reduce<any>((node, key) => node?.[key], colors) ?? colors.ink;
}
```
with a companion test `components/core/__tests__/tokenPath.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { colorAtPath } from '../tokenPath';
import { lightTheme } from '../../../lib/theme';

describe('colorAtPath', () => {
  it('resolves a nested dotted path', () => {
    expect(colorAtPath(lightTheme.colors, 'status.present')).toBe(lightTheme.colors.status.present);
  });
  it('resolves a top-level path', () => {
    expect(colorAtPath(lightTheme.colors, 'ink')).toBe(lightTheme.colors.ink);
  });
  it('falls back to ink for an unknown path instead of throwing', () => {
    expect(colorAtPath(lightTheme.colors, 'nope.nope')).toBe(lightTheme.colors.ink);
  });
});
```
Run this test first (RED, `tokenPath` doesn't exist), then add the implementation above (GREEN) — do this once, before Step 5, since `StatusChip` is its first consumer.

- [ ] **Step 6** Gallery note: "StatusChip: all 9 statuses, dot default + forced on/off for one status."
- [ ] **Step 7 Commit**

### Task 1.5 — `StatTile`

**Files:** `components/core/StatTile.logic.ts` + test, `components/core/StatTile.tsx`.
**Interfaces:** `export function statTileValueStyle(display?: boolean, accent?: boolean): { fontFamily: 'display'|'mono'; colorTokenKey: string }`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { statTileValueStyle } from '../StatTile.logic';

describe('statTileValueStyle', () => {
  it('default: mono font, ink color', () => {
    expect(statTileValueStyle(false, false)).toEqual({ fontFamily: 'mono', colorTokenKey: 'ink' });
  });
  it('display=true switches to the display (serif) font', () => {
    expect(statTileValueStyle(true, false).fontFamily).toBe('display');
  });
  it('accent=true colors the figure with the primary token regardless of display', () => {
    expect(statTileValueStyle(false, true).colorTokenKey).toBe('primary');
    expect(statTileValueStyle(true, true).colorTokenKey).toBe('primary');
  });
});
```
- [ ] **Step 2** FAIL.
- [ ] **Step 3 (GREEN)**
```typescript
export function statTileValueStyle(display?: boolean, accent?: boolean): { fontFamily: 'display' | 'mono'; colorTokenKey: string } {
  return { fontFamily: display ? 'display' : 'mono', colorTokenKey: accent ? 'primary' : 'ink' };
}
```
- [ ] **Step 4** PASS.
- [ ] **Step 5** Implement `StatTile.tsx` — `label` as uppercase eyebrow `Text` (`theme.type.scale.eyebrow`, `theme.type.tracking.eyebrow`), `value` as the resolved font/color, with `fontVariant: ['tabular-nums']` whenever `fontFamily === 'mono'` (numeric figures — global constraint).
- [ ] **Step 6** Gallery note: "StatTile: default / display / accent / display+accent, 4 tiles."
- [ ] **Step 7 Commit**

### Task 1.6 — `SegmentedTabs`

**Files:** `components/core/SegmentedTabs.logic.ts` + test, `components/core/SegmentedTabs.tsx`.
**Interfaces:** `export interface NormalizedTab { id: string; label: React.ReactNode; count?: number }`, `export function normalizeTab(t: string | TabItem): NormalizedTab`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { normalizeTab } from '../SegmentedTabs.logic';

describe('normalizeTab', () => {
  it('a bare string becomes {id, label} with the same value, no count', () => {
    expect(normalizeTab('Feed')).toEqual({ id: 'Feed', label: 'Feed', count: undefined });
  });
  it('a TabItem object passes id/label/count through unchanged', () => {
    expect(normalizeTab({ id: 'feed', label: 'Feed', count: 3 })).toEqual({ id: 'feed', label: 'Feed', count: 3 });
  });
});
```
- [ ] **Step 2** FAIL.
- [ ] **Step 3 (GREEN)**
```typescript
export interface TabItem { id: string; label: React.ReactNode; count?: number }
export interface NormalizedTab { id: string; label: React.ReactNode; count?: number }

export function normalizeTab(t: string | TabItem): NormalizedTab {
  return typeof t === 'string' ? { id: t, label: t, count: undefined } : { id: t.id, label: t.label, count: t.count };
}
```
Note: needs `import type * as React from 'react'` for the `TabItem`/`NormalizedTab` `React.ReactNode` field — acceptable in a `.logic.ts` (type-only import, erased at compile time, doesn't pull in the `react-native` runtime the vitest mock guards against).
- [ ] **Step 4** PASS.
- [ ] **Step 5** Implement `SegmentedTabs.tsx` — capsule `View` of `Pressable` segments, active segment ink-filled (`theme.colors.ink` bg, `theme.colors.onDark` text), inactive transparent; optional `count` renders as a small trailing badge, tabular-nums.
- [ ] **Step 6** Gallery note: "SegmentedTabs: string tabs, TabItem tabs with counts, 2 rows."
- [ ] **Step 7 Commit**

### Task 1.7 — `Stepper`

**Files:** `components/core/Stepper.logic.ts` + test, `components/core/Stepper.tsx`.
**Interfaces:** `export function clampStep(value: number, delta: number, min?: number, max?: number): number`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { clampStep } from '../Stepper.logic';

describe('clampStep', () => {
  it('increments freely when no bounds are set', () => {
    expect(clampStep(5, 1)).toBe(6);
  });
  it('does not go below min', () => {
    expect(clampStep(0, -1, 0)).toBe(0);
  });
  it('does not go above max', () => {
    expect(clampStep(10, 1, undefined, 10)).toBe(10);
  });
  it('clamps within both bounds', () => {
    expect(clampStep(2, 5, 0, 4)).toBe(4);
  });
});
```
- [ ] **Step 2** FAIL.
- [ ] **Step 3 (GREEN)**
```typescript
export function clampStep(value: number, delta: number, min?: number, max?: number): number {
  let next = value + delta;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
}
```
- [ ] **Step 4** PASS.
- [ ] **Step 5** Implement `Stepper.tsx` — label + hint slots, `-`/`+` `Pressable` buttons (≥`theme.chrome.hitMin` square) calling `onChange(clampStep(value, ±1, min, max))`, mono tabular-nums value display between them.
- [ ] **Step 6** Gallery note: "Stepper: default, min=0 clamped at 0, max=5 clamped at 5."
- [ ] **Step 7 Commit**

### Task 1.8 — `RoleBadge`

**Files:** `components/core/RoleBadge.logic.ts` + test, `components/core/RoleBadge.tsx`.
**Interfaces:** `export type RoleKey = "student"|"parent"|"teacher"|"coordinator"|"bv"|"admin";`, `export function roleBadgeMeta(role: RoleKey): { label: string; colorTokenKey: string }`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { roleBadgeMeta, ROLE_KEYS } from '../RoleBadge.logic';

describe('ROLE_KEYS contract', () => {
  it('covers all 6 personas', () => {
    expect(ROLE_KEYS.sort()).toEqual(['admin', 'bv', 'coordinator', 'parent', 'student', 'teacher'].sort());
  });
});

describe('roleBadgeMeta', () => {
  it('bv resolves to the BV Coordinator label and the plural roles.bv token path (not the singular role map, which lacks bv)', () => {
    expect(roleBadgeMeta('bv')).toEqual({ label: 'BV Coordinator', colorTokenKey: 'roles.bv' });
  });
  it('student resolves to the Student label', () => {
    expect(roleBadgeMeta('student')).toEqual({ label: 'Student', colorTokenKey: 'roles.student' });
  });
});
```
- [ ] **Step 2** FAIL.
- [ ] **Step 3 (GREEN)**
```typescript
export type RoleKey = "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";
export const ROLE_KEYS: RoleKey[] = ['student', 'parent', 'teacher', 'coordinator', 'bv', 'admin'];

const LABELS: Record<RoleKey, string> = {
  student: 'Student', parent: 'Parent', teacher: 'Teacher',
  coordinator: 'Coordinator', bv: 'BV Coordinator', admin: 'Admin',
};

export function roleBadgeMeta(role: RoleKey): { label: string; colorTokenKey: string } {
  return { label: LABELS[role], colorTokenKey: `roles.${role}` }; // always the plural map — see token-mapping gotcha
}
```
- [ ] **Step 4** PASS.
- [ ] **Step 5** Implement `RoleBadge.tsx` — pill with a small leading color dot (`colorAtPath(theme.colors, roleBadgeMeta(role).colorTokenKey)`) + label `Text` (override via `label` prop) + optional mono `scope` trailing text.
- [ ] **Step 6** Gallery note: "RoleBadge: all 6 roles, one with a scope label."
- [ ] **Step 7 Commit**

---

## Stage 2 — `brand/EventDateBlock`

**Files:** `components/brand/EventDateBlock.logic.ts` + test, `components/brand/EventDateBlock.tsx`.
**Interfaces:** `export type EventDateSize = "sm"|"md"|"lg";`, `export function eventDateFontSize(size: EventDateSize): number`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { eventDateFontSize } from '../EventDateBlock.logic';

describe('eventDateFontSize', () => {
  it('sm is 36', () => expect(eventDateFontSize('sm')).toBe(36));
  it('md is 44', () => expect(eventDateFontSize('md')).toBe(44));
  it('lg is 56 (also the documented default)', () => expect(eventDateFontSize('lg')).toBe(56));
});
```
- [ ] **Step 2** FAIL.
- [ ] **Step 3 (GREEN)**
```typescript
export type EventDateSize = "sm" | "md" | "lg";

export function eventDateFontSize(size: EventDateSize): number {
  return size === 'sm' ? 36 : size === 'md' ? 44 : 56;
}
```
- [ ] **Step 4** PASS.
- [ ] **Step 5** Implement `EventDateBlock.tsx` — vertical block: large `day` (mono/display per reference, `eventDateFontSize(size)`), small `month` (uppercase eyebrow), optional `year`. No current consumer (spec: "port for completeness"; flag with a one-line comment `// no app consumer yet — ported for full-library completeness per ADR-0029`).
- [ ] **Step 6** Gallery note: "EventDateBlock: sm/md/lg, with and without year."
- [ ] **Step 7 Commit**

---

## Stage 3 — New primitives: `ListRow`, `StateView`

### Task 3.1 — `ListRow`

No reference `.jsx` (net-new). No logic module — pure slot layout, same "no fabricated logic" call as `PushPermissionPrompt`/`MessageComposer` below; AC#9 coverage is the gallery + playwright pass.

**Files:** `components/core/ListRow.tsx`.

- [ ] **Step 1** Implement directly (no RED/GREEN — no derivable logic):
```tsx
import "../../lib/unistyles";
import { View, Text, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ReactNode } from "react";

export type ListRowProps = {
  leading: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
};

export default function ListRow({ leading, title, subtitle, trailing, onPress }: ListRowProps) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.row} onPress={onPress} accessibilityRole={onPress ? "button" : undefined}>
      <View style={styles.leading}>{leading}</View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"],
    minHeight: theme.chrome.hitMin,
    paddingVertical: theme.space["2"],
    paddingHorizontal: theme.space["3"],
  },
  // Deliberately no fixed width here (edge case: ListRow must accept the leading slot's
  // natural size, not hardcode a dimension — see spec edge cases) — callers size their own
  // avatar/icon/bar content; this wrapper only centers it.
  leading: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: theme.fonts.semibold, fontSize: theme.type.scale.sm, color: theme.colors.ink },
  subtitle: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.xs, color: theme.colors.ink3, marginTop: 2 },
  trailing: { flexShrink: 0, alignItems: "flex-end", justifyContent: "center" },
}));
```
- [ ] **Step 2** Gallery note: "ListRow: text-only leading (initial), icon leading, wide leading (mini-bar) — proves no fixed-width assumption."
- [ ] **Step 3 Commit** `git add components/core/ListRow.tsx && git commit -m "feat: add ListRow generic primitive (sankalp-component-kit)"`

### Task 3.2 — `StateView`

**Files:** `components/core/StateView.logic.ts` + test, `components/core/StateView.tsx`.
**Interfaces:** `export type ViewState = "loading"|"empty"|"error"|"content";`, `export function shouldShowRetry(state: ViewState, onRetry?: () => void): boolean`.

- [ ] **Step 1 (RED)**
```typescript
import { describe, it, expect } from 'vitest';
import { shouldShowRetry } from '../StateView.logic';

describe('shouldShowRetry', () => {
  it('shows retry only in the error state, and only when onRetry is provided', () => {
    expect(shouldShowRetry('error', () => {})).toBe(true);
  });
  it('hides retry in error state when onRetry is not passed (some errors have nothing to retry)', () => {
    expect(shouldShowRetry('error', undefined)).toBe(false);
  });
  it('never shows retry outside the error state, even with onRetry set', () => {
    expect(shouldShowRetry('loading', () => {})).toBe(false);
    expect(shouldShowRetry('empty', () => {})).toBe(false);
    expect(shouldShowRetry('content', () => {})).toBe(false);
  });
});
```
- [ ] **Step 2** FAIL.
- [ ] **Step 3 (GREEN)**
```typescript
export type ViewState = "loading" | "empty" | "error" | "content";

export function shouldShowRetry(state: ViewState, onRetry?: () => void): boolean {
  return state === 'error' && typeof onRetry === 'function';
}
```
- [ ] **Step 4** PASS.
- [ ] **Step 5** Implement `StateView.tsx` per the spec's exact API:
```tsx
import "../../lib/unistyles";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ReactNode } from "react";
import { shouldShowRetry, type ViewState } from "./StateView.logic";

export type StateViewProps = {
  state: ViewState;
  emptyText?: string;
  errorText?: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export default function StateView({ state, emptyText, errorText, onRetry, children }: StateViewProps) {
  if (state === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#b8531a" />
      </View>
    );
  }
  if (state === "empty") {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>{emptyText}</Text>
      </View>
    );
  }
  if (state === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>{errorText}</Text>
        {shouldShowRetry(state, onRetry) ? (
          <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create((theme) => ({
  center: { alignItems: "center", justifyContent: "center", padding: theme.space["6"], gap: theme.space["3"] },
  copy: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.sm, color: theme.colors.ink3, textAlign: "center" },
  retry: { minHeight: theme.chrome.hitMin, paddingHorizontal: theme.space["4"], borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  retryText: { fontFamily: theme.fonts.semibold, fontSize: theme.type.scale.sm, color: theme.colors.onAction },
}));
```
`ActivityIndicator`'s `color` prop needs a literal (RN doesn't thread Unistyles theme values into it without a wrapper) — `"#b8531a"` **is** `theme.colors.primary`'s literal value; flag with a comment `// theme.colors.primary literal — ActivityIndicator's color prop can't consume a theme token directly` so this isn't mistaken for an AC#2 violation during review; it is a documented, narrow exception for this one RN-native-only prop, not a general escape hatch.
- [ ] **Step 6** Gallery note: "StateView: all four states, error with and without onRetry."
- [ ] **Step 7 Commit** `git add components/core/StateView.tsx components/core/StateView.logic.ts components/core/__tests__/StateView.logic.test.ts && git commit -m "feat: add StateView four-state primitive (sankalp-component-kit)"`

---

## Stage 4 — `comments/*`

### Task 4.1 — `CommentThread`
**Files:** `components/comments/CommentThread.logic.ts`+test, `components/comments/CommentThread.tsx`.
**Interfaces:** `export function commentThreadCount(count: number | undefined, comments: unknown[] | undefined): number`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { commentThreadCount } from '../CommentThread.logic';

describe('commentThreadCount', () => {
  it('uses the explicit count override when given', () => {
    expect(commentThreadCount(7, [1, 2])).toBe(7);
  });
  it('falls back to comments.length when count is undefined', () => {
    expect(commentThreadCount(undefined, [1, 2, 3])).toBe(3);
  });
  it('falls back to 0 when both are undefined', () => {
    expect(commentThreadCount(undefined, undefined)).toBe(0);
  });
});
```
- [ ] GREEN: `export function commentThreadCount(count?: number, comments?: unknown[]): number { return count ?? comments?.length ?? 0; }`
- [ ] Implement `CommentThread.tsx` — header `Text` (`"{n} Comments"`, tabular-nums on `n`), maps `comments` through `Comment` (this is the one legitimate case of a kit component composing another kit component — both live in `components/comments/`, both ship in this same stage, so it's not a cross-stage ordering risk), then a `children` slot for the composer.
- [ ] Gallery note: "CommentThread: 0 comments (empty list, count 0), 3 comments, explicit count override."
- [ ] Commit.

### Task 4.2 — `Comment`
**Files:** `components/comments/Comment.logic.ts`+test, `components/comments/Comment.tsx`.
**Interfaces:** `export function commentStyleMeta(role: RoleKey, isPrivate: boolean): { hueTokenKey: string; bgTokenKey: string; borderTokenKey: string | null }` (reuses `RoleKey`/`ROLE_KEYS` from `components/core/RoleBadge.logic` — import it rather than redefining).
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { commentStyleMeta } from '../Comment.logic';

describe('commentStyleMeta', () => {
  it('public comment: role hue only, transparent card, no border', () => {
    expect(commentStyleMeta('teacher', false)).toEqual({ hueTokenKey: 'roles.teacher', bgTokenKey: 'transparent', borderTokenKey: null });
  });
  it('private comment: tinted privateSoft card with a privateLine border', () => {
    expect(commentStyleMeta('parent', true)).toEqual({ hueTokenKey: 'roles.parent', bgTokenKey: 'privateSoft', borderTokenKey: 'privateLine' });
  });
  it('bv role resolves via the plural roles map', () => {
    expect(commentStyleMeta('bv', false).hueTokenKey).toBe('roles.bv');
  });
});
```
- [ ] GREEN:
```typescript
import type { RoleKey } from '../core/RoleBadge.logic';
export type { RoleKey };

export function commentStyleMeta(role: RoleKey, isPrivate: boolean): { hueTokenKey: string; bgTokenKey: string; borderTokenKey: string | null } {
  return {
    hueTokenKey: `roles.${role}`,
    bgTokenKey: isPrivate ? 'privateSoft' : 'transparent',
    borderTokenKey: isPrivate ? 'privateLine' : null,
  };
}
```
- [ ] Implement `Comment.tsx` — author initial avatar (hue from `commentStyleMeta`), body text, private comments get a lock glyph + `"PRIVATE"` eyebrow label colored `theme.colors.private`.
- [ ] Gallery note: "Comment: public teacher comment, private parent↔teacher comment."
- [ ] Commit.

### Task 4.3 — `CommentComposer`
**Files:** `components/comments/CommentComposer.logic.ts`+test, `components/comments/CommentComposer.tsx`.
**Interfaces:** `export function buildCommentPayload(body: string, isPrivate: boolean): { body: string; isPrivate: boolean } | null`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { buildCommentPayload } from '../CommentComposer.logic';

describe('buildCommentPayload', () => {
  it('builds a payload for non-empty trimmed body', () => {
    expect(buildCommentPayload('  hello  ', true)).toEqual({ body: 'hello', isPrivate: true });
  });
  it('returns null for an empty or whitespace-only body (nothing to send)', () => {
    expect(buildCommentPayload('   ', false)).toBeNull();
    expect(buildCommentPayload('', false)).toBeNull();
  });
});
```
- [ ] GREEN:
```typescript
export function buildCommentPayload(body: string, isPrivate: boolean): { body: string; isPrivate: boolean } | null {
  const trimmed = body.trim();
  return trimmed ? { body: trimmed, isPrivate } : null;
}
```
- [ ] Implement `CommentComposer.tsx` — local `value`/`priv` state (`useState`), a 2-segment public/private toggle (only rendered when `canPrivate`), a send `Pressable` calling `onSend?.(payload)` when `buildCommentPayload(...)` is non-null, then clearing `value`.
- [ ] Gallery note: "CommentComposer: canPrivate true/false."
- [ ] Commit.

---

## Stage 5 — `privacy/*`

### Task 5.1 — `AuditEntry`
**Files:** `components/privacy/AuditEntry.logic.ts`+test, `components/privacy/AuditEntry.tsx`.
**Interfaces:** `export type AuditAction = "view"|"edit"|"export"|"approve"|"delete";`, `export function auditActionMeta(action: AuditAction): { label: string; colorTokenKey: string }`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { auditActionMeta, AUDIT_ACTION_KEYS } from '../AuditEntry.logic';

describe('AUDIT_ACTION_KEYS contract', () => {
  it('covers all 5 documented actions', () => {
    expect(AUDIT_ACTION_KEYS.sort()).toEqual(['approve', 'delete', 'edit', 'export', 'view'].sort());
  });
});

describe('auditActionMeta', () => {
  it('view → "viewed", info tone', () => expect(auditActionMeta('view')).toEqual({ label: 'viewed', colorTokenKey: 'status.info' }));
  it('delete → "deleted", danger tone', () => expect(auditActionMeta('delete')).toEqual({ label: 'deleted', colorTokenKey: 'status.absent' }));
  it('approve → "approved", success tone', () => expect(auditActionMeta('approve')).toEqual({ label: 'approved', colorTokenKey: 'status.present' }));
});
```
- [ ] GREEN:
```typescript
export type AuditAction = "view" | "edit" | "export" | "approve" | "delete";
export const AUDIT_ACTION_KEYS: AuditAction[] = ['view', 'edit', 'export', 'approve', 'delete'];

const META: Record<AuditAction, { label: string; colorTokenKey: string }> = {
  view:    { label: 'viewed',   colorTokenKey: 'status.info' },
  edit:    { label: 'edited',   colorTokenKey: 'status.excused' },
  export:  { label: 'exported', colorTokenKey: 'primaryPressed' },
  approve: { label: 'approved', colorTokenKey: 'status.present' },
  delete:  { label: 'deleted',  colorTokenKey: 'status.absent' },
};

export function auditActionMeta(action: AuditAction): { label: string; colorTokenKey: string } {
  return META[action];
}
```
- [ ] Implement `AuditEntry.tsx` — single mono row `time · actor · {action label} · target`, action-colored `Text` for the label only. **Never** logs `time`/`actor`/`target` to `console`/analytics (edge case) — pure render, no side effects at all in this component.
- [ ] Gallery note: "AuditEntry: 5 rows, one per action, newest-first order."
- [ ] Commit.

### Task 5.2 — `ConsentCapture`
**Files:** `components/privacy/ConsentCapture.logic.ts`+test, `components/privacy/ConsentCapture.tsx`.
**Interfaces:** `export function consentItemState(id: string, values: Record<string, boolean>, timestamps: Record<string, ReactNode>): { checked: boolean; timestamp: ReactNode | undefined }`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { consentItemState } from '../ConsentCapture.logic';

describe('consentItemState', () => {
  it('unchecked item: no timestamp shown even if one happens to be present', () => {
    expect(consentItemState('media', {}, { media: '2026-01-01' })).toEqual({ checked: false, timestamp: undefined });
  });
  it('checked item: reveals its captured timestamp', () => {
    expect(consentItemState('media', { media: true }, { media: '2026-01-01' })).toEqual({ checked: true, timestamp: '2026-01-01' });
  });
  it('checked item with no timestamp yet: still checked, timestamp undefined', () => {
    expect(consentItemState('media', { media: true }, {})).toEqual({ checked: true, timestamp: undefined });
  });
});
```
- [ ] GREEN:
```typescript
import type { ReactNode } from 'react';

export function consentItemState(id: string, values: Record<string, boolean>, timestamps: Record<string, ReactNode>): { checked: boolean; timestamp: ReactNode | undefined } {
  const checked = !!values[id];
  return { checked, timestamp: checked ? timestamps[id] : undefined };
}
```
- [ ] Implement `ConsentCapture.tsx` — maps `items`, each a checkbox row (`Pressable` + checkmark `View`) calling `onToggle?.(id)`, revealing `consentItemState(...).timestamp` once checked. **Props-only** — this component does not write a `consents` row itself (out of scope; `UNISTYLES.md`'s "each toggle persists a `consents` row" bullet is aspirational/future-feature-wiring language, not this item's scope — do not add a Supabase call here, see Data & RLS impact / AC#6).
- [ ] Gallery note: "ConsentCapture: 3 items, 2 checked with timestamps, 1 unchecked."
- [ ] Commit.

---

## Stage 6 — `chat/*`

### Task 6.1 — `ConversationRow`
**Files:** `components/chat/ConversationRow.logic.ts`+test, `components/chat/ConversationRow.tsx`.
**Interfaces:** `export function conversationRowMeta(kind: "group"|"dm", role: RoleKey, unread: number): { hueTokenKey: string; unreadLabel: string | null }` (imports `RoleKey` from `core/RoleBadge.logic`).
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { conversationRowMeta } from '../ConversationRow.logic';

describe('conversationRowMeta', () => {
  it('group kind uses the indigo hue regardless of role', () => {
    expect(conversationRowMeta('group', 'student', 0).hueTokenKey).toBe('indigo');
  });
  it('dm kind uses the role hue (plural roles map)', () => {
    expect(conversationRowMeta('dm', 'bv', 0).hueTokenKey).toBe('roles.bv');
  });
  it('unread=0 hides the badge (null label)', () => {
    expect(conversationRowMeta('dm', 'student', 0).unreadLabel).toBeNull();
  });
  it('unread>0 shows the count as its own label', () => {
    expect(conversationRowMeta('dm', 'student', 4).unreadLabel).toBe('4');
  });
});
```
- [ ] GREEN:
```typescript
import type { RoleKey } from '../core/RoleBadge.logic';
export type { RoleKey };

export function conversationRowMeta(kind: 'group' | 'dm', role: RoleKey, unread: number): { hueTokenKey: string; unreadLabel: string | null } {
  return {
    hueTokenKey: kind === 'group' ? 'indigo' : `roles.${role}`,
    unreadLabel: unread > 0 ? String(unread) : null,
  };
}
```
- [ ] Implement `ConversationRow.tsx` on top of `core/ListRow` (leading: avatar circle colored via `conversationRowMeta`; title: `name`; subtitle: `preview` with bold+`ink2` when `unread>0` else `ink3`; trailing: `time` above, unread badge below).
- [ ] Gallery note: "ConversationRow: group chat, DM unread=0, DM unread=4, active state."
- [ ] Commit.

### Task 6.2 — `ChatBubble`
**Files:** `components/chat/ChatBubble.logic.ts`+test, `components/chat/ChatBubble.tsx`.
**Interfaces:** `export type TickState = "none"|"sent"|"read";`, `export function chatBubbleMeta(own: boolean, read?: boolean, showName?: boolean): { align: "flex-end"|"flex-start"; fillTokenKey: string; inkTokenKey: string; tick: TickState; showName: boolean }`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { chatBubbleMeta } from '../ChatBubble.logic';

describe('chatBubbleMeta', () => {
  it('own bubble: right-aligned, chatOut fill, tick hidden by default (read undefined)', () => {
    expect(chatBubbleMeta(true)).toEqual({ align: 'flex-end', fillTokenKey: 'chatOut', inkTokenKey: 'chatOutInk', tick: 'none', showName: false });
  });
  it('own bubble, read=false: sent (single) tick', () => {
    expect(chatBubbleMeta(true, false).tick).toBe('sent');
  });
  it('own bubble, read=true: read (double) tick', () => {
    expect(chatBubbleMeta(true, true).tick).toBe('read');
  });
  it('incoming bubble: left-aligned, chatIn fill, name shown by default, no tick ever', () => {
    expect(chatBubbleMeta(false)).toEqual({ align: 'flex-start', fillTokenKey: 'chatIn', inkTokenKey: 'chatInInk', tick: 'none', showName: true });
    expect(chatBubbleMeta(false, true).tick).toBe('none'); // read is meaningless on incoming bubbles
  });
  it('showName can be forced either way regardless of own', () => {
    expect(chatBubbleMeta(true, undefined, true).showName).toBe(true);
    expect(chatBubbleMeta(false, undefined, false).showName).toBe(false);
  });
});
```
- [ ] GREEN:
```typescript
export type TickState = "none" | "sent" | "read";

export function chatBubbleMeta(own: boolean, read?: boolean, showName?: boolean): { align: 'flex-end' | 'flex-start'; fillTokenKey: string; inkTokenKey: string; tick: TickState; showName: boolean } {
  const tick: TickState = own && read !== undefined ? (read ? 'read' : 'sent') : 'none';
  return {
    align: own ? 'flex-end' : 'flex-start',
    fillTokenKey: own ? 'chatOut' : 'chatIn',
    inkTokenKey: own ? 'chatOutInk' : 'chatInInk',
    tick,
    showName: showName ?? !own,
  };
}
```
- [ ] Implement `ChatBubble.tsx` — `View` with `alignSelf: chatBubbleMeta(...).align`, asymmetric corner radius (`borderBottomRightRadius: own ? 5 : theme.radius.bubble`, mirrored for the other corner), tick glyph colored `theme.colors.status.info` when `tick==='read'`, `theme.colors.ink4` when `'sent'`. DM (`own`/non-`own`, non-group) rendering is gallery-only per spec edge case — no group-vs-DM prop actually exists on this component (that distinction lives one level up, at whatever screen composes a list of bubbles); nothing extra to build here beyond the documented props.
- [ ] Gallery note: "ChatBubble: own+sent, own+read, own+no-tick, incoming+name, incoming+no-name."
- [ ] Commit.

### Task 6.3 — `MessageComposer`
No derivable logic (controlled-input wiring only — same "no fabricated logic" call as `ListRow`).
**Files:** `components/chat/MessageComposer.tsx`.
- [ ] Implement directly — `TextInput` (`useState` for `value`) + attach `Pressable` (rendered only when `allowAttach`) + send `Pressable` calling `onSend?.(value)` then clearing, pinned with `KeyboardAvoidingView` (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`).
- [ ] Gallery note: "MessageComposer: default, allowAttach=true."
- [ ] Commit.

---

## Stage 7 — `admin/*`

### Task 7.1 — `CsvImport`
**Files:** `components/admin/CsvImport.logic.ts`+test, `components/admin/CsvImport.tsx`.
**Interfaces:** `export function csvImportPhase(fileName?: string): "dropzone"|"summary"`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { csvImportPhase } from '../CsvImport.logic';

describe('csvImportPhase', () => {
  it('no fileName: dropzone phase', () => expect(csvImportPhase(undefined)).toBe('dropzone'));
  it('empty-string fileName: still dropzone (nothing chosen)', () => expect(csvImportPhase('')).toBe('dropzone'));
  it('a real fileName: summary phase', () => expect(csvImportPhase('roster.csv')).toBe('summary'));
});
```
- [ ] GREEN: `export function csvImportPhase(fileName?: string): 'dropzone' | 'summary' { return fileName ? 'summary' : 'dropzone'; }`
- [ ] Implement `CsvImport.tsx` — dropzone phase: dashed-border `Pressable` calling `onChoose`; summary phase: `fileName` + `total`/`ready`(`status.present`-colored)/`flagged`(`status.absent`-colored) tabular-nums figures + confirm `Pressable` calling `onConfirm`. Fixture data only, driven entirely by props (AC#9/edge cases — `CsvImport` fixture data lives in the gallery harness, Stage 13, not inside this component).
- [ ] Gallery note: "CsvImport: dropzone (no fileName), summary (ready=42, flagged=3)."
- [ ] Commit.

### Task 7.2 — `UserRoleRow`
**Files:** `components/admin/UserRoleRow.logic.ts`+test, `components/admin/UserRoleRow.tsx`.
**Interfaces:** `export function userRoleRowInitial(name?: string): string`, `export function actionsForStatus(status: "active"|"pending"): "manage"|"approve-reject"`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { userRoleRowInitial, actionsForStatus } from '../UserRoleRow.logic';

describe('userRoleRowInitial', () => {
  it('first character of a trimmed name, uppercase-agnostic (verbatim per reference)', () => {
    expect(userRoleRowInitial('  Priya Rao')).toBe('P');
  });
  it('falls back to "?" for no name', () => {
    expect(userRoleRowInitial(undefined)).toBe('?');
    expect(userRoleRowInitial('   ')).toBe('?');
  });
});

describe('actionsForStatus', () => {
  it('active rows get the manage action', () => expect(actionsForStatus('active')).toBe('manage'));
  it('pending rows get approve/reject', () => expect(actionsForStatus('pending')).toBe('approve-reject'));
});
```
- [ ] GREEN:
```typescript
export function userRoleRowInitial(name?: string): string {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed.charAt(0) : '?';
}

export function actionsForStatus(status: 'active' | 'pending'): 'manage' | 'approve-reject' {
  return status === 'pending' ? 'approve-reject' : 'manage';
}
```
- [ ] Implement `UserRoleRow.tsx` on `core/ListRow` — leading: initial-circle avatar; title: `name`; subtitle: `email` + mono `scope`; trailing: multi-`RoleBadge` wrap (imports `core/RoleBadge.tsx`) + `actionsForStatus(status)`-selected action button(s), calling `onManage`/`onApprove`+`onReject`.
- [ ] Gallery note: "UserRoleRow: active/manage, pending/approve-reject, multi-role badges wrapping."
- [ ] Commit.

---

## Stage 8 — `navigation/PersonaSwitcher`

**Files:** `components/navigation/PersonaSwitcher.logic.ts`+test, `components/navigation/PersonaSwitcher.tsx`.
**Interfaces:** `export function resolveActivePersona(roles: Persona[], activeId?: string): Persona | { name: string }`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveActivePersona } from '../PersonaSwitcher.logic';

const roles = [
  { id: 'a', name: 'Teacher · JR·A', role: 'teacher' as const },
  { id: 'b', name: 'Admin', role: 'admin' as const },
];

describe('resolveActivePersona', () => {
  it('finds the persona matching activeId', () => {
    expect(resolveActivePersona(roles, 'b')).toEqual(roles[1]);
  });
  it('falls back to the first role when activeId matches nothing', () => {
    expect(resolveActivePersona(roles, 'nope')).toEqual(roles[0]);
  });
  it('falls back to an em-dash placeholder when roles is empty', () => {
    expect(resolveActivePersona([], undefined)).toEqual({ name: '—' });
  });
});
```
- [ ] GREEN:
```typescript
export interface Persona { id: string; name: string; role: "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin"; scope?: string }

export function resolveActivePersona(roles: Persona[], activeId?: string): Persona | { name: string } {
  return roles.find((r) => r.id === activeId) ?? roles[0] ?? { name: '—' };
}
```
- [ ] Implement `PersonaSwitcher.tsx` — compact pill (`role`-hued dot + `resolveActivePersona(...).name`) opening a bottom-sheet `Modal` listing every `roles` entry as a `Pressable` row (role hue via the plural `roles.*` map, same gotcha as `RoleBadge`), calling `onChange(id)` and closing on select. Independent of `components/RoleSwitcher.tsx` (#17) — no shared code, no retrofit (ADR-0029).
- [ ] Gallery note: "PersonaSwitcher: closed pill, open sheet with 3 roles including bv."
- [ ] Commit.

---

## Stage 9 — `dashboard/*`

### Task 9.1 — `ComplianceBar`
**Files:** `components/dashboard/ComplianceBar.logic.ts`+test, `components/dashboard/ComplianceBar.tsx`.
**Interfaces:** `export type ComplianceTone = "success"|"warning"|"danger"|"info";`, `export function complianceTone(value: number, explicit?: ComplianceTone): ComplianceTone`, `export function clampPercent(value: number): number`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { complianceTone, clampPercent, TONE_TOKEN_KEYS } from '../ComplianceBar.logic';

describe('complianceTone', () => {
  it('an explicit tone always wins over the derived one', () => {
    expect(complianceTone(10, 'success')).toBe('success');
  });
  it('>=85 derives success', () => expect(complianceTone(85)).toBe('success'));
  it('70-84 derives warning', () => expect(complianceTone(70)).toBe('warning'));
  it('<70 derives danger', () => expect(complianceTone(69)).toBe('danger'));
});

describe('clampPercent', () => {
  it('clamps below 0 up to 0', () => expect(clampPercent(-5)).toBe(0));
  it('clamps above 100 down to 100', () => expect(clampPercent(150)).toBe(100));
  it('passes mid-range values through', () => expect(clampPercent(47)).toBe(47));
});

describe('TONE_TOKEN_KEYS contract', () => {
  it('maps all 4 tones to a theme.colors.status.* path', () => {
    expect(TONE_TOKEN_KEYS).toEqual({ success: 'status.present', warning: 'status.excused', danger: 'status.absent', info: 'status.info' });
  });
});
```
- [ ] GREEN:
```typescript
export type ComplianceTone = "success" | "warning" | "danger" | "info";

export const TONE_TOKEN_KEYS: Record<ComplianceTone, string> = {
  success: 'status.present', warning: 'status.excused', danger: 'status.absent', info: 'status.info',
};

export function complianceTone(value: number, explicit?: ComplianceTone): ComplianceTone {
  if (explicit) return explicit;
  if (value >= 85) return 'success';
  if (value >= 70) return 'warning';
  return 'danger';
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}
```
- [ ] Implement `ComplianceBar.tsx` — label + mono tabular-nums figure (`display ?? \`${value}${suffix}\``) header row, track `View` (`theme.radius.pill`, `theme.colors.surfaceAlt` bg) with a filled inner `View` (`width: \`${clampPercent(value)}%\`` as a style, tone-colored via `colorAtPath`), optional `note` caption.
- [ ] Gallery note: "ComplianceBar: 92% (success), 75% (warning), 40% (danger), forced status='info'."
- [ ] Commit.

### Task 9.2 — `CenterRollupRow`
**Files:** `components/dashboard/CenterRollupRow.logic.ts`+test, `components/dashboard/CenterRollupRow.tsx`.
**Interfaces:** `export function rollupMeta(attendance: number | undefined, placeholder: boolean): { pct: number; toneTokenKey: string; display: string }` (reuses `complianceTone`/`clampPercent`/`TONE_TOKEN_KEYS` from `dashboard/ComplianceBar.logic` — import, don't redefine).
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { rollupMeta } from '../CenterRollupRow.logic';

describe('rollupMeta', () => {
  it('placeholder=true always renders the honest em-dash, ignoring any attendance value', () => {
    expect(rollupMeta(92, true)).toEqual({ pct: 0, toneTokenKey: 'status.present', display: '—' });
  });
  it('placeholder=false with a real value: clamped pct, derived tone, numeric display', () => {
    expect(rollupMeta(92, false)).toEqual({ pct: 92, toneTokenKey: 'status.present', display: '92%' });
  });
  it('placeholder=false with attendance undefined: treats it as 0', () => {
    expect(rollupMeta(undefined, false)).toEqual({ pct: 0, toneTokenKey: 'status.absent', display: '0%' });
  });
});
```
- [ ] GREEN:
```typescript
import { clampPercent, complianceTone, TONE_TOKEN_KEYS } from '../../dashboard/ComplianceBar.logic';

export function rollupMeta(attendance: number | undefined, placeholder: boolean): { pct: number; toneTokenKey: string; display: string } {
  if (placeholder) return { pct: 0, toneTokenKey: TONE_TOKEN_KEYS.success, display: '—' };
  const pct = clampPercent(attendance ?? 0);
  return { pct, toneTokenKey: TONE_TOKEN_KEYS[complianceTone(pct)], display: `${pct}%` };
}
```
(Import path note: both files live in `components/dashboard/`, so the real import is `from './ComplianceBar.logic'` — the `../../dashboard/` shown above is illustrative of "same-domain reuse"; use the correct relative path when writing the file.)
- [ ] Implement `CenterRollupRow.tsx` on `core/ListRow` — leading: center initial/icon; title: `name`; subtitle: `region`; trailing: mini `ComplianceBar`-style bar (or the `rollupMeta(...).display` figure alone if a full bar is too tight at row height — pick whichever matches the `.jsx` reference's visual density, verified at `/test`) + `marked`/`enrolled` counts when not `placeholder`.
- [ ] Gallery note: "CenterRollupRow: real data 92%, real data 61%, placeholder (no data yet)."
- [ ] Commit.

---

## Stage 10 — `feed/FeedCard`

**Files:** `components/feed/FeedCard.logic.ts`+test, `components/feed/FeedCard.tsx`.
**Interfaces:** `export type FeedScope = "org"|"center"|"class";`, `export function feedScopeMeta(scope: FeedScope): { label: string; colorTokenKey: string }`, `export function feedCardMeta(kind: "announcement"|"update", pinned?: boolean): { titleFont: "display"|"body"; showPin: boolean }`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { feedScopeMeta, feedCardMeta, FEED_SCOPE_KEYS } from '../FeedCard.logic';

describe('FEED_SCOPE_KEYS / feedScopeMeta', () => {
  it('covers org/center/class', () => expect(FEED_SCOPE_KEYS.sort()).toEqual(['center', 'class', 'org'].sort()));
  it('org maps to the Org-wide label and scope.org token', () => {
    expect(feedScopeMeta('org')).toEqual({ label: 'Org-wide', colorTokenKey: 'scope.org' });
  });
});

describe('feedCardMeta', () => {
  it('announcement uses the serif display title font', () => {
    expect(feedCardMeta('announcement', false)).toEqual({ titleFont: 'display', showPin: false });
  });
  it('update uses the sans body title font', () => {
    expect(feedCardMeta('update', false).titleFont).toBe('body');
  });
  it('pin only ever shows on an announcement, even if pinned=true on an update', () => {
    expect(feedCardMeta('announcement', true).showPin).toBe(true);
    expect(feedCardMeta('update', true).showPin).toBe(false);
  });
});
```
- [ ] GREEN:
```typescript
export type FeedScope = "org" | "center" | "class";
export const FEED_SCOPE_KEYS: FeedScope[] = ['org', 'center', 'class'];

const SCOPE_META: Record<FeedScope, { label: string; colorTokenKey: string }> = {
  org:    { label: 'Org-wide', colorTokenKey: 'scope.org' },
  center: { label: 'Center',   colorTokenKey: 'scope.center' },
  class:  { label: 'Class',    colorTokenKey: 'scope.class' },
};

export function feedScopeMeta(scope: FeedScope): { label: string; colorTokenKey: string } {
  return SCOPE_META[scope];
}

export function feedCardMeta(kind: 'announcement' | 'update', pinned?: boolean): { titleFont: 'display' | 'body'; showPin: boolean } {
  return { titleFont: kind === 'announcement' ? 'display' : 'body', showPin: kind === 'announcement' && !!pinned };
}
```
- [ ] Implement `FeedCard.tsx` on `core/Card` — header row: `RoleBadge` (from `core/RoleBadge.tsx`, `author.role`) + scope pill (`feedScopeMeta`); title styled per `feedCardMeta(...).titleFont`; optional pin glyph when `showPin`; optional `homework` callout strip; footer: `time` · `reach` · comment-count `Pressable` (only the card body and the comment count are tap targets — `onOpen` fires from both, per spec).
- [ ] Gallery note: "FeedCard: org announcement pinned, center update with homework, class update no homework."
- [ ] Commit.

---

## Stage 11 — `notifications/*`

### Task 11.1 — `NotificationItem`
**Files:** `components/notifications/NotificationItem.logic.ts`+test, `components/notifications/NotificationItem.tsx`.
**Interfaces:** `export type NotificationType = "update"|"announce"|"absence"|"approval"|"chat";`, `export function notificationTypeMeta(type: NotificationType): { colorTokenKey: string }`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { notificationTypeMeta, NOTIFICATION_TYPE_KEYS } from '../NotificationItem.logic';

describe('NOTIFICATION_TYPE_KEYS / notificationTypeMeta', () => {
  it('covers all 5 documented types', () => {
    expect(NOTIFICATION_TYPE_KEYS.sort()).toEqual(['absence', 'announce', 'approval', 'chat', 'update'].sort());
  });
  it('absence maps to the danger tone', () => expect(notificationTypeMeta('absence')).toEqual({ colorTokenKey: 'status.absent' }));
  it('approval maps to the success tone', () => expect(notificationTypeMeta('approval')).toEqual({ colorTokenKey: 'status.present' }));
  it('chat maps to the bv role hue (plural roles map)', () => expect(notificationTypeMeta('chat')).toEqual({ colorTokenKey: 'roles.bv' }));
});
```
- [ ] GREEN:
```typescript
export type NotificationType = "update" | "announce" | "absence" | "approval" | "chat";
export const NOTIFICATION_TYPE_KEYS: NotificationType[] = ['update', 'announce', 'absence', 'approval', 'chat'];

const META: Record<NotificationType, { colorTokenKey: string }> = {
  update:   { colorTokenKey: 'scope.class' },
  announce: { colorTokenKey: 'status.info' },
  absence:  { colorTokenKey: 'status.absent' },
  approval: { colorTokenKey: 'status.present' },
  chat:     { colorTokenKey: 'roles.bv' },
};

export function notificationTypeMeta(type: NotificationType): { colorTokenKey: string } {
  return META[type];
}
```
- [ ] Implement `NotificationItem.tsx` on `core/ListRow` — leading: type-hued icon circle (icon glyphs are decorative SVG paths in the reference; port with `react-native-svg`, or substitute a simple colored dot + `expo-symbols`/text glyph if the exact icon set isn't worth the SVG-path port effort for a kit primitive — pick whichever keeps this task small, confirm visually at `/test`); trailing: unread dot (`theme.colors.primary`) when `unread`.
- [ ] Gallery note: "NotificationItem: one per type, one unread."
- [ ] Commit.

### Task 11.2 — `PushPermissionPrompt`
No derivable logic (same "no fabricated logic" call as `ListRow`/`MessageComposer").
**Files:** `components/notifications/PushPermissionPrompt.tsx`.
- [ ] Implement directly — `Card`-style panel, `title`/`body` text, `Enable` primary `Button` (calls `onEnable`) + `Not now` ghost `Button` (calls `onDismiss`, **always** rendered — spec requires "always offers Not now"). iOS 16.4+ PWA-install caveat is a code comment only, no `display-mode` detection logic added (spec edge case — explicitly deferred to future notifications-infra wiring).
- [ ] Gallery note: "PushPermissionPrompt: default copy."
- [ ] Commit.

---

## Stage 12 — `auth/MagicLinkLogin`

**Files:** `components/auth/MagicLinkLogin.logic.ts`+test, `components/auth/MagicLinkLogin.tsx`.
**Interfaces:** `export function magicLinkCopy(sent: boolean, email: string): { heading: string; body: string }`.
- [ ] RED:
```typescript
import { describe, it, expect } from 'vitest';
import { magicLinkCopy } from '../MagicLinkLogin.logic';

describe('magicLinkCopy', () => {
  it('pre-send: prompts for an email', () => {
    expect(magicLinkCopy(false, '')).toEqual({ heading: 'Sign in', body: 'Enter your email and we’ll send you a magic link.' });
  });
  it('post-send: confirms and echoes the address', () => {
    expect(magicLinkCopy(true, 'a@b.com')).toEqual({ heading: 'Check your email', body: 'We sent a sign-in link to a@b.com.' });
  });
});
```
- [ ] GREEN:
```typescript
export function magicLinkCopy(sent: boolean, email: string): { heading: string; body: string } {
  if (sent) return { heading: 'Check your email', body: `We sent a sign-in link to ${email}.` };
  return { heading: 'Sign in', body: 'Enter your email and we’ll send you a magic link.' };
}
```
- [ ] Implement `MagicLinkLogin.tsx` — reuses the existing `components/brand/Logo.tsx` (#17) for its mark (per spec's Behavior section — this is the second, and only other, legitimate case of a kit component importing an already-shipped component, explicitly sanctioned by the spec); local `email` `useState` seeded from the `email` prop; single email `Field` (from `core/Field.tsx`) + submit `Button` (from `core/Button.tsx`) calling `onSend?.(email)`; `sent` prop toggles to the confirmation copy from `magicLinkCopy`. No sign-up path (accounts are coordinator/admin-provisioned). Ships **alongside** `app/(auth)/sign-in.tsx`, does not replace it (ADR-0029, out of scope) — this file lives only under `components/auth/`, nothing in `app/(auth)/` changes.
- [ ] Gallery note: "MagicLinkLogin: pre-send, sent state showing the echoed email."
- [ ] Commit.

---

## Stage 13 — Gallery harness + route registration

### Task 13.1 — Register the `(dev)` route group

**Why this is its own task, not folded into 13.2:** `app/_layout.tsx`'s `RootNavigator` explicitly declares every reachable route as a `Stack.Screen`/`Stack.Protected` child (see the file's own comment: "once any explicit `Stack.Screen` children exist, Expo Router only navigates screens declared here"). A `(dev)` group with no matching `Stack.Screen` entry is **unreachable, even for `playwright-cli`** — the same failure mode `index` and `auth/callback` were deliberately protected against. Skipping this task silently breaks every gallery-note verification step above.

**Files:** Modify `app/_layout.tsx`.

- [ ] **Step 1** Add one always-declared line (not `Protected` — the gallery must render with no session, matching `index`/`auth/callback`'s reasoning) to `RootNavigator`'s `<Stack>`:
```tsx
      <Stack.Screen name="index" />
      <Stack.Screen name="auth/callback" />
      {/* Dev-only kit gallery (issue #18) — not reachable from any persona nav map, exists solely
          as a playwright-cli verification target for /test. Always-declared for the same reason
          as index/auth/callback above: Stack.Protected groups don't apply here since there's no
          session-gated concern — this route never touches auth state. */}
      <Stack.Screen name="(dev)" />
```
- [ ] **Step 2 Commit** `git add app/_layout.tsx && git commit -m "feat: register (dev) route group for kit-gallery (sankalp-component-kit)"`

### Task 13.2 — Build `app/(dev)/kit-gallery.tsx`

**Files:** Create `app/(dev)/kit-gallery.tsx`.

- [ ] **Step 1** Implement a single scrollable screen, one labeled section per component (28 sections total, following every "Gallery note" recorded in Stages 1–12 above verbatim — each note is the exact fixture-prop list for that section), each section a `Text` heading (`theme.fonts.semibold`) + the live component instance(s) with representative/fixture props. Structure:
```tsx
import "../../lib/unistyles";
import { ScrollView, View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
// ... import every ported component + core primitives used as fixtures (RoleBadge for headers, etc.)

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function KitGallery() {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.pageTitle}>Sankalp Component Kit — Gallery</Text>
      <Section title="Button">{/* 7 variants × 4 sizes, per Task 1.1's gallery note */}</Section>
      {/* ... one Section per remaining Gallery note, in Stage order ... */}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: { padding: theme.space["6"], gap: theme.space["8"] },
  pageTitle: { fontFamily: theme.fonts.display, fontSize: theme.type.scale.h2, color: theme.colors.ink, marginBottom: theme.space["4"] },
  section: { gap: theme.space["3"] },
  sectionTitle: { fontFamily: theme.fonts.semibold, fontSize: theme.type.scale.sm, color: theme.colors.ink3, textTransform: "uppercase", letterSpacing: theme.type.tracking.eyebrow },
  sectionBody: { gap: theme.space["3"] },
}));
```
- [ ] **Step 2** Manual smoke: `npm run web` (or `npm run dev`), navigate to `/kit-gallery`, confirm every section renders with no console errors, no crash, no horizontal scroll at 375/1440.
- [ ] **Step 3 Commit** `git add "app/(dev)/kit-gallery.tsx" && git commit -m "feat: add kit-gallery playwright verification harness (sankalp-component-kit)"`

---

## Stage 14 — Full verification

- [ ] `npx vitest run` — every `.logic.ts` test green (23 logic modules + `tokenPath.ts` = 24 test files, ~70–90 assertions total across Stages 1–12).
- [ ] `npm run typecheck` — clean across all 28 new `.tsx`/`.logic.ts` files plus the `app/_layout.tsx` and `app/(dev)/kit-gallery.tsx` edits.
- [ ] `npm run lint` — clean.
- [ ] `npx expo export --platform web` — clean static export, confirms no RN-Web-incompatible API slipped into any of the 28 components (AC#11).
- [ ] `playwright-cli` DoD pass against `/kit-gallery` at 360/768/1024/1440 — walk every AC and every USAGE.md DoD bullet from Global Constraints above: theme-token-only (spot-check computed styles for stray hex), ≥44px targets, tabular-nums on figures (`ComplianceBar`, `CenterRollupRow`, `StatTile` accent numerics, unread badges), one `accent` action per composed view, `brand`/gold identity-only, serif-display showcase-only, no horizontal scroll.
- [ ] Confirm `USAGE.md` / `.claude/skills/design-system/SKILL.md` patches (already in the working tree, see "Already done") are unchanged/still correct — no action needed, just a sanity check before `/test` signs off on AC#7.
- [ ] Write the gate marker (matching prior System items' convention) once the full suite is green.

## Hand-off

`/build` executes Stages 1–14 above (parallelizable per Shared seam); `/test` re-runs Stage 14 in full against every AC in `sankalp-component-kit.md`, plus a `playwright-cli` visual diff of `kit-gallery` against each `design/sankalp/**` reference; `/deploy-staging` → `/promote` follow the standard pipeline — nothing schema-related, so no migration-guard gate applies to this item.

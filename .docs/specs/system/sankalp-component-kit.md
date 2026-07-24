# System — Sankalp component kit

> **owner:** System · **consumers:** all 6 personas' UI (every persona screen); unblocks independent/parallel build of feed, chat, dashboard, admin, notifications, and auth-adjacent screens without each re-porting design-kit reference components · **scope:** client presentational layer only — no RLS/data access, no privileged operations · **governing ADR:** ADR-0010 (design tooling — Open Design/Sankalp source), ADR-0011 (styling — Unistyles 3 + generated theme), ADR-0014 (access UX — four states, role-derived nav, conditional switcher), ADR-0029 (full-library, single-owner exception to §12.12 per-capability ownership) · **covers:** doc 2 issue #18 ("Build the reusable Sankalp component kit"); `.claude/rules/design-system.md` DoD; closes the ADR-0014 doc-patch debt left open in `design/sankalp/USAGE.md` and the `design-system` skill

**Stage:** `/refine` ✓ → `/architect` ✓ (ADR-0029 recorded) → `/design` ✓ (2026-07-18) → next is `/plan`.

---

## Requirements (refined)

### User story
As the System persona, on behalf of every other persona's screens, I want the **complete** Sankalp design library (all `design/sankalp/components/core/**` primitives, `brand/**`, and every `bv-connect/components/**` domain component) ported into the app as typed, testable, theme-driven RN/TS components, so that every persona feature can build screens against consistent, on-brand, accessible building blocks **without being blocked on independently re-porting the same design-kit reference components** before their own feature work can start.

### Scope decision (human-validated, deviates from strict one-owner-per-capability)
`.docs/3_ARCHITECTURE.md` §12.12 normally assigns each domain component to its owning persona's feature spec (e.g. `FeedCard` → Student/Parent feed, `ChatBubble` → chat, `ComplianceBar` → Coordinator dashboard, `CsvImport`/`UserRoleRow` → Admin). **Deliberately overridden here per explicit owner instruction:** the entire component surface — `core/*` + `brand/*` + all of `bv-connect/components/**` — ships as one System-owned kit in this item, so that other contributors can build persona features in parallel without each depending on a fresh, ad hoc design-kit port. Each feature's **data wiring** (Supabase queries, RLS-scoped fetches, business logic) remains owned by that feature's own persona spec — this item ships **presentational, prop-driven components only**.

### In scope — full component inventory
**`core/*` (generic primitives, 8):** `Button`, `Card`, `Field`, `StatusChip`, `StatTile`, `SegmentedTabs`, `Stepper`, `RoleBadge`.

**`brand/*` (1 remaining — `Logo` already shipped in #17/client-auth-session-and-nav):** `EventDateBlock` (no current app consumer — port for completeness per full-library decision; flag as unused until an events feature exists).

**`bv-connect/components/**` (domain reference components, 16):**
- `comments/`: `CommentThread`, `Comment`, `CommentComposer`
- `privacy/`: `AuditEntry`, `ConsentCapture`
- `chat/`: `ConversationRow`, `ChatBubble`, `MessageComposer`
- `admin/`: `CsvImport`, `UserRoleRow`
- `navigation/`: `PersonaSwitcher`
- `dashboard/`: `ComplianceBar`, `CenterRollupRow`
- `feed/`: `FeedCard`
- `notifications/`: `NotificationItem`, `PushPermissionPrompt`
- `auth/`: `MagicLinkLogin`

**New (no existing `.prompt.md` — authored fresh, not a straight port):**
- **Generic `ListRow` primitive** — the issue text calls out "list rows" explicitly; no such generic exists in the design kit. `ConversationRow`, `UserRoleRow`, `CenterRollupRow`, and `NotificationItem` all repeat the same shape (leading element + title/subtitle + trailing element + optional press action). Whether those four become thin variants over one `ListRow` or stay independent is a **`/design` decision**, not decided here.
- **Four-state view primitive** — a reusable loading/empty/error/content wrapper pattern per ADR-0014 (see below). No existing design-kit component defines this as a primitive; `/design` decides the concrete API (e.g. a `<StateView>` wrapper vs. a hook + convention).

### Explicitly out of scope
- Wiring any ported component to real Supabase data, RLS-scoped queries, or privileged Netlify functions. Each owning persona's feature build (feed, chat, dashboard, admin, notifications, roster/attendance) does that wiring later, consuming this kit.
- Retrofitting the already-shipped, already-tested `components/AppHeader.tsx` / `components/RoleSwitcher.tsx` (#17) to consume the new `RoleBadge` or `PersonaSwitcher` kit components. Those stay untouched — avoids reopening tested/merged nav-shell surface for a non-functional visual refactor. `RoleBadge` and `PersonaSwitcher` ship as available primitives; adopting them into the nav shell (if ever) is a separate, deliberate follow-up.
- Replacing the already-shipped `app/(auth)/sign-in.tsx` with the ported `MagicLinkLogin` reference component in this item, for the same reason.
- A permission-denied state. ADR-0014 is final: **four** states only (loading / empty / error-preserving / content) — no fifth "permission-denied-as-designed" state, since out-of-scope routes redirect home instead.

### Acceptance criteria
1. Every component listed above under "In scope" exists as a typed RN/TS component under the app's component tree, matching its `.prompt.md` prop/variant contract and its existing `.d.ts` signature where one exists (`core/*`, `brand/EventDateBlock`).
2. All components style exclusively via `theme.*` tokens from `lib/theme.ts` (Unistyles) — no hardcoded hex, spacing, or radius literals (USAGE.md tokens DoD).
3. A reusable four-state pattern (loading · empty · error-preserving · content — **no permission-denied**, per ADR-0014 and the already-patched `.claude/rules/design-system.md`) ships as a kit primitive, usable by any future data-bearing screen.
4. A new generic `ListRow` primitive is authored per the "New" section above.
5. `RoleBadge` ships as a standalone primitive; `components/AppHeader.tsx` and `components/RoleSwitcher.tsx` are left untouched (no retrofit in this item).
6. All components are presentational/prop-driven only — no Supabase client calls, no data fetching, no privileged operations inside the kit (`client-privacy.md`: "no access logic in the client").
7. `design/sankalp/USAGE.md` and `.claude/skills/design-system/SKILL.md` are patched from the stale five-state / permission-denied-as-designed language to the four-state language, matching the already-patched `.claude/rules/design-system.md` — closing the doc-patch debt ADR-0014's consequences section called for but left unfinished.
8. USAGE.md layout/type/motion DoD holds across the kit: ≥44px touch targets; no horizontal scroll at 360/768/1024/1440; tabular-nums (`fontVariant: ['tabular-nums']`) on any compared/counted number; exactly one primary `accent` action per composed view; `brand` (saffron) identity-only, never a competing CTA; display serif for showcase/identity only, never body or buttons.
9. Each component has a unit test at the render/variant/prop-contract level (TDD non-negotiable — red first) and is exercised in a lightweight kit-demo/gallery harness for visual/playwright verification. Exact test/demo mechanism is a `/design` + `/plan` decision.
10. No secrets or PII hardcoded. Components that render PII-adjacent fields (`ConsentCapture`, `AuditEntry`, `UserRoleRow`, `CsvImport`) accept all data via props only and perform no logging.
11. Components render correctly on both RN-Web (Netlify static export) and native Expo — per ADR-0011's one-token-source, web+native bridge.

### Edge cases
- `EventDateBlock` has no current consumer in the POC persona slice — ported for completeness per the full-library decision, but flagged as dead-code risk until an events feature exists; do not invent a consumer screen just to exercise it.
- `PersonaSwitcher` (kit) vs. the shipped `RoleSwitcher.tsx` (#17), and `MagicLinkLogin` (kit) vs. the shipped `app/(auth)/sign-in.tsx` (#17) are structurally overlapping. Ship both as independent artifacts in this item — do not merge, dedupe, or have one call the other. Reconciling them (if ever done) is a future, separately-scoped decision.
- Long/RTL-adjacent text (long family or class names) in `ListRow`/chips/badges must not break layout at the 360px breakpoint — truncate, don't wrap into overflow.
- Empty/loading/error copy must be real, calm, honest copy per USAGE.md voice rules (no blame, no jargon) — placeholder/lorem text fails the DoD, not just a visual nit.
- `CsvImport`'s presentational states (e.g. row-level validation errors) must be renderable from mock/prop data alone, since real import wiring is out of scope here — the demo harness will need representative fixture data.

### Priority
**POC-core (foundational — client).** Matches issue #18 priority as filed; nothing in this refine changes that.

### Consumers
All 6 personas' UI (every subsequent persona screen consumes this kit). Explicitly enables parallel, independent development of the remaining client feature specs (feed, chat, dashboard, admin, notifications, auth-adjacent screens, roster/attendance) without each blocking on its own design-kit port.

### Access scope (§5.4)
None directly — this is a presentational-only client layer with no Supabase calls and no RLS-scoped data access. Must still comply with `client-privacy.md`: anon-key-only if any component ever needs a client call (none should in this item), no access-control logic embedded in components, PII-free logging. RLS remains enforced at the DB layer by whichever feature later wires real data into these components.

---

## Design (Open Design → code, human-validated 2026-07-18)

The design mirror (`design/sankalp/components/{core,brand}/**`, `design/sankalp/bv-connect/components/**`) was checked against the canonical Chinmaya Mission Design System project and found current — every one of the 25 in-scope components already has a matching `.jsx` reference, `.d.ts` prop contract, and `.prompt.md` usage note locally. No `DesignSync` refresh was needed.

Three open questions the `/refine` spec deliberately deferred to `/design` were put to the human owner; all three were decided in favor of the lower-risk, more-testable option:

1. **`ListRow` ships as an independent new primitive, not a refactor base.** `ConversationRow`, `UserRoleRow`, `CenterRollupRow`, and `NotificationItem` keep their existing `.d.ts`/`.prompt.md` contracts unchanged — their leading elements (avatar / role-hued initial / mini-bar / typed icon) differ enough that forcing them through a shared `ListRow` slot API would risk diverging from their already-approved reference `.jsx` during the port. `ListRow` is authored fresh in `core/`, satisfying the issue's literal "list rows" ask, and is available for any *future* row that doesn't yet have a bespoke design.
2. **The four-state pattern ships as a `<StateView>` wrapper component**, not a bare hook — see API below. A wrapper gives every future data-bearing screen an identical structural skeleton (reduces drift across 6 personas) and is directly unit-testable per branch, matching AC#9's "render/variant/prop-contract" language.
3. **The kit-demo/gallery harness is a dedicated dev-only Expo Router route**, `app/(dev)/kit-gallery.tsx` — a real screen in the running app (not a static HTML page outside Expo), so it goes through the app's actual Unistyles/theme runtime on both RN-Web and native, matching how `AppHeader`/`RoleSwitcher` are already visually verified live via `playwright-cli` at `/test`. It carries every in-scope component with representative props, including `CsvImport`'s parsed/flagged fixture data. It is not linked from any persona nav map (`lib/auth/navMap.ts` is untouched).

## Behavior

All 25 ported components plus `ListRow` and `StateView` are pure, prop-driven, stateless-except-local-UI-state (e.g. `PersonaSwitcher`'s open/closed sheet, `CommentComposer`'s public/private toggle) presentational components. None fetches data, calls Supabase, or embeds access-control logic — every example in the `.prompt.md` files below is driven entirely by props/mock data, consistent with `client-privacy.md`.

**`core/*` (8) + `brand/EventDateBlock`** — generic, domain-agnostic primitives (`Button`, `Card`, `Field`, `StatusChip`, `StatTile`, `SegmentedTabs`, `Stepper`, `RoleBadge`, `EventDateBlock`). Straight ports of their existing `.d.ts` contracts (see UI table).

**`comments/*`** — `CommentThread` (count header + `Comment` list + composer slot), `Comment` (flat public vs. violet/locked `isPrivate` teacher↔parent), `CommentComposer` (public/private segmented toggle gating the audience before send).

**`privacy/*`** — `AuditEntry` (display-only, newest-first, mono `time · actor · action · target` row — source of truth stays the DB `audit_log` table, never written here), `ConsentCapture` (opt-in checkboxes that reveal a captured timestamp once checked; this item renders `values`/`timestamps` from props only — persisting a real `consents` row is future feature-owner wiring).

**`chat/*`** — `ConversationRow` (list-row: group/DM, unread badge), `ChatBubble` (own/incoming alignment + fill; `read` tri-state; DM bubbles are gated behind the chat-governance flag at the *consuming* feature, not inside this component), `MessageComposer` (multiline input + send `Pressable`, `KeyboardAvoidingView`-pinned).

**`admin/*`** — `CsvImport` (dropzone → parsed ready/flagged summary; presentational states only, per AC#9 driven by fixture data in the gallery), `UserRoleRow` (list-row: avatar, multi-role badges, manage vs. approve/reject action set keyed by `status`).

**`navigation/PersonaSwitcher`** — compact pill → bottom-sheet role switcher; ships as an independent primitive alongside the already-shipped `RoleSwitcher.tsx` (#17), not merged into it (ADR-0029, edge case below).

**`dashboard/*`** — `ComplianceBar` (value-derived success/warning/danger tone unless `status` overridden, mono-tabular figure), `CenterRollupRow` (list-row: name/region/attendance%/mini-bar; honest `—` via `placeholder` for centers with no data).

**`feed/FeedCard`** — announcement (org/center, serif title, optional pin) vs. class update (sans title, homework line); `RoleBadge` + scope pill header, time/reach/comment-count footer; only the card and the comment count are tap targets.

**`notifications/*`** — `NotificationItem` (list-row: typed icon/hue, unread dot+fill), `PushPermissionPrompt` (soft-ask before the native VAPID prompt; always offers "Not now"; iOS 16.4+ PWA-install caveat is copy-only in this item, no install-detection logic added here).

**`auth/MagicLinkLogin`** — single email field → send → "check your email"; no sign-up path (accounts are coordinator/admin-provisioned); reuses the existing `Logo` component (#17) for its mark; ships alongside the already-shipped `app/(auth)/sign-in.tsx`, not replacing it (ADR-0029).

**New primitives:**
- **`ListRow`** (`core/`) — generic row: `leading` (node slot), `title`, `subtitle?`, `trailing?` (node slot), `onPress?`. No domain knowledge of avatars, bars, or badges — those compose *into* the slots by whatever future consumer needs them.
- **`StateView`** (`core/`) — wraps any data-bearing region:
  ```tsx
  <StateView
    state="loading" | "empty" | "error" | "content"
    emptyText={string}   // required when state can be "empty"
    errorText={string}   // required when state can be "error"
    onRetry={() => void} // shown as a retry action only in "error"
    children             // rendered only when state === "content"
  />
  ```
  Loading renders a calm skeleton/spinner (never a blank flash); empty/error copy must be real per USAGE.md voice rules (no lorem placeholders — AC's edge cases already flag this). There is no fifth `"denied"` state — out-of-scope routes redirect home instead (ADR-0014), matching the now-corrected `USAGE.md`/`design-system` skill (see Data & RLS impact).

## Data & RLS impact

None. Confirmed component-by-component above: every component consumes props/mock data only. `AuditEntry` and `ConsentCapture` are the two components that render PII-/compliance-adjacent data (audit rows, consent state) — both are display/capture-only in this item; writing to `audit_log` or a `consents` table is explicitly out of scope here and belongs to whichever feature later wires real Supabase calls behind these components. No RLS policy, migration, or auth-hook change is touched by this item.

As part of applying the design DoD (skill step 4), this `/design` pass also **closed the doc-patch debt** ADR-0014 left open (spec AC#7): `design/sankalp/USAGE.md` ("five required states" → four, permission-denied bullet removed) and `.claude/skills/design-system/SKILL.md` ("all five states incl. permission-denied-as-designed" → four states, no permission-denied, ADR-0014 cited) are now patched to match the already-correct `.claude/rules/design-system.md`. This is a documentation-consistency fix only — no schema/RLS/auth-hook change, so it does not require a migration.

## UI

Design-mirror source → target app path (all styled via `theme.*` from `lib/theme.ts`, no dark-mode variant exists yet — `lib/theme.ts` exports `lightTheme` only, so none is expected here):

| Domain | Design source (`design/sankalp/...`) | Target (`components/...`) |
|---|---|---|
| core | `components/core/{Button,Card,Field,StatusChip,StatTile,SegmentedTabs,Stepper,RoleBadge}.{jsx,d.ts}` | `components/core/*.tsx` |
| core (new) | — (no existing reference) | `components/core/ListRow.tsx`, `components/core/StateView.tsx` |
| brand | `components/brand/EventDateBlock.{jsx,d.ts}` | `components/brand/EventDateBlock.tsx` (joins existing `components/brand/Logo.tsx` from #17) |
| comments | `bv-connect/components/comments/{CommentThread,Comment,CommentComposer}.{jsx,d.ts}` | `components/comments/*.tsx` |
| privacy | `bv-connect/components/privacy/{AuditEntry,ConsentCapture}.{jsx,d.ts}` | `components/privacy/*.tsx` |
| chat | `bv-connect/components/chat/{ConversationRow,ChatBubble,MessageComposer}.{jsx,d.ts}` | `components/chat/*.tsx` |
| admin | `bv-connect/components/admin/{CsvImport,UserRoleRow}.{jsx,d.ts}` | `components/admin/*.tsx` |
| navigation | `bv-connect/components/navigation/PersonaSwitcher.{jsx,d.ts}` | `components/navigation/PersonaSwitcher.tsx` |
| dashboard | `bv-connect/components/dashboard/{ComplianceBar,CenterRollupRow}.{jsx,d.ts}` | `components/dashboard/*.tsx` |
| feed | `bv-connect/components/feed/FeedCard.{jsx,d.ts}` | `components/feed/FeedCard.tsx` |
| notifications | `bv-connect/components/notifications/{NotificationItem,PushPermissionPrompt}.{jsx,d.ts}` | `components/notifications/*.tsx` |
| auth | `bv-connect/components/auth/MagicLinkLogin.{jsx,d.ts}` | `components/auth/MagicLinkLogin.tsx` |

Folder layout mirrors the design mirror 1:1 (precedent: `components/brand/Logo.tsx` already mirrors `design/sankalp/components/brand/Logo.jsx`), one domain folder per `bv-connect/components/<domain>` — this is a direct, low-risk convention match, not a new decision requiring sign-off.

**Gallery harness:** `app/(dev)/kit-gallery.tsx` renders every component above (plus `ListRow`/`StateView`) with representative/fixture props covering each documented variant (e.g. `Button`'s 7 variants × 4 sizes, `StatusChip`'s 8 statuses, `CsvImport`'s empty + parsed-with-flags states, `StateView`'s all four states). Not reachable from any persona nav map; exists solely as a `playwright-cli` verification target for `/test`.

**DoD applied (USAGE.md, now four-state):** theme-token-only styling, one `accent` action per composed view, `brand` identity-only, tabular-nums on compared/counted figures, ≥44px touch targets, no horizontal scroll at 360/768/1024/1440, serif display for showcase/identity only.

## Edge cases

(In addition to the `/refine`-stage edge cases already recorded above — `EventDateBlock` no consumer, `ListRow`/`StateView` API decisions now resolved above, long-text truncation, honest empty/loading/error copy, `CsvImport` fixture data.)

- `StateView`'s `"error"` branch must render `onRetry` as an actual retry action (not just text) whenever it's passed, so any future consumer gets a working retry affordance for free — but `onRetry` is optional (some error states, e.g. a permanently-failed one-shot action, may have nothing to retry).
- `ChatBubble`'s DM (`own`/non-`own`, non-group) variant renders in the gallery harness for visual verification only; the *governance gate* that decides whether student-P2P DM is enabled at all is a future chat-feature concern, not something this presentational component enforces.
- `PushPermissionPrompt`'s iOS-16.4+-PWA-install caveat is copy/documentation only here — no `display-mode` detection logic is added in this item; that's for the future notifications-infra feature wiring.
- `ConsentCapture` and `AuditEntry` must never log the PII they render (names, actions, targets) to console/analytics — pure render, no side-channel output, per `privacy-rules`.
- `ListRow` must not assume a fixed leading-slot width across its four eventual future consumers' worth of content shapes — accept the slot's natural size rather than hardcoding a dimension, so it doesn't silently break a future avatar-vs-icon-vs-bar consumer.

## Out of scope

(In addition to the `/refine`-stage out-of-scope items already recorded above.)

- No Storybook/Ladle or third-party component-explorer tooling — the gallery harness is a plain Expo Router screen, per the human-validated decision above.
- No automated visual-regression diffing tool — verification is `playwright-cli` at `/test`, same mechanism already used for `AppHeader`/`RoleSwitcher`.
- No dark-mode theme variant — `lib/theme.ts` only generates `lightTheme`; not introduced here.
- No i18n/RTL layout support beyond the existing long-text-truncation edge case.
- Wiring `ConsentCapture`/`AuditEntry` to real `consents`/`audit_log` tables — display/capture-only in this item (see Data & RLS impact).

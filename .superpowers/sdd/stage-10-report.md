# Stage 10 report — feed/FeedCard

## Files created

- `components/feed/FeedCard.logic.ts` — `FeedScope`, `FEED_SCOPE_KEYS`, `feedScopeMeta`, `feedCardMeta` exactly per brief GREEN, plus one additional export not in the brief's required interface: `feedTagToneTokenKeys(kind)` — resolves the optional `tag` pill's bg/fg token paths (announcement → `primarySoft`/`primaryPressed`, update → `statusRamp.presentSoft`/`status.present`), kept as a pure logic function per the kit's convention of pushing render-affecting branching out of `.tsx` files (`Comment.logic.ts`/`ComplianceBar.logic.ts` precedent) rather than inlining it in `FeedCard.tsx`.
- `components/feed/__tests__/FeedCard.logic.test.ts` — the RED test verbatim from the brief.
- `components/feed/FeedCard.tsx` — the component, built on `core/Card` + `core/RoleBadge`, ported from `design/sankalp/bv-connect/components/feed/FeedCard.{jsx,d.ts}`.

## TDD sequence

1. RED: wrote the test file, ran `npx vitest run components/feed/` → failed with `Cannot find module '../FeedCard.logic'` (module didn't exist yet). Confirmed fail.
2. GREEN: wrote `FeedCard.logic.ts` verbatim per brief → `npx vitest run components/feed/` → 5/5 passed.
3. Implemented `FeedCard.tsx`, re-ran the same suite → still 5/5 passed (tsx isn't test-covered directly, matching this kit's pattern of testing only `.logic.ts` under vitest and hand-verifying `.tsx` wiring at `/build`, per `vitest.config.ts`'s RN-mock scoping).
4. `npx tsc --noEmit -p tsconfig.json` → 0 errors. `npx eslint components/feed/FeedCard.tsx components/feed/FeedCard.logic.ts` → clean. Full suite `npx vitest run` → 48 files / 324 tests passed, no regressions.

## Test results

`npx vitest run components/feed/` → **1 file, 5 tests, all passed** (`FEED_SCOPE_KEYS`/`feedScopeMeta` × 2, `feedCardMeta` × 3).

## Implementation notes / how the render was ported

- **Tap targets**: `Card.tsx` (`CardProps`) exposes no `onPress` — it's already a `Pressable` internally but only wires `onHoverIn`/`onHoverOut` for the `interactive` hover-lift. Since the brief prohibits editing Stage-1 core files, `FeedCard` wraps `<Card>` in its own outer `<Pressable onPress={onOpen}>` to serve as "the card body" tap target, and separately wraps the comment-count row in a second, nested `<Pressable onPress={onOpen}>` per the brief's explicit "comment-count Pressable" requirement. Both fire the same `onOpen` — no other element is tappable (time/reach text are plain `View`/`Text`, not wrapped). This intentionally diverges from the `.jsx` reference, where the *entire* `<article onClick={onOpen}>` — including the footer — is one DOM click target via bubbling; RN has no bubbling-onClick equivalent through a non-onPress-accepting `Card`, so I replicated the brief's explicit "card body + comment count only" rule rather than the reference's literal event-bubbling scope. Both interpretations produce the same practical behavior since the whole card face already fires `onOpen`.
- **Title font**: `feedCardMeta(kind, pinned).titleFont` drives `'display'` (Marcellus, no `fontWeight`, per the global constraint) vs `'body'`. For the update-kind title, the `.jsx` reference uses `fontWeight: 600`, which I represented via `theme.fonts.semibold` (family swap, not a paired `fontWeight` prop) — same pattern as `RoleBadge.tsx`'s label and `ListRow.tsx`'s title.
- **Icons**: no shared icon module exists for arbitrary content icons (the only shared icon file, `components/icons/TabIcons.tsx`, is scoped to bottom-tab icons and keyed by `TabKey`, not reusable here). Followed `Comment.tsx`/`ConversationRow.tsx` precedent: small private `react-native-svg` icon components inlined directly in `FeedCard.tsx` (pin, clock, reach/people, comment, homework/book), ported 1:1 from the `.jsx` reference's inline `<path>` data.
- **Token substitutions**: values that hit a token exactly (space 8/12/16, `scale.sm`=14, `scale.xs`=13, `scale.eyebrow`=11, `tracking.display`=.005) were used directly. Values that don't hit a token were either (a) nearest-token-substituted with an inline comment (RoleBadge.tsx/CenterRollupRow.tsx precedent — e.g. scope-pill padding, footer 12px→`eyebrow`), or (b) kept as a disclosed literal where neither token is a clean fit (header-row `marginBottom: 11`, title `fontSize: 20` — exactly between `scale.lead`=18 and `scale.h3`=22, dot diameter 7px matching `RoleBadge.tsx`'s own undisclosed 9px dot precedent).
- **`tag` prop**: the brief's Stage 10 bullet enumerates header row / title / pin / homework / footer but doesn't explicitly call out the `tag` pill, even though it's present in both `FeedCard.jsx` and `FeedCard.d.ts` (`tag?: React.ReactNode`, small uppercase "Homework"/"Reminder" pill). I included it for port fidelity since it's a non-interactive decorative pill (doesn't add a tap target, doesn't conflict with the "only card body + comment count" rule). Flagging this as a judgment call below rather than blocking on it.
- **Homework callout / tag success-tint**: the `.jsx` reference uses CSS vars `--success`/`--success-soft`/`--success-line` that don't exist as their own token group in `lib/theme.ts`. Mapped to `statusRamp.present`/`presentSoft`/`presentLine`, matching the established codebase convention for "success green" (`ComplianceBar.logic.ts`'s `TONE_TOKEN_KEYS.success → 'status.present'`, `CsvImport.tsx`, `ConsentCapture.tsx`, `UserRoleRow.tsx` all resolve success-tint the same way).
- Reach/comments are `fontVariant: ['tabular-nums']` per the global constraint; `time` is left plain (not a compared/counted number).

## Gallery note (verbatim, for Stage 13's gallery harness — not built here)

FeedCard: org announcement pinned, center update with homework, class update no homework.

## Concerns

1. **`tag` prop inclusion** (see above) — included for fidelity to the `.jsx`/`.d.ts` reference though not explicitly named in the Stage 10 implementation bullet. Low risk: it's decorative only, adds no tap target, and doesn't touch any of the brief's named interfaces. Flagging in case the intent was to scope it out.
2. **Outer-Pressable-wraps-Card structural divergence** (see Implementation notes above) — necessary because `Card.tsx` has no `onPress` prop and editing it was out of scope. Functionally equivalent to the reference's whole-card click target; documented inline in `FeedCard.tsx`'s top comment.
3. No visual/gallery verification was performed (no gallery harness exists yet — that's Stage 13's scope per the brief's "don't build the gallery" instruction). Render correctness on RN-Web/native Expo has not been hand-verified; only logic tests, typecheck, and lint were run, consistent with how prior stages (1-9) report `.tsx` verification deferred to `/build`.

## Fix report

Addressed both Important findings from Stage 10 review.

1. **Comment-count tap target width** — `FeedCard.tsx`'s `commentsAction` style (footer comment-count `Pressable`) had `minHeight: theme.chrome.hitMin` but no `minWidth`, so the actual tappable width (icon + small gap + 1-3 digit number) was well under the 44px touch-target rule. Added `minWidth: theme.chrome.hitMin` alongside the existing `minHeight`, matching the squared-target precedent in `ConversationRow.tsx`'s `avatar` style and `UserRoleRow.tsx`'s `iconBtn` (both use `theme.chrome.hitMin` for width). Since `commentsAction` already has `marginLeft: "auto"` pushing it to the footer's right edge and the row has no competing element to its right, growing its `minWidth` to 44px doesn't crowd the `time`/`reach` figures — it only pads inward from the card's own right edge.

2. **Untested `feedTagToneTokenKeys` export** — this function (added beyond the brief's literal GREEN code to resolve the `tag` pill's tone) had zero test coverage, violating the repo's non-negotiable TDD rule. Added a `describe('feedTagToneTokenKeys', ...)` block to `components/feed/__tests__/FeedCard.logic.test.ts` covering both branches: `'announcement'` → `{ bg: 'primarySoft', fg: 'primaryPressed' }` and `'update'` → `{ bg: 'statusRamp.presentSoft', fg: 'status.present' }`, following the same one-line-`it()` style as the existing tests in that file and the `TONE_TOKEN_KEYS` contract-test precedent in `components/dashboard/__tests__/ComplianceBar.logic.test.ts`. Verified both token paths (`primarySoft`/`primaryPressed` in `lib/theme.ts:41-42`, `status.present`/`statusRamp.presentSoft` in `lib/theme.ts:19,52`) actually resolve to real theme colors before writing the assertions, so the test checks genuine correct behavior rather than mirroring whatever the implementation happened to return.

### Verification

- `npx vitest run components/feed/` → **1 file, 7 tests, all passed** (5 original + 2 new `feedTagToneTokenKeys` tests).
- `npx tsc --noEmit -p .` → 0 errors.
- Full suite `npx vitest run` → **48 files / 326 tests passed**, no regressions (up from 324 pre-fix).

## Fix report

A Playwright smoke check of the `/kit-gallery` dev route found a genuine hydration-validity bug: `FeedCard.tsx` nested the comment-count `Pressable` (`styles.commentsAction`) inside the outer card-body `Pressable`. On RN-Web, both `Pressable`s carried `accessibilityRole="button"` and rendered as real HTML `<button>` elements, and HTML forbids a `<button>` nested inside another `<button>` — Playwright confirmed a "`<button>` cannot contain a nested `<button>`... this will cause a hydration error" console error on every render.

This is a necessary RN-Web-specific divergence from `design/sankalp/bv-connect/components/feed/FeedCard.jsx`, not a reference-fidelity regression: the reference uses a single DOM `<article onClick>` with a nested `<button>` for comments, which is valid HTML (a `<button>` can nest inside a non-button clickable `<article>`) — it's RN's `Pressable`-renders-as-`<button>` behavior on web that makes the direct 1:1 port invalid.

**Restructuring** — the two `Pressable`s are now DOM siblings instead of nested:

- The outermost element changed from `<Pressable onPress={onOpen} style={style}>` to a plain `<View style={style}>` — no longer a tap target itself.
- A new inner `<Pressable onPress={onOpen} accessibilityRole={onOpen ? "button" : undefined}>` wraps only the "main card body" region — header row, title, body, and the homework strip — inside `<Card>`. This is the first of the two required tap targets ("the card body").
- The footer (`time` / `reach` / comment-count) moved out from inside that body `Pressable` to be its own sibling `<View style={styles.footer}>`, still inside `<Card>` but after the body `Pressable`, not nested in it. `time` and `reach` remain plain, non-interactive `View`/`Text` (unchanged from before — they were never independently tappable). The comment-count `<Pressable onPress={onOpen} style={styles.commentsAction} accessibilityRole="button">` is unchanged in content/props and stays inside the footer, now a sibling of the body `Pressable` rather than a descendant.
- Visual layout is unaffected: `Card`'s children still stack in the same vertical order (header/title/body/homework, then footer), since wrapping the first group in one extra `Pressable` (which behaves like a plain block container) doesn't change flex flow.
- Both tap targets still fire the same `onOpen` handler, preserving the Stage 10 brief's requirement: "only the card body and the comment count are tap targets, both firing `onOpen`."
- Updated the file's top divergence comment to document the new structural rule (siblings, never nested) so future edits don't reintroduce the bug.

### Verification

1. `npx vitest run components/feed/` → **1 file, 7 tests, all passed** (unchanged — no logic changes, `.tsx` isn't under vitest).
2. `npx tsc --noEmit -p .` → 0 errors.
3. **Structural check** (read the fixed file back): the two explicit `Pressable`s in `FeedCard.tsx` — the body `Pressable` (header/title/body/homework) and the comments `Pressable` (footer) — are siblings under `<Card>`, neither is a JSX descendant of the other. `Card.tsx`'s own internal `Pressable` (untouched, out of scope) carries no `accessibilityRole`, so it renders as a `<div>` on RN-Web, not a `<button>`, and doesn't contribute to the nesting problem.
4. **Live browser verification via Playwright**: booted `EXPO_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321" EXPO_PUBLIC_SUPABASE_ANON_KEY="placeholder-anon-key-for-web-smoke-check" npx expo start --web` and drove Playwright against `/kit-gallery`. The accessibility-tree snapshot of the FeedCard gallery section shows each card as a `generic` (div) container with a sibling `button` (card body) and a sibling `generic` footer containing its own `button "N"` (comment count) — confirming no button-in-button nesting in the rendered DOM. Console output: **0 errors, 2 warnings** — both warnings are a pre-existing, unrelated Expo Router `[Layout children]: No route named "(dev)" exists...` message, not a hydration/nesting error. The dev server was stopped after verification.

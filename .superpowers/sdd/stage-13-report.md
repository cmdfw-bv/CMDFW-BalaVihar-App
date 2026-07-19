# Stage 13 report — gallery harness + route registration

Status: **DONE_WITH_CONCERNS**

Commit range: `62399a1..6fa163b` (two new commits on top of the Stage 12 tip):
- `43c92e9` — feat: register (dev) route group for kit-gallery (sankalp-component-kit)
- `6fa163b` — feat: add kit-gallery playwright verification harness (sankalp-component-kit)

## Task 13.1 — Register the `(dev)` route group

Added the exact always-declared line from the brief to `app/_layout.tsx`, immediately after
`auth/callback` and before the `Stack.Protected` blocks:

```tsx
<Stack.Screen name="(dev)" />
```

Committed alone as `43c92e9`.

## Task 13.2 — `app/(dev)/kit-gallery.tsx`

Created a single scrollable dev screen with 28 `Section`s, one per component, in the same order
as the brief's numbered fixture-coverage list (Button → MagicLinkLogin). Every prop value is a
hand-written literal — no Supabase, no data-fetching. `import "../../lib/unistyles"` is the first
line, matching `components/core/*.tsx`'s depth.

For each of the 28 components I opened the `.tsx` (and, where present, the paired `.logic.ts`)
file and matched the fixture props to the **actual** exported `Props` type rather than assuming
shapes, per the brief's instruction. Notable actual shapes (some as flagged by the brief, some I
had to verify myself):

- `ConversationRow`'s `name` and `Comment`'s/`UserRoleRow`'s `name` are `React.ReactNode`, not
  `string` (each component internally guards with `typeof name === "string"` before deriving an
  avatar initial) — confirmed, matches brief.
- `UserRoleRow` exports `RoleId` (`= RoleKey`) and `UserRoleAssignment { role; scope? }` for its
  `roles?: (RoleId | UserRoleAssignment)[]` prop — confirmed, matches brief. Used a mixed array
  (`["coordinator", { role: "teacher", scope: "JR·A" }, { role: "admin" }, "bv"]`) for the
  multi-role-wrapping fixture.
- `NotificationItem` uses `NotificationType = "update" | "announce" | "absence" | "approval" |
  "chat"` from `NotificationItem.logic.ts` — confirmed, matches brief.
- Every core primitive (`Button`, `Card`, `Field`, `StatusChip`, `StatTile`, `SegmentedTabs`,
  `Stepper`, `RoleBadge`, `ListRow`, `StateView`) exports its variant/status/tone union type from
  a co-located `*.logic.ts`, several of which also export the literal-value array (e.g.
  `STATUS_CHIP_KEYS`, `ROLE_KEYS`) — I imported and iterated those directly instead of
  hand-typing the union members, so the gallery can't silently drift out of sync with a future
  added variant.
- `PersonaSwitcher` has **no controlled `open` prop** — the sheet's open/closed state is fully
  internal (`useState` in the component itself). The brief's fixture note asks for "closed pill,
  open sheet with 3 roles including bv" as if these were two independent renderable states; they
  aren't from the outside. I rendered one interactive instance (roles array has 3 personas
  including `role: "bv"`, wired to real `useState` so switching the active role is genuinely live)
  with a caption noting the sheet opens on tap. This is the one place I simplified vs. a literal
  reading of the brief — flagging per the report contract.
- `Card`'s `interactive` hover-lift is web-only (uses `onHoverIn`/`onHoverOut`); the "3 tones ×
  interactive on/off" grid renders correctly either way since `interactive={true}` with no pointer
  simply never shows the hovered style on native — no code change needed, just noting it.
- Several `theme.chrome.hitMin`/disclosed-literal precedents I found while reading (not surprises,
  just consistent with the codebase's prior review pattern) — no impact on the gallery itself.

No other component's actual prop shape differed meaningfully from what a straightforward reading
of its `.tsx` file would suggest — the brief's two called-out examples (`ConversationRow.name`,
`UserRoleRow`'s `RoleId`/`UserRoleAssignment`) were both confirmed as-described.

Committed alone as `6fa163b`.

## Verification

### Typecheck

```
npx tsc --noEmit -p .
```
Exit code `0`, no output — the gallery typechecks cleanly against every component's real prop
types, including the mixed-literal `UserRoleRow.roles` array and all the imported logic-module
union types.

### Lint

```
npm run lint   (expo lint)
```
One error, pre-existing and unrelated to this stage:
```
components/auth/MagicLinkLogin.tsx
  74:54  error  `'` can be escaped with `&apos;`… react/no-unescaped-entities
```
This is in a Stage 12 component file I was told not to edit; `app/(dev)/kit-gallery.tsx` and
`app/_layout.tsx` introduce zero new lint findings.

### Dev server / visual check

I was able to boot the dev server in this environment (`npx expo start --web --port 8098`) and
actually navigate to `/kit-gallery`:

- First boot attempt: every route (including `/`) 500'd with `Error: supabaseUrl is required` —
  `SessionProvider`/the Supabase client construction happens unconditionally in the root layout
  for every route (this repo ships no `.env`, only `.env.example`), so this is a pre-existing
  environment gap, not something caused by this stage's changes.
- I created a throwaway local `.env` (client-safe `EXPO_PUBLIC_SUPABASE_URL` + a placeholder
  anon-key string only — no real credentials, `.env` is gitignored, deleted again after the test)
  purely to get past that unrelated crash for the smoke check, restarted the server, and re-fetched.
- `GET /kit-gallery` → `200`. The response body contains all 28 expected `Section` titles
  (`Button`, `Card`, … `MagicLinkLogin`), each exactly once except where a component's own name
  also appears as an author/body-copy substring (`Comment` appears 3×, `Button` 16× — both
  because the words "Comment"/"Button" also occur inside sibling components' rendered text, e.g.
  `CommentThread`'s "comment(s)" label and `CommentComposer`'s placeholder). No fatal render
  errors in the server log for this route.
- One benign warning appeared on every request:
  `[Layout children]: No route named "(dev)" exists in nested children: [..., '(dev)/kit-gallery', ...]`
  — because the `(dev)` folder has no `_layout.tsx` of its own, Expo Router flattens the
  single-child group and the resolved route tree shows the leaf as `(dev)/kit-gallery` rather
  than a bare `(dev)` entry matching the brief's literal `<Stack.Screen name="(dev)" />`. Despite
  the warning, the route **did** render correctly for this direct-URL SSR fetch — I did not
  independently confirm this also holds for in-app client-side `router.push` navigation after
  hydration (no interactive browser session in this environment). I implemented exactly the diff
  the brief specified rather than deviating (e.g. by also adding a `(dev)/_layout.tsx` — out of
  the stated task scope for this stage), but flagging this warning for whoever runs the
  manual/Playwright `/test` pass, since it may be worth a small follow-up (either accepting the
  warning as harmless, or adding a minimal `_layout.tsx` under `(dev)/` in a later stage if
  client-side navigation ever fails to reach it).
- I did not have a Playwright browser available in this sandbox (`playwright` isn't in
  `node_modules`) to take an actual rendered screenshot, so I'm not claiming a pixel-level visual
  pass — the verification above is HTTP-response-content-based (status 200 + all 28 section
  markers present + no fatal errors), not a screenshot.

## Concerns summary (for the controller)

1. **PersonaSwitcher's "open sheet" fixture state** can't be forced from the gallery (no
   controlled `open` prop on the component) — rendered as one interactive instance with 3 roles
   incl. `bv`, opens on tap; not two static before/after states as a literal reading might imply.
2. **`(dev)` route-group Expo Router warning** — harmless for the direct-URL SSR path I tested;
   unverified for in-app client-side navigation. Worth a look during `/test`.
3. Everything else typechecks, lints clean (aside from the pre-existing unrelated
   `MagicLinkLogin.tsx` lint error), and rendered with real content over HTTP in this environment.

## Fix report — theme token usage in kit-gallery

Replaced raw-pixel literals with theme tokens in `app/(dev)/kit-gallery.tsx` styles object:

- `initialCircle`: `width: 40, height: 40, borderRadius: 20` → `width: theme.space["10"], height: theme.space["10"], borderRadius: theme.space["10"] / 2`
- `iconCircle`: `width: 40, height: 40, borderRadius: 20` → `width: theme.space["10"], height: theme.space["10"], borderRadius: theme.space["10"] / 2`
- `miniBar`: `width: 64, height: 8` → `width: theme.space["16"], height: theme.space["2"]`

Added disclosure comments to styles without matching tokens:

- `cardCell`: added `// no matching token — arbitrary flex-wrap cell width`
- `csvCell`: added `// no matching token — arbitrary flex-wrap cell width`

Verified: `npx tsc --noEmit -p .` passes with clean exit (no TypeScript errors).

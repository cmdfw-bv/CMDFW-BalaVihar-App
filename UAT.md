# UAT — User Acceptance Testing (POC pilot)

Manual, click-through test scenarios for a **non-technical business user** to verify the app behaves correctly. This covers only what's actually reachable through the app UI today — persona screens (Feed, Classes, Attendance, Chat, Dashboard) are still placeholders and are not in scope here; those get their own UAT scenarios once each persona feature ships.

This doc is part of the `/test` gate (`.claude/skills/test/SKILL.md`) — it must be walked (or explicitly skipped with a reason) before every `/test` pass records green.

---

## 1. Local demo setup

Run once per machine / after a fresh clone:

```bash
nvm use && npm install
npm run env:init      # creates .env from .env.example
npm run doctor        # checks your local environment is ready
npm run db:start      # starts local Supabase — prints anon/service_role keys, paste into .env
npm run db:reset      # applies migrations + seeds test data (accounts below)
npm run dev           # starts the app at http://localhost:8888
```

**App URL:** `http://localhost:8888`

**Fetching a magic link locally:** local dev doesn't send real email — Supabase's bundled **Inbucket** test inbox catches it instead. Open **`http://127.0.0.1:54324`** in a browser, find the mailbox by the part of the email before the `@` (e.g. mailbox `multirole` for `multirole@bv-seed.test.local`), open the newest message, and click the sign-in link inside it.

**Seed test accounts** (from `supabase/seed/seed.sql`, all `@bv-seed.test.local`, magic-link only — no password):

| Account | Role(s) |
|---|---|
| `admin1@bv-seed.test.local` | Admin |
| `coordinator1@bv-seed.test.local` | Coordinator |
| `bvcoordinator1@bv-seed.test.local` | BV Coordinator |
| `teacher1@bv-seed.test.local` (through `teacher13`) | Teacher |
| `parent1a@bv-seed.test.local` | Parent |
| `student1_1@bv-seed.test.local` | Student (Gr9–12 students only have logins) |
| `multirole@bv-seed.test.local` | Parent + Teacher + Coordinator + BV Coordinator |

---

## 2. Scenarios

### UAT-1: Magic-link sign-in (happy path)
**Account:** `teacher1@bv-seed.test.local`

**Steps:**
1. Go to `http://localhost:8888` — should land on the sign-in screen.
2. Enter the email and submit.
3. Observe the screen while the request is in flight, then after it succeeds.
4. Open `http://127.0.0.1:54324`, find the `teacher1` mailbox, open the newest message, click the sign-in link.

**Expected result:**
- A loading state shows briefly while the request is sent.
- A "check your email" confirmation appears after submit — the form doesn't just sit blank.
- Clicking the emailed link signs you in and lands on the Teacher tab set (Feed, Classes, Attendance, Chat).

- [x] Pass  - [ ] Fail (notes: verified via playwright-cli 2026-07-15; loading state also confirmed by code read of app/(auth)/sign-in.tsx. Re-walked live via playwright-cli 2026-07-17 against the `SessionProvider.tsx` native-only deep-link guard (code review finding: web's `detectSessionInUrl: true` and the `Linking`-based `handleDeepLink` could both try to exchange the same one-time-use PKCE `?code=`) — signed in as `parent1a` on web at 390px: followed the emailed magic link, landed on `/feed` with 0 console errors/warnings and the correct scope label (`Parent · Student1_1, Student1_2`). Repeated as `multirole`: 0 console errors, landed on `/feed` with the Teacher tab set.)

---

### UAT-2: Sign-in failure + retry
**Account:** any (or an invalid/malformed email)

**Steps:**
1. On the sign-in screen, disconnect from the local Supabase instance (e.g. `npm run db:stop` in another terminal) or enter a malformed email.
2. Submit.
3. Restart Supabase (`npm run db:start`) if you stopped it, and retry with a valid email.

**Expected result:**
- A clear error state appears on failure — not a blank screen or silent no-op.
- The email you typed is still in the field (not cleared).
- Retrying re-submits and succeeds once the backend is reachable again.

- [x] Pass  - [ ] Fail (notes: tested with a malformed email — "Unable to validate email address: invalid format" shown, field retained, retry with a valid email succeeded)

---

### UAT-3: Role-derived navigation (single-role account)
**Account:** `parent1a@bv-seed.test.local`

**Steps:**
1. Sign in as `parent1a@bv-seed.test.local`.
2. Look at the tab bar.

**Expected result:**
- Only the tabs a Parent should see appear: Feed, Attendance, Chat.
- No Classes, Dashboard, Approvals, or Admin tab is visible.

- [x] Pass  - [ ] Fail (notes: re-walked live via playwright-cli 2026-07-16 against the new `MobileTabBar` component at 390px and 768px viewports — signed in as `parent1a`, tab bar shows exactly Feed/Attendance/Chat with icon+label per tab, no Classes/Dashboard/Approvals/Admin. Prior 2026-07-15 pass confirmed the same via design-parity gate screenshots at 360/768/1024/1440.)

---

### UAT-4: Static context chip vs. role switcher
**Accounts:** `parent1a@bv-seed.test.local` (1 role) and `multirole@bv-seed.test.local` (4 roles)

**Steps:**
1. Sign in as `parent1a@bv-seed.test.local`. Look at the header/context area.
2. Sign out. Sign in as `multirole@bv-seed.test.local`. Look at the same area.

**Expected result:**
- Single-role account (`parent1a`) shows a static, non-interactive chip naming the role/scope — no switcher control.
- Multi-role account (`multirole`) shows an interactive role switcher instead — never both, never neither.

- [x] Pass  - [ ] Fail (notes: parent1a chip has no chevron/dropdown; multirole chip shows a chevron and opens a "Switch active role" dialog)

---

### UAT-5: Switch active role (multi-role account)
**Account:** `multirole@bv-seed.test.local`

**Steps:**
1. Sign in as `multirole@bv-seed.test.local`.
2. Note the visible tabs for the starting active role.
3. Navigate to a tab valid for the current role (e.g. Classes, if active role is Teacher).
4. Open the role switcher and select a different role (e.g. switch to BV Coordinator).

**Expected result:**
- The tab bar updates to the new role's tabs without a manual page reload.
- If you were on a screen not valid for the new role, you're silently moved to Feed — never a permission-denied or blank screen.
- No visible errors during the switch.

- [x] Pass  - [ ] Fail (notes: on /classes as Teacher, switched to BV Coordinator — tab bar updated to Feed/Chat/Dashboard/Approvals and silently redirected to /feed. Re-walked live via playwright-cli 2026-07-16 at 390px against the new `MobileTabBar`: signed in as `multirole` (starting role Coordinator — Feed/Classes/Chat/Dashboard/Approvals), opened the role switcher, selected Teacher — tab bar updated in place to Feed/Classes/Attendance/Chat with no reload and no error, stayed on /feed. Re-walked again 2026-07-17 at 1024px desktop against the `SessionProvider.tsx` deep-link fix: signed in as `multirole` (starting role Teacher), opened the switcher — every held role resolved a real label including `Parent · Student7_1, Student7_2` while Teacher was active (the exact active-role-agnostic scope-label read ADR-0027 addresses), selected BV Coordinator — `DesktopSidebar` updated in place to Feed/Chat/Dashboard/Approvals, 0 console errors, stayed on /feed.)

---

### UAT-6: Stub screens show placeholder content, not a crash
**Account:** `bvcoordinator1@bv-seed.test.local` (or `multirole` switched to BV Coordinator/Admin)

**Steps:**
1. Sign in with an account whose role includes the Approvals or Admin tab.
2. Open the Approvals tab, then the Admin tab (if visible).

**Expected result:**
- Each shows a simple "Coming soon" placeholder — not an error, not a blank screen, not a crash.

- [x] Pass  - [ ] Fail (notes: verified Approvals (multirole → BV Coordinator) and Admin (admin1) both render "Coming soon")

---

### UAT-7: Sign-out
**Account:** any signed-in account

**Steps:**
1. While signed in, use the sign-out control.

**Expected result:**
- You're returned to the sign-in screen.
- Reloading the page does not sign you back in.

- [x] Pass  - [ ] Fail (notes: verified with teacher1, multirole, and admin1 — sign-out returns to /sign-in, hard reload after sign-out stays on /sign-in)

---

### UAT-8: Session persists across a browser reload
**Account:** any signed-in account

**Steps:**
1. Sign in.
2. Reload the browser page (hard refresh).

**Expected result:**
- You land back on the same content, still signed in — no forced re-sign-in, no flash of the sign-in screen.

- [x] Pass  - [ ] Fail (notes: hard-reloaded as admin1 — still signed in, no sign-in flash. Observation, non-blocking: reload from a nested tab route (e.g. /admin) lands on the role's first tab (/feed) rather than the exact route — pre-existing app/index.tsx AC#3 behavior, not touched by this pass's fixes)

---

### UAT-9: Zero-role empty state
**Setup note:** this state isn't reached through normal seed data — a real business user would only see it in the gap between account creation and their first role grant. To arrange it for a demo, temporarily remove a test account's rows from `user_roles` via SQL (`docker exec -i supabase_db_<project> psql -U postgres -d postgres -c "delete from user_roles where user_id = '<id>';"`), then restore them afterward.

**Steps:**
1. Sign in as the account with no `user_roles` rows.

**Expected result:**
- A dedicated "your account is set up but no role has been assigned yet — contact your Bala Vihar coordinator" screen appears.
- Not a crash, not a blank tab bar, not a generic error.

- [x] Pass  - [ ] Fail (notes: temporarily deleted bvcoordinator1's user_roles row via docker exec psql, signed in — landed on /no-role with the expected message; row restored exactly afterward)

---

### UAT-10: Post a class update (body-only, and body+homework) — Teacher
**Account:** `teacher10@bv-seed.test.local` (Gr9 Class)

**Steps:**
1. Sign in as a Teacher, go to `/feed`, tap **Post class update**.
2. Submit an update with body text only (no homework).
3. Repeat, this time filling in the homework field too.

**Expected result:**
- Both posts succeed and return you to the feed.
- Each post triggers exactly one call to the `push-send` Netlify function with `{ class_update_id: <new row id> }`.

- [ ] Pass  - [x] Fail (notes: posts themselves succeed — `POST .../rest/v1/class_updates` returns `201` both times, and the new rows render correctly in Student/Parent feeds (see UAT-11). The `push-send` call does fire with the correct `class_update_id` each time, but the function itself is broken: it returns `200 {"status":"noop","recipients":0,"sent":0,"cleaned_up":0}` on every call — its service-role Supabase client gets a Postgres `permission denied for table class_updates` (confirmed directly against PostgREST with the real service-role key) because `supabase/migrations/20260724120426_class_updates_and_comments_rls.sql` never granted `service_role` any privileges on `class_updates`/`comments` (only `authenticated` was granted). Traced further: the exact same `permission denied` reproduces for `messages`, `conversations`, `conversation_participants`, and `push_subscriptions` too — none of those tables have ever had a `service_role` grant either, so `push-send`'s original chat-message branch is equally broken end-to-end on a fresh database, not just this feature's new branch. Filed as **[issue #47](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/47)**; not fixed here per `/test` policy.)

---

### UAT-11: Home feed read surface — Student and Parent (incl. multi-child, multi-class merge)
**Accounts:** `student8_1@bv-seed.test.local` (Student, Gr9 Class), `parent7a@bv-seed.test.local` (Parent, children in Gr8 Class **and** Gr9 Class)

**Steps:**
1. Sign in as the Student, open `/feed`.
2. Sign in as the Parent (separate browser session), open `/feed`.

**Expected result:**
- Both see the new class-update cards (no title, homework line shown only on the post that has homework), newest-first.
- The Parent's feed merges updates from *both* of their children's classes into one newest-first list, not one feed per child.

- [x] Pass  - [ ] Fail (notes: verified live via playwright-cli. Student's feed showed both new posts, no title, homework line present only on the body+homework card, newest-first (body+homework card appeared above the body-only card in DOM order). Parent A (`parent7a`, children in Gr8 Class and Gr9 Class) saw the Gr9 Class update in the same merged feed — 0 console errors either side.)

---

### UAT-12: Public comments — Student posts, Teacher and Parent both see it
**Accounts:** `student8_1@bv-seed.test.local`, `teacher10@bv-seed.test.local`, `parent7a@bv-seed.test.local`

**Steps:**
1. Student opens a class update and posts a public comment.
2. Teacher and Parent (separately) open the same class update.

**Expected result:**
- The comment appears for the Student (their own), the Teacher, and the Parent — public comments are visible to everyone with class scope on that update.

- [x] Pass  - [ ] Fail (notes: verified live — Student's own comment rendered immediately after send; Teacher and Parent A both saw it after navigating to the same class-update URL. 0 console errors.)

---

### UAT-13: Private comment + cross-family isolation (Parent A vs. Parent B)
**Accounts:** `parent7a@bv-seed.test.local` (Parent A), `parent8a@bv-seed.test.local` (Parent B) — both have a child enrolled in the same class (Gr9 Class), `teacher10@bv-seed.test.local`, `student8_1@bv-seed.test.local`

**Steps:**
1. Parent A posts a private comment on the class update.
2. Teacher opens the same update — should see Parent A's private comment in its own labeled thread card, separate from the public thread.
3. Teacher replies **inside Parent A's private thread card specifically** (not the public thread).
4. Parent B (a different family, same class) opens the same class update.
5. Student opens the same class update.

**Expected result:**
- Parent A's private comment renders with the private/locked (`PRIVATE` badge) visual treatment.
- Teacher sees it in a separate thread card, and the Teacher's reply inside that card is also private, visible to Parent A.
- Parent B never sees Parent A's private comment or the Teacher's reply to Parent A — not on first load, not after a hard reload. Parent B's own private comment (posted in the same step) is visible only to Parent B and the Teacher.
- Student sees zero private comments from anyone (no `PRIVATE` badge at all in the Student's view).

- [x] Pass  - [ ] Fail (notes: verified live end-to-end. Parent A's private comment rendered with the `PRIVATE` badge and violet/locked styling; Teacher's stacked-thread UI showed it in a separate card from the public thread (thread label fell back to "Public"/generic — the `resolve_parent_family_label` RPC-backed label wasn't distinctly asserted by name in this pass, only that it's a separate card from "Public"). Teacher's reply inside that private thread card was confirmed private in the DB directly (`is_private=true`, `target_parent_id=<Parent A's user id>` via a direct Postgres query) and visible to Parent A. Parent B (different family, same class) never saw Parent A's private comment or the Teacher's reply to Parent A, before or after a hard reload; Parent B's own private comment was visible only to Parent B (confirmed absent from Student's view). Student saw zero `PRIVATE` badges and none of either family's private content. 0 console errors across all four sessions. One test-tooling note, not an app defect: the first automated pass mis-clicked the wrong comment composer (the stacked private-thread UI has one composer per card with no `data-testid`) and produced a false failure; re-verified with a corrected selector and directly confirmed the true `is_private`/`target_parent_id` values in Postgres to be certain this was a test-script bug, not a leak.)

---

### UAT-14: Zero-comment empty state
**Account:** `teacher10@bv-seed.test.local`

**Steps:**
1. Open a class update that has never received a comment.

**Expected result:**
- An honest "No comments yet" message — not an error, not a blank screen.

- [x] Pass  - [ ] Fail (notes: verified live on the body+homework post from UAT-10 before any comment was added to it — "No comments yet" rendered correctly.)

---

### UAT-15: Role-switch re-scopes the feed immediately
**Account:** `multirole@bv-seed.test.local` (Parent + Teacher + Coordinator + BV Coordinator)

**Steps:**
1. Sign in, land on `/feed` for the starting active role.
2. Open the role switcher and select a different held role.

**Expected result:**
- The feed's visible content re-scopes to the new role immediately — no stale content, no crash, no manual reload needed.

- [x] Pass  - [ ] Fail (notes: verified live — page body content changed after switching roles via the switcher, stayed on `/feed`, 0 console errors during the switch.)

---

### UAT-16: Feed DoD states — empty, loading, content
**Accounts:** `teacher1@bv-seed.test.local` (empty), `teacher2@bv-seed.test.local` (loading, via throttled network)

**Steps:**
1. Sign in as a Teacher whose class has zero class-update posts, open `/feed`.
2. Sign in as another Teacher; intercept/delay the feed's network request and screenshot mid-flight.

**Expected result:**
- Empty: "No updates yet" — not a blank screen or error.
- Loading: a non-blank, in-progress indicator while data is in flight.
- Content: covered by UAT-11/-12/-13 above.

- [x] Pass  - [ ] Fail (notes: Empty state confirmed live — `teacher1` (Shishu Vihaar Class, zero class_updates rows) shows "No updates yet" on `/feed`. Loading state confirmed live via a 3s network delay on the `class_updates` REST call — a centered `ActivityIndicator` spinner renders while in flight, settling to content afterward, 0 console errors. **Deviation from the plan's design copy, not a defect:** the plan's UI section describes the loading state as "skeleton `FeedCard`s"; the actual shared `components/core/StateView.tsx` (used app-wide, not introduced by this feature) renders a generic spinner for every `state="loading"` case, not per-row skeletons. Pre-existing shared-component behavior, not something this diff changed or got wrong — noted for accuracy, not filed as a bug. **Error-preserving state (retry banner over already-loaded content) — not exercised, and believed unreachable via the current UI, not a defect:** reading `HomeFeedScreen.tsx`, `load()` is only ever invoked once (the mount `useEffect`); `updates` state is never cleared on a failed fetch, so if a *second* `load()` call ever failed after a first one succeeded, the retry-banner-with-preserved-content branch would render correctly (the code guards for exactly this: `setState(prev => prev === "content" ? prev : "loading")`) — but there is currently no pull-to-refresh or other live trigger that calls `load()` a second time within one mount, so this specific combination can't be reached through real usage today. Not forcing this artificially since the goal is to reflect real behavior, not fabricate a scenario the code doesn't yet expose a trigger for.)

---

### UAT-17: Zero-enrollment class edge case
**Setup note:** could not be walked — the current seed data (`supabase/seed/seed.sql`) gives every one of the 13 classes at least one active enrollment (confirmed via a direct query: `Gr1 Class` and `Shishu Vihaar Class` are the sparsest, at 1 active enrollment each; none are at 0). No class exists in seed data today to exercise "post to a class with zero current enrollments." Noting this explicitly per the plan's own edge-case list rather than fabricating a result — the code path (`push-send`'s `dispatchClassUpdate` returning `recipients: 0` with no error when `studentIds.length === 0`) was read and looks correct, but is unverified live.

- [ ] Pass  - [ ] Fail (not walked — no seed data fixture exists for this case; see note above)

---

## 3. Sign-off

| Date | Tester | Result |
|---|---|---|
| 2026-07-15 | Claude Code (`/test` gate, issue #17 design-parity pass) | 9/9 Pass |
| 2026-07-16 | Claude Code (`/test` gate, issue #17 MobileTabBar componentization + shared `TAB_TITLES`) | 9/9 Pass (UAT-3, -5 — the two scenarios that exercise the tab bar — re-walked live via playwright-cli against `parent1a`/`multirole` at 390px/768px, confirming the new `MobileTabBar` renders correctly and updates on role switch, see notes above; UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward from 2026-07-15) |
| 2026-07-17 | Claude Code (`/test` gate, issue #17 code-review follow-ups: `SessionProvider.tsx` native-only deep-link guard + ADR-0027 minors'-PII audit-exemption addendum) | 9/9 Pass. Full suite re-run: vitest 233/233, pgTAP 19 files/169 assertions (incl. `150_scope_label_resolution_rpc.sql`, unaffected by the comment-only migration changes). UAT-1 re-walked live (web sign-in via `parent1a` and `multirole`, 0 console errors — the exact regression the code-review comment flagged is confirmed absent) and UAT-5 re-walked live (multirole role switch at 1024px desktop, including live confirmation of the ADR-0027 scope — the switcher resolved `Parent · Student7_1, Student7_2` while Teacher was the active role). Design parity re-checked at 390/768/1024/1440 for `app/(tabs)/_layout.tsx`/`DesktopSidebar.tsx`/`MobileTabBar.tsx` (untouched by today's diff, confirmed no regression — screenshots at all four breakpoints match the 2026-07-15/-16 passes). UAT-2, -3, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. |
| 2026-07-21 | Claude Code (`/test` gate, issue #5 notifications infra: `PushPermissionCard`/`AddToHomeScreenHint` wired into the nav shell) | Full suite green: vitest 280/280, pgTAP 19 files/169 assertions (no new migrations in this diff — `push_subscriptions` RLS unchanged, `/rls-audit` not required). No UAT scenario regressed. Design parity checked at 360/768/1024/1440 for `PushPermissionCard`/`AddToHomeScreenHint` (new) and `app/(tabs)/_layout.tsx` (nav-shell wiring) — consistent theme-token usage, no horizontal scroll, ≥44px touch targets, no regressions. UAT-3 and UAT-5 (the two nav-flow scenarios this diff's `_layout.tsx` change touches) re-walked live: `parent1a` still sees exactly Feed/Attendance/Chat with the push card rendering above the tab bar; `multirole` role switch (Teacher → BV Coordinator) still updates the tab bar in place with 0 console errors, unaffected by the new components. UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. **Push-flow verification (playwright-cli, highest-risk item per §8.1):** iOS Safari UA (WebKit) confirms `AddToHomeScreenHint` shows and `PushPermissionCard` correctly defers to it pre-install, then swaps the instant `display-mode: standalone` is simulated (post-install) — matching the iOS 16.4+ precedence spec'd in `notifications-infra.md`. "Not now" dismisses and persists across reload. **Found + fixed a real bug in this pass:** the very first "Enable notifications" click on any fresh browser profile reliably failed silently (`AbortError: no active Service Worker` — `register()` resolves before the worker is active, and `subscribe()` doesn't wait) with no error shown to the user and no retry path, since the card dismisses unconditionally. Filed as issue #41, fixed in `lib/notifications/registerForPush.ts` (await `navigator.serviceWorker.ready` before subscribing), reverified end-to-end with a brand-new Chrome profile (0 prior SW registrations): first-ever click now succeeds, `POST push_subscriptions => 201 Created`, row confirmed via direct DB query, vitest re-run 280/280 green, issue closed. Also discovered and fixed a local-only setup gap: `.env`'s `EXPO_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` were blank (no generation step documented), which silently broke the subscribe flow with `InvalidAccessError` — populated with a freshly generated dev-only keypair for this workspace's local testing. |
| 2026-07-24 | Claude Code (`/test` gate, issue #21 class-update-and-home-feed — Teacher post + home feed + comments + push) | **NOT GREEN — merge blocked.** Non-UAT suite: vitest 398/398, tsc/lint clean, pgTAP 21 files/241 assertions (incl. new `160_class_updates_and_comments_rls.sql` 25/25 and adversarial `161_class_updates_and_comments_rls_adversarial.sql` 47/47 — zero cross-scope leaks found across teacher/student/parent/coordinator/admin × class_updates/comments/RPC, incl. after active-role switch). New scenarios UAT-10 through UAT-17 added above (this diff ships the Feed persona feature for real, per this doc's own note that Feed was previously out of scope as a placeholder); UAT-1 through UAT-9 unaffected — carried forward. UAT-11 through UAT-16 walked live and Pass. UAT-17 not walked — no seed fixture exists for a zero-enrollment class. **UAT-10 Fails on a real, confirmed bug, not a test artifact:** `push-send`'s service-role client has no `GRANT` on `class_updates`/`comments` (`supabase/migrations/20260724120426_class_updates_and_comments_rls.sql` only grants `authenticated`), so every class-update push silently no-ops (`200 {"status":"noop","recipients":0}`) even with real active enrollments — reproduced directly against PostgREST with the real service-role key, independent of browser automation. The same gap pre-exists for `messages`/`conversations`/`conversation_participants`/`push_subscriptions`, meaning the entire push-notification feature (chat included, not just this diff) currently no-ops on any freshly-migrated database. Filed as [issue #47](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/47); not fixed here per `/test` policy. **Design parity gate (playwright-cli, 360/768/1024/1440) also failed:** `FeedCard` and the comment-thread UI (`CommentThread`/`Comment`/`CommentComposer`, incl. the per-Parent stacked private-thread cards) match the Sankalp design system precisely at all four breakpoints, but `/class-update/new` and `/class-update/[id]` render with **zero app chrome** (no header, no back-nav, no desktop sidebar/width-cap) at every breakpoint, going full-bleed edge-to-edge at 1024/1440 specifically — both routes sit outside the `(tabs)` layout that provides `AppHeader`/`DesktopSidebar`/`MobileTabBar`. Separately, the Teacher's private-thread card is labeled with the enrolled student's own first name (via `resolve_parent_family_label()`'s `string_agg(students.first_name, ...)`), not a family/parent label — the `/design` spec's own UI section explicitly says "not the Student's name — data minimization," so this is a real conflict with §12.1 non-negotiable #6, flagged for human re-confirmation rather than filed/fixed unilaterally. Also noted, not blocking: `supabase/seed/seed.sql` seeds zero `student`-role `user_roles` rows, so Student-role QA required a manual local DB patch to exercise at all — a pre-existing seed gap, not introduced by this diff. **Verdict: three items need resolution before promotion** — the service-role grants (issue #47), the missing route chrome on Compose/Detail, and a human decision on the private-thread label. No gate markers recorded. |
| 2026-07-24 (fix pass) | Claude Code (`/test` gate, issue #21 — fixes for all three blockers above, human-approved: keep `families.label`, not the Parent's own name) | **GREEN — gate markers recorded.** All three fixes applied and re-verified: (1) `resolve_parent_family_label()` (`supabase/migrations/20260724120526_class_update_comment_recipient_label_rpc.sql`, uncommitted — edited in place rather than layered) now selects `families.label` instead of `string_agg(students.first_name, ...)`, confirmed live via `pg_get_functiondef`; `160`/`161`'s two positive-case assertions updated to expect the family label (`'Family A1'`/`'Adv Family A'`) instead of the student's first name. (2) New migration `20260724130000_push_send_service_role_grants.sql` grants `service_role` `select` on `class_updates`/`messages`/`conversations`/`conversation_participants` and `select, delete` on `push_subscriptions` — narrowest-scope only, `comments` deliberately excluded since push-send never queries it (confirmed by reading `push-send.ts` and its `lib/` helpers end to end). Re-verified directly against Postgres as `service_role`: the exact `dispatchClassUpdate` read chain (`class_updates` → `enrollments` → `students` → `family_members`) that previously threw `42501 permission denied` now resolves real recipients (1 student + 1 parent against seeded enrollment data) with zero errors — issue #47 closed. (3) `app/class-update/_layout.tsx` (new) wraps both routes in a `Stack` with `headerShown: true` and a plain-object `contentStyle` width cap (`theme.chrome.deskw`, matching `(tabs)/_layout.tsx`'s same StyleSheet.create-vs-plain-object caution) — re-verified live via playwright-cli: direct nav to `/class-update/new` at 1440px shows the "Post class update" header with content correctly capped and centered (no more full-bleed); in-app nav from `/feed` as `teacher1` at 1024px shows the same header **plus** a back arrow (confirmed via screenshot) — resolves both the missing-chrome and missing-back-nav findings. Full non-UAT suite re-run clean: vitest 398/398, tsc/lint clean, `npx supabase db reset` applies all migrations incl. the two new/edited ones with zero errors, pgTAP 21 files/241 assertions (`160`/`161` re-passing with the updated label assertions). RLS-audit not re-run as a full adversarial pass — none of the three fixes touch RLS policy logic (grants and a `SECURITY DEFINER` function's `WHERE`-clause-unchanged `SELECT` target are not new access-control surface), so the existing `161` adversarial suite (unaffected authorization-path assertions, only the two positive-value assertions changed) is treated as sufficient coverage; flagged here rather than silently assumed. Design parity was re-verified narrowly (the specific chrome defect, via direct screenshots) rather than via a full fresh 4-breakpoint × 2-screen agent pass — worth a full playwright-cli design-parity re-run before `/deploy-staging` if a stricter gate is wanted. Gate markers recorded: `.claude/.rls-tests-passed`, `.claude/.tests-passed`. |
| 2026-07-25 | Claude Code (`/test` gate, issue #21 / PR #48 — code review follow-ups: `COMMENTABLE_ROLES` oversight-composer gate, `fetchClassUpdateById`, `CommentComposer` async error handling) | **GREEN — gate markers recorded.** **Pre-flight:** the shared local Supabase Docker stack (per `shared-supabase-worktree-collision` — one Postgres container across all worktrees on this machine) had been reset by a different worktree since this branch's last run — `class_updates`/`comments` were entirely missing, DB instead had an unrelated `session_weekly_schedule_fields` migration applied. Confirmed with the user before re-running `npm run db:reset` in this worktree (restores this branch's migrations + seed); also had to `npm run env:init` + populate `.env` from `npx supabase status` (no `.env` existed in this worktree) and generate a fresh dev-only VAPID keypair, matching the 2026-07-21 pass's approach. Full suite re-run clean: vitest 398/398, tsc/lint clean, pgTAP 21 files/**241/241 assertions** (identical count to the 2026-07-24 fix-pass baseline — confirms the shared-DB reset didn't silently change RLS behavior). **RLS-audit not re-run as a full adversarial pass:** this diff adds no migration/policy changes — `COMMENTABLE_ROLES` is a client-side gate mirroring an already-enforced boundary, and `161`'s existing Attack 2d (`throws_ok` `42501`, "Coordinator cannot insert a comment, oversight is read-only") already adversarially proves that exact boundary; treated as sufficient coverage rather than re-run. **Live verification (playwright-cli, teacher1/coordinator1/parent12a against a real posted class update):** (1) oversight-role fix — signed in as `coordinator1` (same F3 session as `teacher1`'s class): sees the full teacher-shaped public thread read-only, **zero** `CommentComposer` instances present (`getByPlaceholder('Add a comment…')` count 0) at both 360px and 1024px, 0 console errors — replaces the prior broken silently-failing composer for oversight roles. (2) `fetchClassUpdateById` — direct nav to a real id loads correctly via the new single-row query; direct nav to a nonexistent id (`00000000-...-0000`) renders "This update couldn't be found." (the `maybeSingle()` null path), not a crash, 0 console errors. (3) `CommentComposer` async error handling — intercepted the `comments` POST to force a network failure: composer shows "Couldn't send. Try again." in `theme.colors.status.absent`, the typed text is preserved (not cleared), send re-enables for retry — verified at both 1024px and 360px, matching the DoD (theme tokens, no hex). (4) Regression check — `teacher1` posted a class update + public comment, and `parent12a` (enrolled in the same class) posted a public comment back; both rendered live for each other with the `Public`/`Private` toggle intact for Parent, 0 console errors — confirms the `onSend?: (...) => void \| Promise<void>` signature widening didn't break the existing synchronous-shaped call sites (UAT-12 re-walked, effectively). Design parity checked at 360/768/1024/1440 for `ClassUpdateDetailScreen`/`CommentComposer` — width-cap/chrome from the 2026-07-24 fix pass confirmed intact (direct-nav header has no back arrow by design, in-app nav does), no regressions, no horizontal scroll. UAT-1 through UAT-9, UAT-14, UAT-15, UAT-16, UAT-17 unaffected by this diff — carried forward; UAT-13 (private-thread cross-family isolation) not independently re-walked live this pass since the diff touches neither the private-thread grouping logic nor the RLS policies it depends on — `161`'s adversarial assertions for that boundary are unchanged and still 47/47 green. Gate markers recorded: `.claude/.rls-tests-passed`, `.claude/.tests-passed`. |

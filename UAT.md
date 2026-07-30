# UAT — User Acceptance Testing (POC pilot)

Manual, click-through test scenarios for a **non-technical business user** to verify the app behaves correctly. This covers only what's actually reachable through the app UI today — persona screens (Feed, Classes, Attendance, Chat) are still placeholders and are not in scope here; those get their own UAT scenarios once each persona feature ships. The Coordinator's Dashboard tab shipped as of UAT-10 below.

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

**Fetching a magic link locally:** local dev doesn't send real email — Supabase's bundled test inbox catches it instead. Open **`http://127.0.0.1:54324`** in a browser, search for the recipient address (e.g. `multirole@bv-seed.test.local`), open the newest "Your sign-in link" message, and click the sign-in link inside it. *(Corrected 2026-07-29: the current Supabase CLI ships **Mailpit** here, not Inbucket — there is no per-name mailbox URL to navigate to, and the API path is `/api/v1/messages`. The old instruction sent testers to a mailbox route that 404s.)*

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

- [x] Pass  - [ ] Fail (notes: verified via playwright-cli 2026-07-15; loading state also confirmed by code read of app/(auth)/sign-in.tsx. Re-walked live via playwright-cli 2026-07-17 against the `SessionProvider.tsx` native-only deep-link guard (code review finding: web's `detectSessionInUrl: true` and the `Linking`-based `handleDeepLink` could both try to exchange the same one-time-use PKCE `?code=`) — signed in as `parent1a` on web at 390px: followed the emailed magic link, landed on `/feed` with 0 console errors/warnings and the correct scope label (`Parent · Student1_1, Student1_2`). Repeated as `multirole`: 0 console errors, landed on `/feed` with the Teacher tab set. **Re-walked live 2026-07-24** after a report that magic sign-in "seems broken": first pass with a freshly-generated `teacher1` link (both `page.goto` on the extracted href and an actual click on the emailed `target="_blank"` link, matching real user behavior) landed cleanly on `/feed` with 0 console errors — did not reproduce with a valid link. Root cause of the *initial* symptom was this workspace's `.env` being blank for `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` after a `git pull` + rebuild (fixed earlier in the same session, unrelated to the flow itself). **Second pass, given the user's own (now-expired/reused) link**: reproduced a real bug — `app/auth/callback.tsx` ignored the `error`/`error_code`/`error_description` query params Supabase attaches when a link is rejected, and unconditionally redirected to `/`, silently dumping the user back on a blank sign-in form with zero explanation (network trace showed `otp_expired`). Filed as issue #44, fixed test-first (`lib/auth/authCallbackError.ts` + 5 new vitest cases) by having the callback parse the error and hand a friendly message to `/sign-in?authError=...`, rendered via the screen's existing error-state styling (reused as-is, DoD-checked at 360/768/1024/1440 — no new styles). Reverified live: expired link now shows "This sign-in link has expired or was already used. Request a new one below."; a fresh link (clicked, not just `goto`) still lands cleanly on `/feed`, 0 console errors — no regression to the happy path. vitest 384/384, pgTAP 19/169, issue closed.)

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

### UAT-10: Coordinator compliance dashboard
**Account:** `coordinator1@bv-seed.test.local`

**Steps:**
1. Sign in as `coordinator1@bv-seed.test.local`.
2. Open the Dashboard tab.

**Expected result:**
- A roll-up row shows Fully compliant / At-risk / Non-compliant class counts for the coordinator's own session.
- Below it, one card per class shows two bars — "Attendance submission" and "Class updates posted" — as a percentage with a date-range note.
- A class with no data yet for a metric shows an honest "—" (not a false 0%).
- No permission-denied screen, no crash, no blank screen.

- [x] Pass  - [ ] Fail (notes: verified live via playwright at 360/768/1024/1440, 2026-07-24. Signed in as `coordinator1`, landed on Feed, opened Dashboard — saw "Fully compliant/At-risk/Non-compliant" = 0/0/0, then 12 class cards (Gr1–Gr12 + Shishu Vihaar), each with "Attendance submission —" and "Class updates posted 0%" (red), date range "Apr 28 – May 19". Not broken/crashy — the "—" reads as honest no-data rather than a false failing grade. Root cause of all-placeholder attendance + 0/0/0 roll-up: a seed-data timing artifact, not a UI defect — `enrollments.enrolled_at` is stamped at seed-insert time (2026-07-24), which is after every `class_meetings.meeting_date` in the seeded session (ended 2026-05-24), so the RPC's `enrolled_at <= meeting_date` filter yields zero expected students for every windowed date. Classes with a null metric are correctly excluded from all three roll-up buckets (spec'd `classify` behavior), which is why the roll-up reads 0/0/0 despite 12 visible classes. Non-blocking product note: a non-technical coordinator may find "0/0/0 compliant" next to a wall of red 0% bars confusing at a glance — worth a "no data yet" sub-label if this pattern shows up with real usage; flagging for future refinement, not blocking this pass. Whoever next re-seeds should backdate `enrolled_at` within session windows so attendance-rate's non-placeholder (colored bar) content state is exercisable in QA/demo — it was not observable live this pass, only verified by code read.)

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

- [x] Pass  - [ ] Fail (**resolved by the 2026-07-24 fix pass — issue #47 closed; re-verified live then.** Original failure notes retained below for the record. notes: posts themselves succeed — `POST .../rest/v1/class_updates` returns `201` both times, and the new rows render correctly in Student/Parent feeds (see UAT-11). The `push-send` call does fire with the correct `class_update_id` each time, but the function itself is broken: it returns `200 {"status":"noop","recipients":0,"sent":0,"cleaned_up":0}` on every call — its service-role Supabase client gets a Postgres `permission denied for table class_updates` (confirmed directly against PostgREST with the real service-role key) because `supabase/migrations/20260724120426_class_updates_and_comments_rls.sql` never granted `service_role` any privileges on `class_updates`/`comments` (only `authenticated` was granted). Traced further: the exact same `permission denied` reproduces for `messages`, `conversations`, `conversation_participants`, and `push_subscriptions` too — none of those tables have ever had a `service_role` grant either, so `push-send`'s original chat-message branch is equally broken end-to-end on a fresh database, not just this feature's new branch. Filed as **[issue #47](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/47)**; not fixed here per `/test` policy.)

---

### UAT-11: Home feed read surface — Student and Parent (incl. multi-child, multi-class merge)
**Accounts:** `student8_1@bv-seed.test.local` (Student, Gr9 Class), `parent7a@bv-seed.test.local` (Parent, children in Gr8 Class **and** Gr9 Class)

**Steps:**
1. Sign in as the Student, open `/feed`.
2. Sign in as the Parent (separate browser session), open `/feed`.

**Expected result:**
- Both see the new class-update cards (no title, homework line shown only on the post that has homework), newest-first.
- The Parent's feed merges updates from *both* of their children's classes into one newest-first list, not one feed per child.

- [x] Pass  - [ ] Fail (notes: verified live via playwright-cli. Student's feed showed both new posts, no title, homework line present only on the body+homework card, newest-first (body+homework card appeared above the body-only card in DOM order). Parent A (`parent7a`, children in Gr8 Class and Gr9 Class) saw the Gr9 Class update in the same merged feed — 0 console errors either side.) **CORRECTION (2026-07-29 re-walk, issue #61):** the Student leg of this scenario is **not reproducible** — `supabase/seed/seed.sql` creates the Gr9–12 student *logins* but never a `user_roles` row with `role='student'` (0 student-role rows in a fresh DB), so `student8_1` signs in and lands on `/no-role`. `git log -S` confirms no seed revision ever granted it. The Parent leg was re-verified green this pass (merged newest-first feed, homework line only on the homework post, 0 console errors). Student-side RLS remains covered adversarially by pgTAP `170`/`171`, which fabricates JWT claims and so does not need seed roles.

---

### UAT-12: Public comments — Student posts, Teacher and Parent both see it
**Accounts:** `student8_1@bv-seed.test.local`, `teacher10@bv-seed.test.local`, `parent7a@bv-seed.test.local`

**Steps:**
1. Student opens a class update and posts a public comment.
2. Teacher and Parent (separately) open the same class update.

**Expected result:**
- The comment appears for the Student (their own), the Teacher, and the Parent — public comments are visible to everyone with class scope on that update.

- [x] Pass  - [ ] Fail (notes: verified live — Student's own comment rendered immediately after send; Teacher and Parent A both saw it after navigating to the same class-update URL. 0 console errors.) **CORRECTION (2026-07-29 re-walk, issue #61):** the Student-authored-comment leg is **not reproducible** for the same reason as UAT-11 — no student-role rows exist in seed, so no Student can reach the app. Re-verified green this pass with a **Parent** author instead: Parent A's public comment rendered immediately, and both the Teacher and Parent B saw it on the same class update. 0 console errors.

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

- [x] Pass  - [ ] Fail (notes: **FAILED on the 2026-07-29 re-walk, then fixed — issue #60.** As `multirole`, switching Teacher (Shishu Vihaar Class, 0 posts) -> Coordinator (F3 session, 2 posts) re-scoped the tab bar (Dashboard/Approvals in, Attendance out) and the scope chip, but the **feed kept showing "No updates yet"** over its own session's updates; a manual reload with the same active role immediately showed both. Not RLS — with coordinator claims set directly the DB returns `class_updates: 2 / comments: 2`, and the JWT is genuinely refreshed (`SessionProvider.tsx:122`). Root cause: `HomeFeedScreen`'s `load` was `useCallback(..., [])` and a role switch neither remounts nor unfocuses the screen, so `useFocusEffect` never re-fired — the `useFocusEffect` fix for review Important #2 covered navigate-back, not identity-change. Fixed by keying `load` on `[activeRole, scopeId]` (same fix applied to `ClassUpdateDetailScreen`, which had the identical mount-only shape). **Re-verified live both directions with no reload:** Coordinator->Teacher empties the feed, Teacher->Coordinator repopulates both updates, 0 console errors.)

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

| 2026-07-30 (ADR-0036 reconciliation) | Claude Code (`/architect` — PR #50 rebase onto #48) | **GREEN on the merged tree.** Applied ADR-0036 §1–4, which were blocked until issue #21 merged. **§1** this branch's duplicate `class_updates` definition removed from `20260729090000` — issue #21's `20260724120400` is canonical. Both used `create table if not exists`, so leaving them would not have failed loudly: the earlier timestamp wins, the later is a silent no-op, `db-and-rls` stays green, and the plpgsql RPC raises `column cu.meeting_date does not exist` only at runtime when a Coordinator opens the dashboard. **§2** new `20260729091000_class_updates_meeting_date.sql` adds `meeting_date` (add→backfill→not-null, ADR-0031's shape); deliberately no unique `(class_id, meeting_date)` — the canonical table permits several updates per meeting and the RPC only asks `exists`. **§3** composer meeting-date picker wired (Option C, human-confirmed): `fetchRecentClassMeetings` offers the class's last 4 scheduled meetings on/before today via `class_meetings_teacher_select`, defaulting to the most recent, with an honest empty state when a class has no past meeting. `buildClassUpdatePayload` now requires an ISO meeting date (TDD red→green, 3 new cases + 8 existing updated); new pure `meetingDateLabel` (3 cases) formats by string-split rather than `new Date(iso)`, which would render the previous day for any viewer west of Greenwich. **§4** `180_` reworked — the old fixture omitted the now-NOT NULL `body` and asserted zero read policies, both false against the canonical table; replaced with has_column/col_not_null/org-read/outsider-denied coverage, `plan(11)`→`plan(14)`. **Two integration breaks found only by running the merged tree:** (a) `meeting_date NOT NULL` broke 15 pre-existing `class_updates` inserts in issue #21's `170`/`171` fixtures and 4 in `181` (missing `body`) — all updated, the same ripple ADR-0031's `day_of_week` caused across 6 files; (b) `170`'s test 21 asserted an **absolute** org-wide `count(*) from class_updates = 2`, written when nothing seeded that table — this branch's seed now creates 36 rows, so it read 38. Rescoped to the file's own two fixture classes, preserving the cross-class claim while making it independent of seed volume. Seed's `class_updates` insert also gained `body` and swapped `on conflict (class_id, meeting_date)` — a constraint that no longer exists — for an explicit `NOT EXISTS`, since dropping it outright would have inserted one duplicate row per student inside the per-student loop. Full suite: pgTAP **25 files/314 PASS**, vitest **75 files/495**, tsc clean, expo lint clean, unistyles clean, secret-checks clean. **Not done:** live browser walk of the new picker still owed before `/deploy-staging`. |
## 3. Sign-off

| Date | Tester | Result |
|---|---|---|
| 2026-07-15 | Claude Code (`/test` gate, issue #17 design-parity pass) | 9/9 Pass |
| 2026-07-16 | Claude Code (`/test` gate, issue #17 MobileTabBar componentization + shared `TAB_TITLES`) | 9/9 Pass (UAT-3, -5 — the two scenarios that exercise the tab bar — re-walked live via playwright-cli against `parent1a`/`multirole` at 390px/768px, confirming the new `MobileTabBar` renders correctly and updates on role switch, see notes above; UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward from 2026-07-15) |
| 2026-07-17 | Claude Code (`/test` gate, issue #17 code-review follow-ups: `SessionProvider.tsx` native-only deep-link guard + ADR-0027 minors'-PII audit-exemption addendum) | 9/9 Pass. Full suite re-run: vitest 233/233, pgTAP 19 files/169 assertions (incl. `150_scope_label_resolution_rpc.sql`, unaffected by the comment-only migration changes). UAT-1 re-walked live (web sign-in via `parent1a` and `multirole`, 0 console errors — the exact regression the code-review comment flagged is confirmed absent) and UAT-5 re-walked live (multirole role switch at 1024px desktop, including live confirmation of the ADR-0027 scope — the switcher resolved `Parent · Student7_1, Student7_2` while Teacher was the active role). Design parity re-checked at 390/768/1024/1440 for `app/(tabs)/_layout.tsx`/`DesktopSidebar.tsx`/`MobileTabBar.tsx` (untouched by today's diff, confirmed no regression — screenshots at all four breakpoints match the 2026-07-15/-16 passes). UAT-2, -3, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. |
| 2026-07-21 | Claude Code (`/test` gate, issue #5 notifications infra: `PushPermissionCard`/`AddToHomeScreenHint` wired into the nav shell) | Full suite green: vitest 280/280, pgTAP 19 files/169 assertions (no new migrations in this diff — `push_subscriptions` RLS unchanged, `/rls-audit` not required). No UAT scenario regressed. Design parity checked at 360/768/1024/1440 for `PushPermissionCard`/`AddToHomeScreenHint` (new) and `app/(tabs)/_layout.tsx` (nav-shell wiring) — consistent theme-token usage, no horizontal scroll, ≥44px touch targets, no regressions. UAT-3 and UAT-5 (the two nav-flow scenarios this diff's `_layout.tsx` change touches) re-walked live: `parent1a` still sees exactly Feed/Attendance/Chat with the push card rendering above the tab bar; `multirole` role switch (Teacher → BV Coordinator) still updates the tab bar in place with 0 console errors, unaffected by the new components. UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. **Push-flow verification (playwright-cli, highest-risk item per §8.1):** iOS Safari UA (WebKit) confirms `AddToHomeScreenHint` shows and `PushPermissionCard` correctly defers to it pre-install, then swaps the instant `display-mode: standalone` is simulated (post-install) — matching the iOS 16.4+ precedence spec'd in `notifications-infra.md`. "Not now" dismisses and persists across reload. **Found + fixed a real bug in this pass:** the very first "Enable notifications" click on any fresh browser profile reliably failed silently (`AbortError: no active Service Worker` — `register()` resolves before the worker is active, and `subscribe()` doesn't wait) with no error shown to the user and no retry path, since the card dismisses unconditionally. Filed as issue #41, fixed in `lib/notifications/registerForPush.ts` (await `navigator.serviceWorker.ready` before subscribing), reverified end-to-end with a brand-new Chrome profile (0 prior SW registrations): first-ever click now succeeds, `POST push_subscriptions => 201 Created`, row confirmed via direct DB query, vitest re-run 280/280 green, issue closed. Also discovered and fixed a local-only setup gap: `.env`'s `EXPO_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` were blank (no generation step documented), which silently broke the subscribe flow with `InvalidAccessError` — populated with a freshly generated dev-only keypair for this workspace's local testing. |
| 2026-07-24 | Claude Code + human (`/test` gate, issue #20 teacher attendance UI: `app/(tabs)/attendance.tsx` + `lib/attendance/**` + ADR-0031 `sessions.day_of_week/start_time/end_time` migration) | Full suite green: vitest 413/413, pgTAP 21 files/193 assertions (new `160_session_weekly_schedule.sql` + `165_session_weekly_schedule_and_attendance_adversarial.sql`, the latter added by this pass's `/rls-audit` — role×scope adversarial coverage for the new `sessions` columns and the teacher attendance read/write RPC path, no cross-scope leakage found). **No UAT scenario applies directly** — this diff touches no auth/session/nav code (`_layout.tsx`, `SessionProvider.tsx`, `RoleSwitcher.tsx`, `DesktopSidebar.tsx` all untouched); skipping UAT-1 through UAT-9 as genuinely out of this diff's blast radius, per the walk-or-skip-with-reason rule. Incidentally reconfirmed in passing during today's manual attendance walkthrough: `teacher1@bv-seed.test.local` signs in and lands on the correct Teacher tab set including a functional Attendance tab (the UAT-1/UAT-3 substance), not a dedicated re-walk. Design parity checked at 360/768/1024/1440 (manual, human-in-the-loop — no `playwright-cli`/`chromium-cli`/browser-MCP tool available this session): header (RoleBadge + schedule line), date-nav (tabular date, ±7-day step per ADR-0031, correctly clamped to session end), roster row (Card + SegmentedTabs → StatusChip on save), one full-width primary Submit button, no horizontal scroll, ≥44px targets — all confirmed pass at every breakpoint. **Found + fixed a real environment issue, not an app bug:** local Supabase Docker stack is shared across concurrent git worktrees on this machine; another worktree's `supabase db reset` clobbered this worktree's schema mid-session (dropped the new `sessions` columns), surfacing as the attendance screen's error-preserving state ("Couldn't load your roster"). Root-caused via `supabase migration list --local` showing migration timestamps absent from this worktree's `supabase/migrations/`, fixed by re-running `supabase db reset` in this worktree; recorded to persistent memory as a recurring hazard for future sessions. **Advisory finding (not a leak, not blocking):** `mark_attendance_for_staff` performs no server-side date-bound/day-of-week validation — a teacher can submit attendance for a date far outside the session's calendar (still gated to their own class, just not calendar-validated); flagged for a follow-up ticket, not required for this promotion. |
| 2026-07-24 | Claude Code (`/test` gate, ad-hoc report: "magic sign-in flow seems to be broken") | **Found and fixed a real bug.** Initial pass: this workspace was freshly `git pull`ed to `origin/main` (2b4524c) and rebuilt; a blank `.env` (`EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY`) was crashing every route render — fixed, unrelated to app code. A fresh magic link then signed in cleanly, so the flow didn't reproduce as broken — until the user supplied their own (expired/reused) link. Following it exposed `app/auth/callback.tsx` silently swallowing Supabase's `error`/`error_code`/`error_description` redirect params and dumping the user back on a blank sign-in form with no explanation. Filed as issue #44, fixed test-first (new `lib/auth/authCallbackError.ts`, 5 vitest cases, TDD red→green) so the callback now forwards a friendly message to the sign-in screen's existing error state — reused as-is, no new styling, DoD-checked live at 360/768/1024/1440 (screenshots, no regressions). Reverified end-to-end: expired link now shows a clear error; a freshly-clicked valid link still signs in cleanly (0 console errors) — no regression to the happy path. Issue closed. Full suite green: vitest 384/384 (5 new), pgTAP 19 files/169 assertions (unaffected — no schema/RLS touched, `/rls-audit` not required). UAT-2 through -9 not re-walked (unaffected — no nav/role-switch/session code touched), carried forward from 2026-07-21. |
| 2026-07-24 | Claude Code (`/test` gate, issue #23 coordinator compliance dashboard) | **⚠️ Counts below are pre-merge and superseded — re-run required at `/test` after the ADR-0036 reconciliation completes** (test files renumbered `160`/`165` → `180`/`181` to clear a collision with `main`'s ADR-0031 files; one redundant session-weekday NOT NULL assertion removed; `class_updates` shape still to be reconciled against issue #21). Original pass: full suite green: vitest 398/398, pgTAP 21 files/193 assertions (incl. new `180_class_meetings_schema.sql`, `181_session_compliance_rpc.sql`, and one new assertion added this pass for `audit_log_coordinator_read` branch-(c) cross-coordinator isolation — see RLS audit below). **RLS adversarial audit** (`rls-adversarial-tester` subagent) on the two new migrations (`class_meetings`/`class_updates` schema + RLS, `get_session_compliance_for_staff` RPC, rewritten `audit_log_coordinator_read` policy): all cross-scope/cross-role/anon/post-role-switch attacks denied correctly, 0 FAILs; one non-blocking observation (any authenticated user can cause a `denied` audit_log row against an arbitrary session id — audit-log noise potential, not a scope/PII leak) — not blocking. Design parity checked live via playwright at 360/768/1024/1440 for `ComplianceBar.tsx` (new `placeholder` prop) and the new `ComplianceDashboardScreen.tsx` — token-driven colors, tabular-nums figures, no horizontal scroll, ≥44px touch targets, full mobile/desktop parity, 0 console errors. New **UAT-10** scenario added and walked live (see above) — Pass, with a non-blocking seed-data note (`enrolled_at` timing means only the update-rate metric shows live colored-bar content this pass; attendance-rate's non-placeholder state was verified by code read only). UAT-1 through -9 unaffected by this diff — carried forward. |
| 2026-07-25 | Claude Code (`/test` gate, PR #49 code-review follow-up: `AttendanceRosterRow.tsx` correction-flow fix (decision #6) + `useAttendanceRoster.ts` double-submit guard/`isSubmitting` + transient-`classId` guard + `scripts/_secret-checks.js` roster/enrollment path false-positive fix) | Full suite green: vitest 414/414, pgTAP 21 files/193 assertions. No migration/RLS changes in this diff — `/rls-audit` not required. **No UAT scenario applies directly** — this diff touches no auth/session/nav code; skipping UAT-1 through UAT-9 as out of this diff's blast radius, per the walk-or-skip-with-reason rule. Design parity checked live via playwright-cli (Chromium, signed in as `teacher1@bv-seed.test.local` via Mailpit magic link) at 360/768/1024/1440 for the unsaved state, the post-submit saved state (the PR's core fix — `SegmentedTabs` + `StatusChip` together), the correction tap (confirmed the chip disappears immediately and the row stays editable, per decision #6), and the empty state (temporarily zeroed `teacher2`'s one enrollment, reverted after). 0 console errors throughout. **Found + fixed a real bug in this pass:** at exactly the 360px breakpoint, the saved-row layout (`SegmentedTabs` + `StatusChip` rendered together, per this PR's fix) squeezed the name column to near-zero width, causing the student's name to wrap one character per line and the row to overlap the Submit button. Filed as issue #55, root-caused (via `superpowers:systematic-debugging`) to `info` lacking a `minWidth` floor against a newly-widened `control` slot — same bug class already documented and fixed once before in `components/core/ListRow.tsx`; applied the identical established pattern (`flex:1 + minWidth` floor on the text column, `flexShrink:1 + minWidth:0` + `flexWrap` on the control column). Reverified clean at all four breakpoints, vitest re-run 414/414, issue closed. Local DB hygiene: this pass's own live E2E testing (real RPC calls) left stray `attendance`/`audit_log` rows in the shared local Supabase instance — deleted after each run; also found and removed 6 *pre-existing* stray `audit_log` rows (from an earlier session's manual E2E pass) that were inflating a pgTAP `audit_log_org_read` assertion 12 vs. the expected 6 — confirmed via row-ID mismatch against the test's own fixture UUIDs before deleting, user-confirmed first. |
| 2026-07-24 | Claude Code (`/test` gate, issue #21 class-update-and-home-feed — Teacher post + home feed + comments + push) | **NOT GREEN — merge blocked.** Non-UAT suite: vitest 398/398, tsc/lint clean, pgTAP 21 files/241 assertions (incl. new `160_class_updates_and_comments_rls.sql` 25/25 and adversarial `161_class_updates_and_comments_rls_adversarial.sql` 47/47 — zero cross-scope leaks found across teacher/student/parent/coordinator/admin × class_updates/comments/RPC, incl. after active-role switch). New scenarios UAT-10 through UAT-17 added above (this diff ships the Feed persona feature for real, per this doc's own note that Feed was previously out of scope as a placeholder); UAT-1 through UAT-9 unaffected — carried forward. UAT-11 through UAT-16 walked live and Pass. UAT-17 not walked — no seed fixture exists for a zero-enrollment class. **UAT-10 Fails on a real, confirmed bug, not a test artifact:** `push-send`'s service-role client has no `GRANT` on `class_updates`/`comments` (`supabase/migrations/20260724120426_class_updates_and_comments_rls.sql` only grants `authenticated`), so every class-update push silently no-ops (`200 {"status":"noop","recipients":0}`) even with real active enrollments — reproduced directly against PostgREST with the real service-role key, independent of browser automation. The same gap pre-exists for `messages`/`conversations`/`conversation_participants`/`push_subscriptions`, meaning the entire push-notification feature (chat included, not just this diff) currently no-ops on any freshly-migrated database. Filed as [issue #47](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/47); not fixed here per `/test` policy. **Design parity gate (playwright-cli, 360/768/1024/1440) also failed:** `FeedCard` and the comment-thread UI (`CommentThread`/`Comment`/`CommentComposer`, incl. the per-Parent stacked private-thread cards) match the Sankalp design system precisely at all four breakpoints, but `/class-update/new` and `/class-update/[id]` render with **zero app chrome** (no header, no back-nav, no desktop sidebar/width-cap) at every breakpoint, going full-bleed edge-to-edge at 1024/1440 specifically — both routes sit outside the `(tabs)` layout that provides `AppHeader`/`DesktopSidebar`/`MobileTabBar`. Separately, the Teacher's private-thread card is labeled with the enrolled student's own first name (via `resolve_parent_family_label()`'s `string_agg(students.first_name, ...)`), not a family/parent label — the `/design` spec's own UI section explicitly says "not the Student's name — data minimization," so this is a real conflict with §12.1 non-negotiable #6, flagged for human re-confirmation rather than filed/fixed unilaterally. Also noted, not blocking: `supabase/seed/seed.sql` seeds zero `student`-role `user_roles` rows, so Student-role QA required a manual local DB patch to exercise at all — a pre-existing seed gap, not introduced by this diff. **Verdict: three items need resolution before promotion** — the service-role grants (issue #47), the missing route chrome on Compose/Detail, and a human decision on the private-thread label. No gate markers recorded. |
| 2026-07-24 (fix pass) | Claude Code (`/test` gate, issue #21 — fixes for all three blockers above, human-approved: keep `families.label`, not the Parent's own name) | **GREEN — gate markers recorded.** All three fixes applied and re-verified: (1) `resolve_parent_family_label()` (`supabase/migrations/20260724120526_class_update_comment_recipient_label_rpc.sql`, uncommitted — edited in place rather than layered) now selects `families.label` instead of `string_agg(students.first_name, ...)`, confirmed live via `pg_get_functiondef`; `160`/`161`'s two positive-case assertions updated to expect the family label (`'Family A1'`/`'Adv Family A'`) instead of the student's first name. (2) New migration `20260724130000_push_send_service_role_grants.sql` grants `service_role` `select` on `class_updates`/`messages`/`conversations`/`conversation_participants` and `select, delete` on `push_subscriptions` — narrowest-scope only, `comments` deliberately excluded since push-send never queries it (confirmed by reading `push-send.ts` and its `lib/` helpers end to end). Re-verified directly against Postgres as `service_role`: the exact `dispatchClassUpdate` read chain (`class_updates` → `enrollments` → `students` → `family_members`) that previously threw `42501 permission denied` now resolves real recipients (1 student + 1 parent against seeded enrollment data) with zero errors — issue #47 closed. (3) `app/class-update/_layout.tsx` (new) wraps both routes in a `Stack` with `headerShown: true` and a plain-object `contentStyle` width cap (`theme.chrome.deskw`, matching `(tabs)/_layout.tsx`'s same StyleSheet.create-vs-plain-object caution) — re-verified live via playwright-cli: direct nav to `/class-update/new` at 1440px shows the "Post class update" header with content correctly capped and centered (no more full-bleed); in-app nav from `/feed` as `teacher1` at 1024px shows the same header **plus** a back arrow (confirmed via screenshot) — resolves both the missing-chrome and missing-back-nav findings. Full non-UAT suite re-run clean: vitest 398/398, tsc/lint clean, `npx supabase db reset` applies all migrations incl. the two new/edited ones with zero errors, pgTAP 21 files/241 assertions (`160`/`161` re-passing with the updated label assertions). RLS-audit not re-run as a full adversarial pass — none of the three fixes touch RLS policy logic (grants and a `SECURITY DEFINER` function's `WHERE`-clause-unchanged `SELECT` target are not new access-control surface), so the existing `161` adversarial suite (unaffected authorization-path assertions, only the two positive-value assertions changed) is treated as sufficient coverage; flagged here rather than silently assumed. Design parity was re-verified narrowly (the specific chrome defect, via direct screenshots) rather than via a full fresh 4-breakpoint × 2-screen agent pass — worth a full playwright-cli design-parity re-run before `/deploy-staging` if a stricter gate is wanted. Gate markers recorded: `.claude/.rls-tests-passed`, `.claude/.tests-passed`. |
| 2026-07-25 | Claude Code (`/test` gate, issue #21 / PR #48 — code review follow-ups: `COMMENTABLE_ROLES` oversight-composer gate, `fetchClassUpdateById`, `CommentComposer` async error handling) | **GREEN — gate markers recorded.** **Pre-flight:** the shared local Supabase Docker stack (per `shared-supabase-worktree-collision` — one Postgres container across all worktrees on this machine) had been reset by a different worktree since this branch's last run — `class_updates`/`comments` were entirely missing, DB instead had an unrelated `session_weekly_schedule_fields` migration applied. Confirmed with the user before re-running `npm run db:reset` in this worktree (restores this branch's migrations + seed); also had to `npm run env:init` + populate `.env` from `npx supabase status` (no `.env` existed in this worktree) and generate a fresh dev-only VAPID keypair, matching the 2026-07-21 pass's approach. Full suite re-run clean: vitest 398/398, tsc/lint clean, pgTAP 21 files/**241/241 assertions** (identical count to the 2026-07-24 fix-pass baseline — confirms the shared-DB reset didn't silently change RLS behavior). **RLS-audit not re-run as a full adversarial pass:** this diff adds no migration/policy changes — `COMMENTABLE_ROLES` is a client-side gate mirroring an already-enforced boundary, and `161`'s existing Attack 2d (`throws_ok` `42501`, "Coordinator cannot insert a comment, oversight is read-only") already adversarially proves that exact boundary; treated as sufficient coverage rather than re-run. **Live verification (playwright-cli, teacher1/coordinator1/parent12a against a real posted class update):** (1) oversight-role fix — signed in as `coordinator1` (same F3 session as `teacher1`'s class): sees the full teacher-shaped public thread read-only, **zero** `CommentComposer` instances present (`getByPlaceholder('Add a comment…')` count 0) at both 360px and 1024px, 0 console errors — replaces the prior broken silently-failing composer for oversight roles. (2) `fetchClassUpdateById` — direct nav to a real id loads correctly via the new single-row query; direct nav to a nonexistent id (`00000000-...-0000`) renders "This update couldn't be found." (the `maybeSingle()` null path), not a crash, 0 console errors. (3) `CommentComposer` async error handling — intercepted the `comments` POST to force a network failure: composer shows "Couldn't send. Try again." in `theme.colors.status.absent`, the typed text is preserved (not cleared), send re-enables for retry — verified at both 1024px and 360px, matching the DoD (theme tokens, no hex). (4) Regression check — `teacher1` posted a class update + public comment, and `parent12a` (enrolled in the same class) posted a public comment back; both rendered live for each other with the `Public`/`Private` toggle intact for Parent, 0 console errors — confirms the `onSend?: (...) => void \| Promise<void>` signature widening didn't break the existing synchronous-shaped call sites (UAT-12 re-walked, effectively). Design parity checked at 360/768/1024/1440 for `ClassUpdateDetailScreen`/`CommentComposer` — width-cap/chrome from the 2026-07-24 fix pass confirmed intact (direct-nav header has no back arrow by design, in-app nav does), no regressions, no horizontal scroll. UAT-1 through UAT-9, UAT-14, UAT-15, UAT-16, UAT-17 unaffected by this diff — carried forward; UAT-13 (private-thread cross-family isolation) not independently re-walked live this pass since the diff touches neither the private-thread grouping logic nor the RLS policies it depends on — `161`'s adversarial assertions for that boundary are unchanged and still 47/47 green. Gate markers recorded: `.claude/.rls-tests-passed`, `.claude/.tests-passed`. |
| 2026-07-25 (self-review fix) | Claude Code (`/test` gate, issue #21 / PR #48 — self-review finding: full-screen loading flash on comment send) | **GREEN — gate markers recorded.** A self-requested code review of the whole PR (not just the prior fix pass) found one real issue: `ClassUpdateDetailScreen.tsx`'s `send()` calls `await load()` after a successful insert, and `load()` unconditionally set `state("loading")` before its fetch — replacing the entire screen (class-update card + every thread) with a bare spinner on every comment send, inconsistent with `HomeFeedScreen.tsx`'s own `load()`, which already guards this exact case. Fixed with the same one-line guard: `setState((prev) => (prev === "content" ? prev : "loading"))`. **Pre-flight:** re-confirmed the shared local Supabase stack still held this branch's own migrations (no repeat of the prior collision). **Verified live (playwright-cli):** slowed the post-send `class_updates` GET to 1200ms via route interception and screenshotted mid-flight — the class-update card, existing thread, and composer all stayed rendered (no spinner swap) while the comment send was in flight; final state showed the new comment appended correctly, 0 console errors. **pgTAP regression note:** `160_class_updates_and_comments_rls.sql` failed on first re-run after this pass's live testing (`have: 3 want: 2` / `have: 5 want: 3` on the "Admin sees every X org-wide" assertions) — root cause was leftover committed rows from this session's own earlier manual Playwright testing (1 `class_updates` + 2 `comments` rows, all containing literal "/test" body text, timestamped from this session — the documented stray-row pattern for this repo, not a code regression). Confirmed with the user, deleted the exact 3 rows by primary key, re-ran clean: pgTAP 21 files/**241/241 assertions**. Full suite: vitest 398/398, tsc/lint clean. This session's own newly-created test rows (from the mid-flight verification above) were likewise deleted immediately after use to avoid leaving fresh stray data for the next run. Gate markers recorded: `.claude/.rls-tests-passed`, `.claude/.tests-passed`. |
| 2026-07-28 (code-review fixes) | Claude Code (issue #21 / PR #48 — external code review by ssrinivas90, 2026-07-29 at `635d76f`: 0 Critical, 8 Important) | **Suites green; live UAT re-walk still owed.** Review found no Critical issues — the RLS set, `is_parent_of_class`, and `resolve_parent_family_label`'s minors'-data posture all passed adversarial reading. Seven of eight Important items fixed here, all TDD (RED verified before each fix): **(1)** `push-send` discarded `error` on all seven service-role reads, so any failure returned `200 {"recipients":0}` — issue #47's *failure mode* survived its own fix. Added a shared `unwrap()` + `QueryError` so a missed check is now structurally hard, with a structured `push_dispatch_failed` log and a 500; 7 new tests, each confirmed failing (got 200, wanted 500) first. Client is fire-and-forget, so the 500 can't misreport a committed post as failed. **(2)** `HomeFeedScreen`'s mount-only `useEffect` meant a Teacher returning via `router.back()` never saw their own new post — now `useFocusEffect`. **(3)** `class-update` routes were the only top-level group missing from the root `Stack.Protected` guard; declared inside it. **(5)** New migration `20260728140000_class_update_comment_retention_fields.sql` adds inert `retention_eligible_at` to `class_updates`/`comments`, matching `20260709045311`'s pattern (§11 / supabase-sql rule) — `070_retention_columns.sql` extended, +2 assertions. **(6)** `_index.md` claimed "next `/plan`" while the spec and this log showed `/build`+`/test` done; both rows advanced (attendance-ui's row was stale the same way and was corrected too). **(7)** Unhandled rejection in the private-thread label lookup extracted to a testable `resolveLabelsForKeys` that degrades one failed lookup to the existing "Private thread" fallback; 5 new tests. **(8)** `push-send` test mock now records filter args and injects per-table errors, closing the untested `status='active'` filter, the no-login-student exclusion, and the missing `422`. **Item #4 (enrollment-`status` asymmetry) deliberately NOT fixed** — human decision 2026-07-28 to defer to `/architect` as an org-wide convention call, since the repo has two competing precedents (`classes_*_select` unfiltered vs. chat's ADR-0015 trigger revoking on withdrawal); filed as [issue #58](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/58) and documented in the spec's Review follow-ups. Full suite: vitest **453/453** (69 files, +15 this pass), pgTAP **23 files/267 assertions**, tsc/lint clean. **Pre-flight:** the shared local Supabase stack had again been reset by another worktree (`timingila`'s two migrations applied, this branch's five rolled off — the documented `shared-supabase-worktree-collision` hazard); user-confirmed before re-running `npm run db:reset`. **Not done this pass:** no live browser re-walk of UAT-10–17 (fixes #2/#3 are navigation/auth-shell behavior that only a real browser proves), and `/rls-audit` not re-run — the retention migration adds two inert nullable columns with no policy/grant change, and no other fix touches access control. Gate markers NOT recorded; a live pass is owed before `/deploy-staging`. |
| 2026-07-28 (security fix, cherry-pick) | Claude Code (issue #21 / PR #48 — reviewer Minor #2 / issue #52: `is_parent_of_class` cross-scope oracle) | **Suites green.** Cherry-picked `7712727` from the now-abandoned `integrate-four-issues-e2e` branch, where an independent RLS-adversarial audit had found the same hole the PR #48 reviewer flagged as Minor #2: `is_parent_of_class` is `SECURITY DEFINER` and granted to `authenticated`, so it is a directly-callable RPC, not merely an internal policy helper — and it had no `auth.jwt()` gate of its own. Any authenticated user of any role could probe arbitrary `(user_id, class_id)` pairs org-wide and learn family/enrollment relationships across class scope; it was only safe in practice because its one in-repo caller (`comments_teacher_insert`s `WITH CHECK`) always pre-scoped `p_class_id`. Two independent reviews finding it is why it was treated as more than Minor. The function now carries the same gate shape as `resolve_parent_family_label` (teacher own-class · coordinator own-session · bv_coordinator/admin org-wide). Applied by cherry-pick rather than re-derivation, and git followed the `161`→`171` rename cleanly; the migration was edited **in place** (`20260724120426`) rather than layered, consistent with this feature's own 2026-07-24 fix-pass precedent and safe because it is unmerged and CI rebuilds from scratch. **RED verified before accepting the fix** (the assertions arrived pre-written, so they were not trusted on a first green): the un-gated function definition was reinstalled directly into the local DB and `171` re-run — Attack 8a (Teacher A probing Class B), 8b (Coordinator of Session Two probing Session One's class) and 8c (Student gets `true`) all failed `have: true / want: false`, while both CONTROL assertions correctly still passed; the DB was then reset to restore the gate. Full suite: vitest **453/453**, pgTAP **23 files/272 assertions** (+5, Attack Group 8), tsc/lint clean. Live browser re-walk of UAT-10–17 still owed from the prior row — unchanged by this diff (no client code touched). Gate markers still NOT recorded. |
| 2026-07-28 (minor review items) | Claude Code (issue #21 / PR #48 — the review's 9 Minor items) | **Suites green.** Seven fixed, two dispositioned. **#3** `resolve_parent_family_label`'s revoke now reads `from public, anon`, matching its sibling. **#4** explicit `FEED_PAGE_LIMIT` (200) on the feed and `COMMENT_COUNT_SCAN_LIMIT` (5000) on the count query, so the truncation point is a named constant rather than whatever PostgREST's `db-max-rows` happens to be; the count path also warns when it hits the ceiling, since truncation there *undercounts* badges silently rather than erroring. **#5** timestamps were date-only, so every same-day item in an ordered list looked identically stamped — extracted `formatPostedAt` (date **and** time, empty string rather than "Invalid Date" on unparseable input), wired into all three call sites, 5 tests. **#6** UAT-10's checkbox flipped to Pass with a pointer to the 2026-07-24 fix pass that resolved it; the original failure notes are retained rather than overwritten. **#7** length caps, human-approved at 5000 body / 2000 homework / 2000 comment, enforced as DB check constraints (the real bound — a direct PostgREST call ignores a client cap) with `maxLength` mirrors on the composers so the user is stopped while typing instead of rejected after; `Field` gained a `maxLength` passthrough (behavioral only, no visual change). **#8** `send()`'s `if (!session) return` resolved the promise, so `CommentComposer` cleared the typed text as though the comment had posted — now throws into the composer's existing error path, preserving the text. **#1 partially deferred by design:** this feature's three FK columns corrected to `on delete restrict` (honest encoding — `not null` + `set null` already raised 23502, so functionally a no-op), but `messages.sender_user_id` carries the same bug and belongs to chat, so it was split out as **[issue #59](https://github.com/cmdfw-bv/CMDFW-BalaVihar-App/issues/59)** rather than fixed from an issue #21 PR. **#9 accepted, not fixed:** the 23503-vs-42501 existence oracle would need all comment inserts routed through a `SECURITY DEFINER` RPC purely to normalize an error code, moving the insert path off the plain-RLS posture ADR-0032 chose; it leaks only whether a random UUID exists, not content or scope, and v4 UUIDs aren't enumerable in practice — reasoning recorded in the spec rather than silently dropped. **RED verified before each fix:** the 6 new cap/format assertions failed first (missing module / missing constants), and the 5 new pgTAP assertions failed against the pre-migration schema with exactly the expected 23514-not-raised and `confdeltype` mismatches. Full suite: vitest **466/466** (70 files, +13), pgTAP **23 files/278 assertions** (+6), tsc/lint clean. Live browser re-walk of UAT-10–17 still owed; gate markers still NOT recorded.
| 2026-07-29 (live UAT re-walk) | Claude Code (`/architect` full review + test of PR #48 at `7751d61`) | **Suites GREEN; UAT re-walk found and fixed one real bug, and found two blocking data/doc gaps.** Ran from a clean DB (`supabase db reset`, all 8 worktrees confirmed clean first per `shared-supabase-worktree-collision`): pgTAP **23 files/278 assertions PASS**, vitest **70 files/466 PASS**, `tsc --noEmit` clean, `expo lint` clean, `_secret-checks` clean, unistyles scan clean. This closes the prior reviewer's `supabase test db` "unverified" gap. **Live walk (playwright-cli, real magic-link sign-ins):** **UAT-10 PASS** — both posts succeeded; body-only card correctly shows no Homework badge/line, body+homework shows both; newest-first; **`push-send` now returns `recipients: 4`** (issue #47's fix confirmed live — previously `0` with `permission denied`), `sent: 0` only because no push subscriptions exist. DB truth: 2 `class_updates`, 1 with homework, 2 dispatches. **UAT-14 PASS** — "No comments yet" + "0 comments" + composer. **UAT-13 PASS (highest-stakes)** — Parent A's private comment is invisible to Parent B (who has a child in the *same* class): B sees only "1 comment"; A's private body absent entirely. Teacher sees two separate threads, the private one labelled **"Seed Family 7"** — the *family label*, not a child's name, confirming the PII fix and `resolve_parent_family_label` resolving live (no "Private thread" fallback). **UAT-11/UAT-12 Parent+Teacher legs PASS; Student legs BLOCKED** — see issue #61 and the corrections on those rows. **UAT-15 FAILED, fixed, re-verified PASS** — see issue #60 and that row. **UAT-16** empty state PASS; the throttled-loading leg was **not** walked this pass. **UAT-17** still not walkable (no zero-enrollment class in seed). **Design parity** re-checked at 360/768/1024/1440 on both the feed and the detail screen — `scrollWidth - clientWidth = 0` at every breakpoint on both, content intact, 0 console errors throughout; 360px screenshot reviewed (private thread visually distinct via lavender + PRIVATE lock badge, homework block, date+time stamps). Also visually confirmed the oversight gate: as Coordinator, both threads render read-only with **zero** composers. **New Minor finding (not fixed, cosmetic):** every comment avatar renders a literal `"?"` — `Comment.tsx:37` falls back to `(author.name || "?")` and `ClassUpdateDetailScreen` passes only `{ role }`. Privacy-safe but unintentional; a role-derived initial (P/T/S) would leak nothing and read better. **Local DB hygiene:** this pass's own live testing left 2 `class_updates` + 2 `comments` committed rows, which inflated `170`'s two org-wide count assertions on the re-run (test 21 have 4/want 2, test 22 have 5/want 3) — the documented stray-row pattern for this repo, not a code regression. Confirmed all four rows were this session's (bodies contain "re-walk", timestamps 02:47-02:53Z) and that the tables are otherwise empty because the pgTAP fixtures roll back, then deleted them by primary key (comments cascaded); pgTAP re-ran clean at **23 files/278 PASS**. **Not done:** `/rls-audit` not re-run (this pass's only code change is two client-side hook dependency arrays — no migration, policy, or grant touched). |

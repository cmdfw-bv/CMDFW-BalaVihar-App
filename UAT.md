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

## 3. Sign-off

| Date | Tester | Result |
|---|---|---|
| 2026-07-15 | Claude Code (`/test` gate, issue #17 design-parity pass) | 9/9 Pass |
| 2026-07-16 | Claude Code (`/test` gate, issue #17 MobileTabBar componentization + shared `TAB_TITLES`) | 9/9 Pass (UAT-3, -5 — the two scenarios that exercise the tab bar — re-walked live via playwright-cli against `parent1a`/`multirole` at 390px/768px, confirming the new `MobileTabBar` renders correctly and updates on role switch, see notes above; UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward from 2026-07-15) |
| 2026-07-17 | Claude Code (`/test` gate, issue #17 code-review follow-ups: `SessionProvider.tsx` native-only deep-link guard + ADR-0027 minors'-PII audit-exemption addendum) | 9/9 Pass. Full suite re-run: vitest 233/233, pgTAP 19 files/169 assertions (incl. `150_scope_label_resolution_rpc.sql`, unaffected by the comment-only migration changes). UAT-1 re-walked live (web sign-in via `parent1a` and `multirole`, 0 console errors — the exact regression the code-review comment flagged is confirmed absent) and UAT-5 re-walked live (multirole role switch at 1024px desktop, including live confirmation of the ADR-0027 scope — the switcher resolved `Parent · Student7_1, Student7_2` while Teacher was the active role). Design parity re-checked at 390/768/1024/1440 for `app/(tabs)/_layout.tsx`/`DesktopSidebar.tsx`/`MobileTabBar.tsx` (untouched by today's diff, confirmed no regression — screenshots at all four breakpoints match the 2026-07-15/-16 passes). UAT-2, -3, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. |
| 2026-07-21 | Claude Code (`/test` gate, issue #5 notifications infra: `PushPermissionCard`/`AddToHomeScreenHint` wired into the nav shell) | Full suite green: vitest 280/280, pgTAP 19 files/169 assertions (no new migrations in this diff — `push_subscriptions` RLS unchanged, `/rls-audit` not required). No UAT scenario regressed. Design parity checked at 360/768/1024/1440 for `PushPermissionCard`/`AddToHomeScreenHint` (new) and `app/(tabs)/_layout.tsx` (nav-shell wiring) — consistent theme-token usage, no horizontal scroll, ≥44px touch targets, no regressions. UAT-3 and UAT-5 (the two nav-flow scenarios this diff's `_layout.tsx` change touches) re-walked live: `parent1a` still sees exactly Feed/Attendance/Chat with the push card rendering above the tab bar; `multirole` role switch (Teacher → BV Coordinator) still updates the tab bar in place with 0 console errors, unaffected by the new components. UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. **Push-flow verification (playwright-cli, highest-risk item per §8.1):** iOS Safari UA (WebKit) confirms `AddToHomeScreenHint` shows and `PushPermissionCard` correctly defers to it pre-install, then swaps the instant `display-mode: standalone` is simulated (post-install) — matching the iOS 16.4+ precedence spec'd in `notifications-infra.md`. "Not now" dismisses and persists across reload. **Found + fixed a real bug in this pass:** the very first "Enable notifications" click on any fresh browser profile reliably failed silently (`AbortError: no active Service Worker` — `register()` resolves before the worker is active, and `subscribe()` doesn't wait) with no error shown to the user and no retry path, since the card dismisses unconditionally. Filed as issue #41, fixed in `lib/notifications/registerForPush.ts` (await `navigator.serviceWorker.ready` before subscribing), reverified end-to-end with a brand-new Chrome profile (0 prior SW registrations): first-ever click now succeeds, `POST push_subscriptions => 201 Created`, row confirmed via direct DB query, vitest re-run 280/280 green, issue closed. Also discovered and fixed a local-only setup gap: `.env`'s `EXPO_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` were blank (no generation step documented), which silently broke the subscribe flow with `InvalidAccessError` — populated with a freshly generated dev-only keypair for this workspace's local testing. |
| 2026-07-24 | Claude Code + human (`/test` gate, issue #20 teacher attendance UI: `app/(tabs)/attendance.tsx` + `lib/attendance/**` + ADR-0031 `sessions.day_of_week/start_time/end_time` migration) | Full suite green: vitest 413/413, pgTAP 21 files/193 assertions (new `160_session_weekly_schedule.sql` + `165_session_weekly_schedule_and_attendance_adversarial.sql`, the latter added by this pass's `/rls-audit` — role×scope adversarial coverage for the new `sessions` columns and the teacher attendance read/write RPC path, no cross-scope leakage found). **No UAT scenario applies directly** — this diff touches no auth/session/nav code (`_layout.tsx`, `SessionProvider.tsx`, `RoleSwitcher.tsx`, `DesktopSidebar.tsx` all untouched); skipping UAT-1 through UAT-9 as genuinely out of this diff's blast radius, per the walk-or-skip-with-reason rule. Incidentally reconfirmed in passing during today's manual attendance walkthrough: `teacher1@bv-seed.test.local` signs in and lands on the correct Teacher tab set including a functional Attendance tab (the UAT-1/UAT-3 substance), not a dedicated re-walk. Design parity checked at 360/768/1024/1440 (manual, human-in-the-loop — no `playwright-cli`/`chromium-cli`/browser-MCP tool available this session): header (RoleBadge + schedule line), date-nav (tabular date, ±7-day step per ADR-0031, correctly clamped to session end), roster row (Card + SegmentedTabs → StatusChip on save), one full-width primary Submit button, no horizontal scroll, ≥44px targets — all confirmed pass at every breakpoint. **Found + fixed a real environment issue, not an app bug:** local Supabase Docker stack is shared across concurrent git worktrees on this machine; another worktree's `supabase db reset` clobbered this worktree's schema mid-session (dropped the new `sessions` columns), surfacing as the attendance screen's error-preserving state ("Couldn't load your roster"). Root-caused via `supabase migration list --local` showing migration timestamps absent from this worktree's `supabase/migrations/`, fixed by re-running `supabase db reset` in this worktree; recorded to persistent memory as a recurring hazard for future sessions. **Advisory finding (not a leak, not blocking):** `mark_attendance_for_staff` performs no server-side date-bound/day-of-week validation — a teacher can submit attendance for a date far outside the session's calendar (still gated to their own class, just not calendar-validated); flagged for a follow-up ticket, not required for this promotion. |
| 2026-07-24 | Claude Code (`/test` gate, ad-hoc report: "magic sign-in flow seems to be broken") | **Found and fixed a real bug.** Initial pass: this workspace was freshly `git pull`ed to `origin/main` (2b4524c) and rebuilt; a blank `.env` (`EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY`) was crashing every route render — fixed, unrelated to app code. A fresh magic link then signed in cleanly, so the flow didn't reproduce as broken — until the user supplied their own (expired/reused) link. Following it exposed `app/auth/callback.tsx` silently swallowing Supabase's `error`/`error_code`/`error_description` redirect params and dumping the user back on a blank sign-in form with no explanation. Filed as issue #44, fixed test-first (new `lib/auth/authCallbackError.ts`, 5 vitest cases, TDD red→green) so the callback now forwards a friendly message to the sign-in screen's existing error state — reused as-is, no new styling, DoD-checked live at 360/768/1024/1440 (screenshots, no regressions). Reverified end-to-end: expired link now shows a clear error; a freshly-clicked valid link still signs in cleanly (0 console errors) — no regression to the happy path. Issue closed. Full suite green: vitest 384/384 (5 new), pgTAP 19 files/169 assertions (unaffected — no schema/RLS touched, `/rls-audit` not required). UAT-2 through -9 not re-walked (unaffected — no nav/role-switch/session code touched), carried forward from 2026-07-21. |
| 2026-07-25 | Claude Code (`/test` gate, PR #49 code-review follow-up: `AttendanceRosterRow.tsx` correction-flow fix (decision #6) + `useAttendanceRoster.ts` double-submit guard/`isSubmitting` + transient-`classId` guard + `scripts/_secret-checks.js` roster/enrollment path false-positive fix) | Full suite green: vitest 414/414, pgTAP 21 files/193 assertions. No migration/RLS changes in this diff — `/rls-audit` not required. **No UAT scenario applies directly** — this diff touches no auth/session/nav code; skipping UAT-1 through UAT-9 as out of this diff's blast radius, per the walk-or-skip-with-reason rule. Design parity checked live via playwright-cli (Chromium, signed in as `teacher1@bv-seed.test.local` via Mailpit magic link) at 360/768/1024/1440 for the unsaved state, the post-submit saved state (the PR's core fix — `SegmentedTabs` + `StatusChip` together), the correction tap (confirmed the chip disappears immediately and the row stays editable, per decision #6), and the empty state (temporarily zeroed `teacher2`'s one enrollment, reverted after). 0 console errors throughout. **Found + fixed a real bug in this pass:** at exactly the 360px breakpoint, the saved-row layout (`SegmentedTabs` + `StatusChip` rendered together, per this PR's fix) squeezed the name column to near-zero width, causing the student's name to wrap one character per line and the row to overlap the Submit button. Filed as issue #55, root-caused (via `superpowers:systematic-debugging`) to `info` lacking a `minWidth` floor against a newly-widened `control` slot — same bug class already documented and fixed once before in `components/core/ListRow.tsx`; applied the identical established pattern (`flex:1 + minWidth` floor on the text column, `flexShrink:1 + minWidth:0` + `flexWrap` on the control column). Reverified clean at all four breakpoints, vitest re-run 414/414, issue closed. Local DB hygiene: this pass's own live E2E testing (real RPC calls) left stray `attendance`/`audit_log` rows in the shared local Supabase instance — deleted after each run; also found and removed 6 *pre-existing* stray `audit_log` rows (from an earlier session's manual E2E pass) that were inflating a pgTAP `audit_log_org_read` assertion 12 vs. the expected 6 — confirmed via row-ID mismatch against the test's own fixture UUIDs before deleting, user-confirmed first. |

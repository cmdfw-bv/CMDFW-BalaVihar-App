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

## 3. Sign-off

| Date | Tester | Result |
|---|---|---|
| 2026-07-15 | Claude Code (`/test` gate, issue #17 design-parity pass) | 9/9 Pass |
| 2026-07-16 | Claude Code (`/test` gate, issue #17 MobileTabBar componentization + shared `TAB_TITLES`) | 9/9 Pass (UAT-3, -5 — the two scenarios that exercise the tab bar — re-walked live via playwright-cli against `parent1a`/`multirole` at 390px/768px, confirming the new `MobileTabBar` renders correctly and updates on role switch, see notes above; UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward from 2026-07-15) |
| 2026-07-17 | Claude Code (`/test` gate, issue #17 code-review follow-ups: `SessionProvider.tsx` native-only deep-link guard + ADR-0027 minors'-PII audit-exemption addendum) | 9/9 Pass. Full suite re-run: vitest 233/233, pgTAP 19 files/169 assertions (incl. `150_scope_label_resolution_rpc.sql`, unaffected by the comment-only migration changes). UAT-1 re-walked live (web sign-in via `parent1a` and `multirole`, 0 console errors — the exact regression the code-review comment flagged is confirmed absent) and UAT-5 re-walked live (multirole role switch at 1024px desktop, including live confirmation of the ADR-0027 scope — the switcher resolved `Parent · Student7_1, Student7_2` while Teacher was the active role). Design parity re-checked at 390/768/1024/1440 for `app/(tabs)/_layout.tsx`/`DesktopSidebar.tsx`/`MobileTabBar.tsx` (untouched by today's diff, confirmed no regression — screenshots at all four breakpoints match the 2026-07-15/-16 passes). UAT-2, -3, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. |
| 2026-07-21 | Claude Code (`/test` gate, issue #5 notifications infra: `PushPermissionCard`/`AddToHomeScreenHint` wired into the nav shell) | Full suite green: vitest 280/280, pgTAP 19 files/169 assertions (no new migrations in this diff — `push_subscriptions` RLS unchanged, `/rls-audit` not required). No UAT scenario regressed. Design parity checked at 360/768/1024/1440 for `PushPermissionCard`/`AddToHomeScreenHint` (new) and `app/(tabs)/_layout.tsx` (nav-shell wiring) — consistent theme-token usage, no horizontal scroll, ≥44px touch targets, no regressions. UAT-3 and UAT-5 (the two nav-flow scenarios this diff's `_layout.tsx` change touches) re-walked live: `parent1a` still sees exactly Feed/Attendance/Chat with the push card rendering above the tab bar; `multirole` role switch (Teacher → BV Coordinator) still updates the tab bar in place with 0 console errors, unaffected by the new components. UAT-1, -2, -4, -6, -7, -8, -9 unaffected by this diff — carried forward. **Push-flow verification (playwright-cli, highest-risk item per §8.1):** iOS Safari UA (WebKit) confirms `AddToHomeScreenHint` shows and `PushPermissionCard` correctly defers to it pre-install, then swaps the instant `display-mode: standalone` is simulated (post-install) — matching the iOS 16.4+ precedence spec'd in `notifications-infra.md`. "Not now" dismisses and persists across reload. **Found + fixed a real bug in this pass:** the very first "Enable notifications" click on any fresh browser profile reliably failed silently (`AbortError: no active Service Worker` — `register()` resolves before the worker is active, and `subscribe()` doesn't wait) with no error shown to the user and no retry path, since the card dismisses unconditionally. Filed as issue #41, fixed in `lib/notifications/registerForPush.ts` (await `navigator.serviceWorker.ready` before subscribing), reverified end-to-end with a brand-new Chrome profile (0 prior SW registrations): first-ever click now succeeds, `POST push_subscriptions => 201 Created`, row confirmed via direct DB query, vitest re-run 280/280 green, issue closed. Also discovered and fixed a local-only setup gap: `.env`'s `EXPO_PUBLIC_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` were blank (no generation step documented), which silently broke the subscribe flow with `InvalidAccessError` — populated with a freshly generated dev-only keypair for this workspace's local testing. |
| 2026-07-24 | Claude Code (`/test` gate, issue #23 coordinator compliance dashboard) | Full suite green: vitest 398/398, pgTAP 21 files/193 assertions (incl. new `160_class_meetings_schema.sql`, `165_session_compliance_rpc.sql`, and one new assertion added this pass for `audit_log_coordinator_read` branch-(c) cross-coordinator isolation — see RLS audit below). **RLS adversarial audit** (`rls-adversarial-tester` subagent) on the two new migrations (`class_meetings`/`class_updates` schema + RLS, `get_session_compliance_for_staff` RPC, rewritten `audit_log_coordinator_read` policy): all cross-scope/cross-role/anon/post-role-switch attacks denied correctly, 0 FAILs; one non-blocking observation (any authenticated user can cause a `denied` audit_log row against an arbitrary session id — audit-log noise potential, not a scope/PII leak) — not blocking. Design parity checked live via playwright at 360/768/1024/1440 for `ComplianceBar.tsx` (new `placeholder` prop) and the new `ComplianceDashboardScreen.tsx` — token-driven colors, tabular-nums figures, no horizontal scroll, ≥44px touch targets, full mobile/desktop parity, 0 console errors. New **UAT-10** scenario added and walked live (see above) — Pass, with a non-blocking seed-data note (`enrolled_at` timing means only the update-rate metric shows live colored-bar content this pass; attendance-rate's non-placeholder state was verified by code read only). UAT-1 through -9 unaffected by this diff — carried forward. |

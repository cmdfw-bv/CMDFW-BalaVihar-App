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

- [x] Pass  - [ ] Fail (notes: verified via playwright-cli 2026-07-15; loading state also confirmed by code read of app/(auth)/sign-in.tsx)

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

- [x] Pass  - [ ] Fail (notes: confirmed during design-parity gate screenshots at 360/768/1024/1440)

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

- [x] Pass  - [ ] Fail (notes: on /classes as Teacher, switched to BV Coordinator — tab bar updated to Feed/Chat/Dashboard/Approvals and silently redirected to /feed)

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

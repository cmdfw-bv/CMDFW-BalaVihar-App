# Nav-shell design-parity fixes (post `/test` pass, issue #17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five discrete gaps found during the `/test` design-parity gate (step 3b) run against `bv-connect/**` on 2026-07-15: mobile bottom-tab icons falling back to a generic placeholder glyph instead of the app's real icon set, the sign-in screen missing most of its reference copy/states, the header title truncating on multi-role accounts at phone/tablet widths, a duplicated brand bar on desktop widths, and (flagged, human-validation required — see Task 6) a possible reconsideration of the parent role's "Org" scope label.

**Architecture:** Every fix is either (a) a client-only RN/Unistyles change verified with `playwright-cli` against the exact `design/sankalp/bv-connect/**` reference already used for this feature's earlier design-parity passes, since this repo has no RTL/jsdom harness for JSX (`vitest.config.ts` runs pure Node, only `components/**/__tests__` pure-logic files are unit-tested — JSX wiring is "verified live via playwright-cli at /test", per the existing `AppHeader.tsx`/`RoleSwitcher.tsx` code comments), or (b) a `SECURITY DEFINER` SQL RPC change with full pgTAP Red→Green coverage (non-negotiable #4). No RLS/access-control semantics change in any task — every fix is presentational.

**Tech Stack:** Expo/React Native (RN-Web), `react-native-unistyles` (`lib/theme.ts`), `react-native-svg`, `playwright-cli` for verification, Supabase CLI + pgTAP (`npx supabase test db`) for Task 5, vitest for Task 6.

## Global Constraints

- **Access control is RLS in the database, never the client** (constitution §12.1 #1) — untouched by this plan; every task here is visual/copy only except Task 5, which only changes what a `SECURITY DEFINER` function returns for the caller's *own* rows (unchanged ownership predicate `ur.user_id = auth.uid()`).
- **No secrets or PII in client code** (§12.1 #2) — children's first names (Task 5) are already-consented family data surfaced today via `family_members`/`students` reads elsewhere in the app; this task adds no new PII exposure surface, only a friendlier label for data the parent already has RLS access to about their own children.
- **Schema is code** (§12.1 #3): Task 5 ships as a **new** timestamped migration — do **not** edit the already-applied `supabase/migrations/20260714224917_resolve_my_scope_labels_rpc.sql` in place.
- **TDD is non-negotiable** (§12.1 #4): Task 5 (pgTAP) and Task 6 (vitest) each start with a failing test, confirmed Red, before implementation. Tasks 1–4 have no unit-testable seam in this codebase (pure JSX/style wiring) — each ends with an explicit `playwright-cli` verification step instead, matching the pattern already established for `AppHeader`/`RoleSwitcher` in this feature.
- **Design-system DoD** (`.claude/rules/design-system.md`): compose from `theme` tokens only, no hex/pixel literals beyond what's already a documented exception in this codebase; ≥44px targets; no horizontal scroll; verify at 360/768/1024/1440.
- **`--primary` (terracotta, `theme.colors.accent`) is this system's one CTA color** — `--indigo`/`--gold` are identity-only (`design/sankalp/tokens.css:17-19`). Do not "fix" terracotta buttons toward indigo; that would be wrong, not a fix.
- **Task 6 reopens a previously human-validated decision.** `docs/superpowers/plans/2026-07-14-resolve-scope-labels.md`'s Global Constraints explicitly grouped parent with bv_coordinator/admin/student as "unchanged — they keep falling back to ... 'Org'". Task 6 proposes changing that specifically for `parent`. **Do not implement Task 6 without an explicit human go-ahead in this session** — Tasks 1–5 do not depend on it and should ship regardless of that answer.

---

## File Structure

- **Modify** `app/(tabs)/_layout.tsx` — wire `tabBarIcon` into every `Tabs.Screen` (Task 1); drop the duplicated desktop header (Task 4).
- **Modify** `app/(auth)/sign-in.tsx` — restore heading/description/placeholder/footer/resend copy to match `MagicLinkLogin.jsx` (Task 2).
- **Modify** `components/RoleSwitcher.tsx` — cap the switcher's width so it shrinks before the app title does (Task 3).
- **Create** `supabase/migrations/20260715030000_resolve_parent_scope_label.sql` — parent scope label via `family_members`/`students` (Task 5, gated on Task 6's human go-ahead).
- **Modify** `supabase/tests/150_scope_label_resolution_rpc.sql` — new pgTAP cases for the parent branch (Task 5).
- **Modify** `components/appHeaderSubtitle.ts` + `components/__tests__/appHeaderSubtitle.test.ts` — "My Children" fallback (Task 6).
- **Modify** `.docs/specs/system/client-auth-session-and-nav.plan.md` — log this pass's fixes (Task 7).

---

### Task 1: Wire real tab icons into the mobile bottom tab bar

**Files:**
- Modify: `app/(tabs)/_layout.tsx:1-53`

**Interfaces:**
- Consumes: `TabIcon` — `export function TabIcon({ tab, color, size = 22 }: { tab: TabKey; color: ColorValue; size?: number })` (`components/icons/TabIcons.tsx:87`, already unit-tested via `iconNameForTab.test.ts` — no logic change needed here, only wiring).
- Produces: nothing new consumed elsewhere.

**Root cause:** `DesktopSidebar.tsx:68` is the *only* call site of `TabIcon` in the whole app (confirmed via `grep -rn "TabIcon\b" app/ components/ lib/`). `_layout.tsx`'s `Tabs.Screen` `options` (line 43) only sets `title`/`href` — no `tabBarIcon` — so at phone/tablet widths (`isDesktop` false, `tabBar` prop `undefined`, i.e. React Navigation's default bottom-tab renderer) the bar falls back to its built-in default icon (a plain gray downward-triangle, confirmed via `playwright-cli` screenshot at 375px signed in as `teacher1`), never the app's real icon set.

- [ ] **Step 1: Add the `TabIcon` import**

In `app/(tabs)/_layout.tsx`, after the existing `DesktopSidebar` import (line 8):

```tsx
import DesktopSidebar from "../../components/DesktopSidebar";
import { TabIcon } from "../../components/icons/TabIcons";
import { useIsDesktop } from "../../lib/useIsDesktop";
```

- [ ] **Step 2: Pass `tabBarIcon` in each `Tabs.Screen`'s options**

Replace the `ALL_TABS.map(...)` block (lines 39–45):

```tsx
      {ALL_TABS.map((tab) => (
        <Tabs.Screen
          key={tab}
          name={tab}
          options={{
            title: TAB_TITLES[tab],
            href: visible.has(tab) ? undefined : null,
            tabBarIcon: ({ color, size }) => <TabIcon tab={tab} color={color} size={size} />,
          }}
        />
      ))}
```

- [ ] **Step 3: Verify with `playwright-cli` (no unit-test seam for this JSX wiring — see Global Constraints)**

```bash
npm run dev   # if not already running — app at http://localhost:8888
```

```bash
playwright-cli -s=t1 open http://localhost:8888/sign-in --browser=chrome
playwright-cli -s=t1 resize 375 700
# fill+submit teacher1@bv-seed.test.local, fetch the magic link from
# http://127.0.0.1:54324 (Mailpit — mailbox "teacher1"), click "Sign in" inside the email tab,
# switch to that tab (it lands on /feed).
playwright-cli -s=t1 screenshot --filename=/tmp/tabbar-icons-375.png
```

Expected: the bottom tab bar shows the app's real Feed/Classes/Attendance/Chat glyphs (matching `DesktopSidebar`'s icons at desktop widths), not a gray triangle/caret. Also spot-check 360 and 768.

- [ ] **Step 4: Run the full suite to confirm no regression**

```bash
npm run typecheck && npm test
```

Expected: same pass counts as before this change (typecheck clean, 24 files / 231 tests) — this task adds no new test files.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/_layout.tsx
git commit -m "fix: wire real tab icons into the mobile bottom tab bar"
```

---

### Task 2: Sign-in screen — restore full copy/state parity with `MagicLinkLogin.jsx`

**Files:**
- Modify: `app/(auth)/sign-in.tsx` (full-file rewrite below)

**Interfaces:**
- Consumes: `Logo` — `components/brand/Logo.tsx` (unchanged, same props already used: `size`, `title`, `tagline`). `theme` via `useUnistyles()` and `StyleSheet.create((theme) => ...)` — `lib/theme.ts` tokens: `fonts.display`, `type.scale.h3`, `type.leading.body`, `colors.statusRamp.present`/`presentSoft`, `radius.pill`, `space["12"]`.
- Produces: nothing new consumed elsewhere — this is a leaf screen.

**Gap vs. reference** (`design/sankalp/bv-connect/components/auth/MagicLinkLogin.jsx`): missing the "Sign in" heading, missing the descriptive paragraph, placeholder is generic "Email" instead of "you@example.com", button label doesn't match ("Send sign-in link" vs. "Send magic link"), sent-state has no checkmark icon, no "Resend link" action, and no footer note about accounts being center-provisioned (no self-registration). Colors/tokens were already correct (terracotta CTA via `theme.colors.accent`) — don't change those.

- [ ] **Step 1: Replace `app/(auth)/sign-in.tsx` in full**

```tsx
import "../../lib/unistyles";
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import * as Linking from "expo-linking";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import Logo from "../../components/brand/Logo";

type ScreenState = "form" | "loading" | "error" | "sent";

export default function SignIn() {
  const { theme } = useUnistyles();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ScreenState>("form");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit() {
    setState("loading");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: Linking.createURL("/auth/callback") },
    });
    if (error) {
      // error-preserving: email is not cleared, retry re-submits the same call (AC#11, edge case).
      setErrorMessage(error.message);
      setState("error");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <View style={styles.container}>
        <View style={styles.form}>
          <View style={styles.logoRow}>
            <Logo size={44} title="Bala Vihar App" tagline="CMDFW · Dallas–Fort Worth" />
          </View>
          <View style={styles.checkCircle}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={theme.colors.statusRamp.present} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12l4 4L19 6" />
            </Svg>
          </View>
          <Text style={styles.heading}>Check your email</Text>
          <Text style={styles.bodyText}>
            We sent a sign-in link to <Text style={styles.bodyTextStrong}>{email || "your inbox"}</Text>. It expires in 15 minutes.
          </Text>
          <Pressable onPress={submit} hitSlop={8}>
            <Text style={styles.resendText}>Resend link</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <View style={styles.logoRow}>
          <Logo size={44} title="Bala Vihar App" tagline="CMDFW · Dallas–Fort Worth" />
        </View>
        <Text style={styles.heading}>Sign in</Text>
        <Text style={styles.bodyText}>
          Enter the email your coordinator has on file. We&rsquo;ll send a secure sign-in link — no password needed.
        </Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {state === "error" && <Text style={styles.errorText}>{errorMessage}</Text>}
        {/* One primary action per view (theme.colors.accent) — the DoD gate this whole screen exists to satisfy. */}
        <Pressable
          style={[styles.button, state === "loading" && styles.buttonDisabled]}
          onPress={submit}
          disabled={state === "loading"}
        >
          <Text style={styles.buttonText}>{state === "loading" ? "Sending…" : "Send magic link"}</Text>
        </Pressable>
        <Text style={styles.footerText}>
          Accounts are set up by your center. There&rsquo;s no public sign-up — students never self-register.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space.lg,
  },
  form: {
    width: "100%",
    maxWidth: theme.chrome.maxw,
    gap: theme.space.md,
  },
  logoRow: {
    alignItems: "center",
    marginBottom: theme.space.sm,
  },
  heading: {
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.h3,
    color: theme.colors.ink,
  },
  bodyText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    lineHeight: theme.type.scale.sm * theme.type.leading.body,
    color: theme.colors.ink3,
  },
  bodyTextStrong: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.ink,
  },
  input: {
    minHeight: theme.chrome.hitMin,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.sm,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
  },
  errorText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
    color: theme.colors.status.absent,
  },
  button: {
    minHeight: theme.chrome.hitMin,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.body,
    color: theme.colors.onAction,
  },
  footerText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink4,
  },
  checkCircle: {
    alignSelf: "center",
    width: theme.space["12"],
    height: theme.space["12"],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.statusRamp.presentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  resendText: {
    alignSelf: "center",
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    color: theme.colors.accent,
  },
}));
```

- [ ] **Step 2: Verify with `playwright-cli` (no unit-test seam — see Global Constraints)**

```bash
playwright-cli -s=t2 open http://localhost:8888/sign-in --browser=chrome
playwright-cli -s=t2 resize 360 800
playwright-cli -s=t2 snapshot --filename=/tmp/signin-form-360.yml
```

Expected snapshot text includes: "Sign in" heading, the "Enter the email your coordinator has on file..." paragraph, a `you@example.com` placeholder, "Send magic link" button text, and the "Accounts are set up by your center..." footer note.

```bash
playwright-cli -s=t2 fill <email-ref> "teacher1@bv-seed.test.local"
playwright-cli -s=t2 click <submit-ref>
playwright-cli -s=t2 snapshot --filename=/tmp/signin-sent-360.yml
```

Expected: "Check your email" heading, the "We sent a sign-in link to teacher1@bv-seed.test.local..." text, and a "Resend link" action. Repeat resize at 768/1024/1440 — same content, no horizontal scroll, no overlap.

- [ ] **Step 3: Run typecheck + full suite**

```bash
npm run typecheck && npm test
```

Expected: clean typecheck, 24 files / 231 tests still passing (no vitest coverage of this file either before or after — see Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/sign-in.tsx
git commit -m "fix: restore sign-in screen copy/state parity with MagicLinkLogin.jsx"
```

---

### Task 3: Fix header title truncation for multi-role accounts at narrow widths

**Files:**
- Modify: `components/RoleSwitcher.tsx:106-118` (the `container`/`containerStacked` style block and the `containerStyle` computation at line 34)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — internal style fix only.

**Root cause:** React Native's Yoga layout defaults `flexShrink` to `0` (unlike web's default of `1`). `components/AppHeader.tsx:28` gives the title column `flex: 1` (which implies `flexShrink: 1`, `flexBasis: 0%`), but `RoleSwitcher`'s `container` style (`components/RoleSwitcher.tsx:106-113`) sets neither `flex` nor `flexShrink`, so it never shrinks below its own content's natural width. In the shared header row, all the available compression pressure lands on the title (`components/AppHeader.tsx`'s `title`/`subtitle` `Text` with `numberOfLines={1}`), so a long multi-role chip (e.g. `multirole`'s "BV Coordinator · Org") squeezes "Bala Vihar App" down to "Bala Vi…" at ≤768px, while a short single-role chip (`parent1a`) doesn't. Confirmed via `playwright-cli` screenshots at 360/768 comparing `multirole` vs. `parent1a`.

**Fix:** give the switcher a hard width cap *only* when it's laid out inline in the header (`stacked=false` — the `stacked=true` case is `DesktopSidebar`'s footer, which has its own full-width column and no title to compete with, so it must be untouched).

- [ ] **Step 1: Add a `containerHeader` style variant and switch it in**

In `components/RoleSwitcher.tsx`, change line 34:

```tsx
  const containerStyle = [styles.container, stacked && styles.containerStacked];
```

to:

```tsx
  const containerStyle = [styles.container, stacked ? styles.containerStacked : styles.containerHeader];
```

Then add a new style key alongside the existing `containerStacked` (in the `StyleSheet.create` block, after `containerStacked`):

```tsx
  containerStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: theme.space["1"],
    paddingHorizontal: 0,
  },
  containerHeader: {
    flexShrink: 1,
    maxWidth: "58%",
  },
```

- [ ] **Step 2: Verify with `playwright-cli` (no unit-test seam — see Global Constraints)**

```bash
playwright-cli -s=t3 open http://localhost:8888/sign-in --browser=chrome
playwright-cli -s=t3 resize 360 800
# sign in as multirole@bv-seed.test.local (via Mailpit at http://127.0.0.1:54324, mailbox
# "multirole"), then:
playwright-cli -s=t3 snapshot --filename=/tmp/header-multirole-360.yml
```

Expected: the snapshot's title text node reads the full "Bala Vihar App" (not truncated to "Bala Vi…"). Repeat at 768px. Then repeat the whole check for `parent1a` (single-role chip) to confirm it's still untruncated too (regression check — it already passed before this fix, must still pass after). Finally sign in as any account with `showSwitcher` on desktop (`isDesktop`, `stacked=true` path, `DesktopSidebar`'s footer) at 1024px and confirm that footer still lays out correctly (column, not compressed oddly) — this is the untouched-path regression check for `containerStacked`.

- [ ] **Step 3: Run typecheck + full suite**

```bash
npm run typecheck && npm test
```

Expected: clean typecheck, 24 files / 231 tests still passing.

- [ ] **Step 4: Commit**

```bash
git add components/RoleSwitcher.tsx
git commit -m "fix: cap RoleSwitcher width in the header so it shrinks before the app title does"
```

---

### Task 4: Remove the duplicated top header bar on desktop widths

**Files:**
- Modify: `app/(tabs)/_layout.tsx:31-37` (the `Tabs` `screenOptions`)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

**Root cause:** `screenOptions.header` in `app/(tabs)/_layout.tsx` renders `<AppHeader showSwitcher={!isDesktop} />` **unconditionally at every width**, including desktop (`isDesktop === true`). At desktop widths, `DesktopSidebar.tsx:46-48` *also* renders the brand (`<Logo size={28} title="Bala Vihar App" tagline="CMDFW" />`) in its own `logoRow`, plus the active role via its own `stacked` `RoleSwitcher` in the sidebar footer (line 75). The result is "Bala Vihar App" (and the role/scope subtitle) rendered **twice** at ≥1024px — once in the sidebar, once in a redundant top bar above the (currently placeholder-only) page content — diverging from the reference (`design/sankalp/bv-connect/screens/desktop/dash.jsx`), which shows brand identity once, in the sidebar, and reserves the top bar for page-specific content. The existing code comment justifying "AppHeader renders at every width now" cites only the *phone* header reference (`bv-connect/screens/phone/app.jsx .hdr`) — it was never meant to justify the desktop duplication, that was a gap in how the condition was applied.

**Fix:** only render `AppHeader` off-desktop; hide the header entirely on desktop (there's no page-specific top-bar content designed yet — every tab screen is still a placeholder, confirmed via the `/test` pass on 2026-07-15).

- [ ] **Step 1: Make the header conditional on `isDesktop`**

Replace lines 26–37 of `app/(tabs)/_layout.tsx`:

```tsx
  // AppHeader renders off-desktop (the design mirror's phone header, bv-connect/screens/
  // phone/app.jsx .hdr, always shows the OM mark + app name + role/scope, not just the bare
  // route title Expo Router's default header would show). On desktop the sidebar rail already
  // shows brand + role/scope (its own logoRow + stacked RoleSwitcher footer, issue #31) — an
  // AppHeader top bar there would duplicate both, diverging from the design mirror's
  // screens/desktop/dash.jsx (brand shown once, top bar reserved for page-specific content).
  const tabs = (
    <Tabs
      tabBar={isDesktop ? (props) => <DesktopSidebar {...props} visible={visible} /> : undefined}
      screenOptions={{
        ...(isDesktop
          ? { headerShown: false, tabBarPosition: "left" as const }
          : { header: () => <AppHeader showSwitcher /> }),
      }}
    >
```

(The `ALL_TABS.map(...)` block below is unchanged from Task 1.)

- [ ] **Step 2: Verify with `playwright-cli` (no unit-test seam — see Global Constraints)**

```bash
playwright-cli -s=t4 open http://localhost:8888/sign-in --browser=chrome
playwright-cli -s=t4 resize 1024 800
# sign in as admin1@bv-seed.test.local (Mailpit mailbox "admin1")
playwright-cli -s=t4 snapshot --filename=/tmp/desktop-1024-no-dup.yml
```

Expected: exactly **one** "Bala Vihar App" text node in the snapshot (in the sidebar), no separate top bar above the page content. Repeat at 1440px. Then resize back to 375px on the *same* signed-in session and confirm the phone header (`AppHeader`, brand + role chip) still renders as before — this is the regression check for the untouched off-desktop branch.

- [ ] **Step 3: Run typecheck + full suite**

```bash
npm run typecheck && npm test
```

Expected: clean typecheck, 24 files / 231 tests still passing.

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/_layout.tsx
git commit -m "fix: stop duplicating the brand/role header bar on desktop widths"
```

---

### Task 5: Resolve the parent role's scope label via `family_members`/`students`

> **Gated on Task 6's human go-ahead — see Global Constraints. Do not start this task until that's confirmed.**

**Files:**
- Modify: `supabase/tests/150_scope_label_resolution_rpc.sql` (append new fixtures/cases, bump `plan(8)` → `plan(10)`)
- Create: `supabase/migrations/20260715030000_resolve_parent_scope_label.sql`

**Interfaces:**
- Consumes: `family_members(family_id, user_id)`, `students(family_id, first_name)` — pre-existing (`supabase/migrations/20260709032506_core_operational_schema.sql:30-48`). `user_roles(id, user_id, role, scope_type, scope_id)` — pre-existing.
- Produces: `public.resolve_my_scope_labels()` — same signature as today (`returns table (user_roles_id uuid, scope_label text)`), only the `parent`-role branch's returned value changes (comma-joined children's first names instead of `null`). No consumer (`lib/auth/SessionProvider.tsx`, `components/appHeaderSubtitle.ts`) needs any change for this task — they already pass whatever `scope_label` the RPC returns straight through.

**Root cause:** `supabase/seed/seed.sql:50` seeds every parent's `user_roles` row as `scope_type='org', scope_id=null` with the comment "parent has no scope_id concept; stored as org/null, resolved via family_members at read time" — but `resolve_my_scope_labels()` (`supabase/migrations/20260714224917_resolve_my_scope_labels_rpc.sql`) never actually does that resolution; its `case ur.scope_type ... else null end` falls through to `null` for `org`, and `appHeaderSubtitle()`'s fallback then capitalizes the raw `scope_type` to "Org" — reading as org-wide access, which a parent never has (RLS scopes them to their own children only, via `family_members`).

- [ ] **Step 1: Write the failing pgTAP case**

Append to `supabase/tests/150_scope_label_resolution_rpc.sql`, right before the final `select * from finish(); rollback;` lines:

```sql
-- Fixture: a family with two children, and a parent user whose user_roles row is seeded the
-- same way seed.sql seeds every parent (scope_type='org', scope_id=null) -- resolution must
-- come from family_members/students, not scope_type/scope_id.
select gen_random_uuid() as v_family \gset
insert into families (id) values (:'v_family'::uuid);
insert into students (id, family_id, first_name, last_name, grade_level) values
  (gen_random_uuid(), :'v_family'::uuid, 'Aanya', 'Rao', 'Gr3'),
  (gen_random_uuid(), :'v_family'::uuid, 'Kiran', 'Rao', 'Gr6');
select tests.create_supabase_user('scope-labels-parent@test.local') as v_parent \gset
insert into family_members (family_id, user_id, relationship) values (:'v_family'::uuid, :'v_parent'::uuid, 'guardian');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000e', :'v_parent'::uuid, 'parent', 'org', null, true);

-- Case 5: parent resolves to their children's names, not null/"Org".
select tests.authenticate_as(:'v_parent'::uuid, 'parent', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000e'),
  'Aanya, Kiran',
  'case 5: parent (org scope, no scope_id) resolves to comma-joined children''s first names'
);
select tests.clear_authentication();

-- Case 6: a parent with zero children on file still resolves cleanly to null (not an error) --
-- appHeaderSubtitle's client-side fallback (Task 6) is what turns this into "My Children".
select gen_random_uuid() as v_childless_family \gset
insert into families (id) values (:'v_childless_family'::uuid);
select tests.create_supabase_user('scope-labels-childless-parent@test.local') as v_childless_parent \gset
insert into family_members (family_id, user_id, relationship) values (:'v_childless_family'::uuid, :'v_childless_parent'::uuid, 'guardian');
insert into user_roles (id, user_id, role, scope_type, scope_id, is_active) values
  ('90000003-0000-0000-0000-00000000000f', :'v_childless_parent'::uuid, 'parent', 'org', null, true);
select tests.authenticate_as(:'v_childless_parent'::uuid, 'parent', 'org', null);
select is(
  (select scope_label from resolve_my_scope_labels() where user_roles_id = '90000003-0000-0000-0000-00000000000f'),
  null,
  'case 6: a parent with no students on file resolves to null, not an error'
);
select tests.clear_authentication();
```

Also change the `select plan(8);` at the top of the file to `select plan(10);` (2 new `is()` assertions added above).

- [ ] **Step 2: Run pgTAP, confirm the new cases fail (Red)**

```bash
npx supabase test db 2>&1 | tail -20
```

Expected: `150_scope_label_resolution_rpc.sql` reports failures for "case 5" and "case 6" (case 5 expects `'Aanya, Kiran'` but gets `null`; case 6 should already pass since `null` is also what the *current* code returns for `org`/`null` — if case 6 unexpectedly fails, re-check the fixture, but case 5 must fail before Step 3).

- [ ] **Step 3: Create the migration**

Create `supabase/migrations/20260715030000_resolve_parent_scope_label.sql`:

```sql
-- Extends resolve_my_scope_labels() (issue #35 follow-up) so a parent role's scope label shows
-- the actual children's names instead of the capitalized scope_type fallback "Org". Parents are
-- seeded scope_type='org'/scope_id=null (seed.sql: "parent has no scope_id concept; stored as
-- org/null, resolved via family_members at read time") -- this migration is what actually does
-- that resolution. A parent has NO org-wide access (RLS scopes them to their own children via
-- family_members); showing "Org" in the header/switcher read as org-wide access, which is
-- actively misleading.
create or replace function public.resolve_my_scope_labels()
returns table (user_roles_id uuid, scope_label text)
language sql
stable
security definer
set search_path = public
as $$
  select
    ur.id as user_roles_id,
    case
      when ur.role = 'parent' then (
        select string_agg(s.first_name, ', ' order by s.first_name)
        from family_members fm
        join students s on s.family_id = fm.family_id
        where fm.user_id = ur.user_id
      )
      when ur.scope_type = 'class' then (
        select ce.name || ' · ' || se.name || ' · ' || cl.name
        from classes cl
        join sessions se on se.id = cl.session_id
        join centers ce on ce.id = se.center_id
        where cl.id = ur.scope_id
      )
      when ur.scope_type = 'session' then (
        select ce.name || ' · ' || se.name
        from sessions se
        join centers ce on ce.id = se.center_id
        where se.id = ur.scope_id
      )
      when ur.scope_type = 'center' then (
        select ce.name from centers ce where ce.id = ur.scope_id
      )
      else null
    end as scope_label
  from user_roles ur
  where ur.user_id = auth.uid();
$$;

revoke all on function public.resolve_my_scope_labels() from public;
grant execute on function public.resolve_my_scope_labels() to authenticated;
```

- [ ] **Step 4: Run pgTAP again, confirm Green**

```bash
npx supabase test db 2>&1 | tail -20
```

Expected: `Files=19, Tests=158, ... Result: PASS` (156 + 2 new cases; `supabase test db` applies every migration, including the new one, to a fresh test database on each run — no manual `db reset` needed).

- [ ] **Step 5: Commit**

```bash
git add supabase/tests/150_scope_label_resolution_rpc.sql supabase/migrations/20260715030000_resolve_parent_scope_label.sql
git commit -m "fix: resolve parent role's scope label via family_members instead of falling back to 'Org'"
```

---

### Task 6: Client-side "My Children" fallback for a childless parent

> **Human-validation gate — see Global Constraints. This task (and Task 5) revisit a decision recorded in `docs/superpowers/plans/2026-07-14-resolve-scope-labels.md`, which explicitly left parent/bv_coordinator/admin/student grouped as "unchanged — Org". Confirm with the human before implementing either Task 5 or Task 6.**

**Files:**
- Modify: `components/appHeaderSubtitle.ts`
- Modify: `components/__tests__/appHeaderSubtitle.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `appHeaderSubtitle(activeRole, scopeType, scopeLabel?)` — same signature, only the `parent`+no-resolved-label fallback branch changes. Consumed by `components/AppHeader.tsx:19` and `components/RoleSwitcher.tsx:36,86` — no call-site change needed.

**Why this is still needed after Task 5:** Task 5 resolves a parent's label from their children's names, but a parent with zero students on file (pgTAP case 6) still gets `scope_label: null` back from the RPC — today's `appHeaderSubtitle` fallback would then show "Parent · Org" for that edge case, same misleading text this whole pass is fixing. `appHeaderSubtitle` needs its own parent-specific fallback so that edge case reads "My Children" instead.

- [ ] **Step 1: Write the failing vitest case**

In `components/__tests__/appHeaderSubtitle.test.ts`, add (after the existing `'null resolved label (org-scoped role...) falls back to capitalized scope_type: "Admin · Org"'` case):

```ts
  it('parent with no resolved scope label falls back to "My Children", not capitalized scope_type: "Parent · My Children"',
    () => expect(appHeaderSubtitle('parent', 'org', null)).toBe('Parent · My Children'));
```

- [ ] **Step 2: Run vitest, confirm it fails (Red)**

```bash
npx vitest run components/__tests__/appHeaderSubtitle.test.ts
```

Expected: `FAIL` on the new case — actual value is `'Parent · Org'`.

- [ ] **Step 3: Implement the fallback**

Replace `components/appHeaderSubtitle.ts` in full:

```ts
const ROLE_LABEL: Record<string, string> = {
  student: "Student",
  parent: "Parent",
  teacher: "Teacher",
  coordinator: "Coordinator",
  bv_coordinator: "BV Coordinator",
  admin: "Admin",
};

export function appHeaderSubtitle(
  activeRole: string | null,
  scopeType: string | null,
  scopeLabel?: string | null
): string {
  if (!activeRole) return "";
  const roleLabel = ROLE_LABEL[activeRole] ?? activeRole;
  const fallbackScope =
    activeRole === "parent"
      ? "My Children"
      : scopeType
        ? scopeType.charAt(0).toUpperCase() + scopeType.slice(1)
        : "";
  const resolvedScope = scopeLabel ?? fallbackScope;
  return resolvedScope ? `${roleLabel} · ${resolvedScope}` : roleLabel;
}
```

- [ ] **Step 4: Run vitest again, confirm Green, and run the full suite**

```bash
npx vitest run components/__tests__/appHeaderSubtitle.test.ts
npm run typecheck && npm test
```

Expected: the new case passes; full suite is 24 files / 232 tests (231 + 1 new case), typecheck clean. Double-check the pre-existing `'null resolved label (org-scoped role, nothing to resolve) falls back to capitalized scope_type: "Admin · Org"'` case (line 18-19 of the test file) still passes unchanged — `admin` isn't `parent`, so it must still hit the `scopeType`-capitalizing branch, not the new one.

- [ ] **Step 5: Commit**

```bash
git add components/appHeaderSubtitle.ts components/__tests__/appHeaderSubtitle.test.ts
git commit -m "fix: parent with no resolved scope label falls back to 'My Children', not 'Org'"
```

---

### Task 7: Log this pass in the feature's plan doc

**Files:**
- Modify: `.docs/specs/system/client-auth-session-and-nav.plan.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Append a dated section**

Add a new section at the end of `.docs/specs/system/client-auth-session-and-nav.plan.md` (match the existing dated-section style already in that file):

```markdown
## 2026-07-15 — /test design-parity pass: 5 fixes

Found during a `/test` run's mandatory design-parity gate (step 3b) against `bv-connect/**`,
after the desktop nav shell + scope-label work landed:

1. Mobile bottom-tab bar was showing React Navigation's default placeholder icon, not the app's
   real icon set (`TabIcon` was only ever wired into `DesktopSidebar`) — fixed.
2. Sign-in screen was missing most of `MagicLinkLogin.jsx`'s copy/states (heading, description,
   placeholder, sent-state icon/resend/footer) — fixed.
3. Header title truncated on multi-role accounts at ≤768px (`RoleSwitcher`'s header-inline
   container had no `flexShrink`, so 100% of compression landed on the app title) — fixed.
4. Desktop widths (≥1024px) duplicated the brand/role bar — once in the sidebar, once in a
   redundant top `AppHeader` — fixed by hiding the top header entirely on desktop.
5/6. Parent role's scope label read "Parent · Org", reading as org-wide access a parent never
   has — resolved via `family_members`/`students`, with a "My Children" client fallback for the
   zero-children edge case. **This one reopened a decision from the 2026-07-14 scope-labels plan
   that had explicitly left parent as unchanged/"Org" — re-confirmed with the human before
   implementing.**

See `docs/superpowers/plans/2026-07-15-design-parity-fixes.md` for the full task-by-task plan.
```

- [ ] **Step 2: Commit**

```bash
git add .docs/specs/system/client-auth-session-and-nav.plan.md
git commit -m "docs: log the 2026-07-15 design-parity /test pass fixes"
```

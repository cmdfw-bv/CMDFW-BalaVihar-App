# Teacher — Attendance UI

> **owner:** Teacher · **consumers:** Teacher (primary); Coordinator/BV Coordinator/Admin indirectly via the compliance-dashboard rollup that reads the same `attendance` rows · **scope:** mark + submit attendance UI for the teacher's own class, calling the `mark_attendance_for_staff` SECURITY DEFINER RPC (ADR-0021) — own-class scope only · **governing ADR:** ADR-0021 (teacher-attendance-write-rpc, Closed — this item is the RPC's first and only client caller), ADR-0019 (hybrid RPC for staff reads of `students`/`attendance`, Closed — consumer, via `get_class_roster_for_staff` / `get_class_attendance_for_staff`), ADR-0030 (teacher-roster-enrollment-id-direct-read, Closed — resolves the `enrollment_id` gap below via a direct `enrollments` read, no RPC/schema change) · **covers:** doc 2 §2 Teacher POC-core ("mark & submit attendance"); doc 3 §5.4 (Teacher = class scope); §12.13 (four-state DoD)

**Stage:** Refined ✓ → Architect-reviewed ✓ (ADR-0030) → Design ✓ → Human sign-off ✓ (2026-07-24) → `/plan` ✓ (see [attendance-ui.plan.md](attendance-ui.plan.md)) → held for ADR-0031 → **Design revision ✓ (ADR-0031) → Human sign-off ✓ (2026-07-24)** → `/plan` sync ✓ (2026-07-24, [attendance-ui.plan.md](attendance-ui.plan.md) F5/F6/F11 + new F6a/F6b brought in line with the walk-back date-default/±7-day step logic) → **Human sign-off on plan sync ✓ (2026-07-24)** → `/migration` ✓ (2026-07-24, ADR-0031 schema landed: `supabase/migrations/20260724120000_session_weekly_schedule_fields.sql` + `supabase/tests/160_session_weekly_schedule.sql`; verified via `supabase db reset` + `supabase test db` — 20/20 files, 178/178 assertions green) → `/build` ✓ (2026-07-24: Stage 0 RLS confirmation assertions added to `010_operational_core_rls.sql`, six pure-logic modules under `lib/attendance/` built RED→GREEN per plan F1–F10, `useAttendanceRoster.ts` hook wired (F11), `AttendanceRosterRow.tsx`/`DateNav.tsx`/`app/(tabs)/attendance.tsx` composed from `components/core/*` (F12–F14); verified end-to-end against local Supabase signed in as a teacher seed fixture (Playwright + Mailpit magic-link flow) — content/roster/submit/saved states and ±7-day date-nav re-fetch confirmed with zero console errors; the error-preserving state was also observed live (surfaced correctly with retry) when a transient PostgREST schema-cache staleness hit mid-session, incidentally confirming that path too. Empty state (zero active enrollments) and the full four-breakpoint design-parity sweep are left to `/test`'s dedicated design-review gate. Full suite green — 413/413 vitest, 180/180 pgTAP) → next: `/test`.

---

## Requirements (refined)

### User story
**As a** Teacher, **I want** to open my class's Attendance tab, see my roster for a class meeting date, mark each student present or absent, and submit, **so that** the attendance record for that date is saved and visible to Coordinator/BV Coordinator/Admin compliance rollups — with no way for me to see or write another class's attendance.

### Decisions captured during refine
- **Date scope: today + past-date correction.** The screen defaults to the current class meeting date but lets the teacher pick a recent past date to view and re-submit — matching `mark_attendance_for_staff`'s existing upsert/correction branch (ADR-0021 Decision #1: `on conflict (enrollment_id, class_meeting_date) do update`). "Recent" (e.g. current session only, or a rolling N-day window) is left to `/design` to pin down against the `sessions`/`classes` calendar shape — not a business rule ambiguous enough to need another human round-trip, but flagged here so `/design` doesn't silently default to "today only."
- **Submit flow: explicit Submit button, not per-toggle autosave.** The teacher marks the whole visible roster locally (present/absent per student), then taps one Submit action that commits. This matches the issue's "mark & submit" framing and gives a single clear success/error confirmation instead of N silent background writes. Each committed row still goes through `mark_attendance_for_staff` individually (the RPC is per-enrollment, `returns attendance` not `setof`) — `/design` decides whether Submit fires those calls sequentially or concurrently, and how partial failure (some students' RPC calls succeed, others fail/deny) is surfaced; per §12.13 this must land in the **error-preserving** state (retry without re-marking everyone), not silently drop the failed rows.
- **Default status: Present, mark exceptions.** Every student in the roster starts as Present when the screen loads (for a date with no existing `attendance` rows); the teacher only taps to flip absentees. For a date that already has `attendance` rows (re-opening a submitted date, or the past-date-correction path above), the screen loads each student's **existing** stored status instead of resetting to Present — "default Present" only applies to genuinely unmarked rows.
- **RPC/schema gap — resolved by ADR-0030:** `get_class_roster_for_staff(p_class_id)` returns `setof students` (id, family_id, first_name, last_name, grade_level, external_member_id, user_id, created_at) — it does **not** return `enrollment_id`, and `mark_attendance_for_staff` requires `p_enrollment_id` with no `attendance` row to join through on an unmarked date. **Resolution (ADR-0030):** the client reads `enrollments` directly (`select id, student_id from enrollments where class_id = <scope_id> and status = 'active'`) using the existing `enrollments_teacher_select` RLS policy and existing `select` grant — `enrollments` is outside ADR-0019's minors'-data table set, so this is not a new access pattern, and no migration is needed. `/design` correlates this read with `get_class_roster_for_staff`'s output by `student_id` to build the roster-row → `enrollment_id` map. Neither `get_class_roster_for_staff` nor `mark_attendance_for_staff` changes.
- **Status values are fixed to the existing schema:** `attendance.status` is `check (status in ('present','absent'))` — no `late`/`excused`/other values exist today. This screen is scoped to a binary present/absent toggle; adding more granular statuses would be a schema change and is out of scope for this item.

### Acceptance criteria
1. **Roster list** for the teacher's own class (scope-derived from JWT `scope_id`, per `get_class_roster_for_staff`) renders one row per actively-enrolled student, each with a Present/Absent toggle.
2. **Date selector** defaults to the current/today class meeting date; teacher can navigate to a recent past date (range per `/design`) to view or correct that date's attendance.
3. **Pre-population:** opening a date with existing `attendance` rows loads each student's stored status; opening a date with none defaults every student to Present (per the decision above).
4. **Explicit Submit action** commits the currently-displayed statuses; on full success shows a clear confirmation (content state, §12.13).
5. **Partial/full failure on submit** (e.g. a denied RPC call because the teacher's scope no longer matches, or a transient network error) lands in the error-preserving state — the teacher's in-progress marks are not lost and can be retried without re-marking the whole roster from scratch.
6. **Own-class scope only, enforced server-side:** the UI never offers a class picker outside the teacher's own class; even if it did, `mark_attendance_for_staff`'s scope check (enrollment's `class_id = v_scope_id`) and `get_class_roster_for_staff`'s equivalent check make any other class's data unreachable (RLS/RPC is the real gate, per §12.1 — this AC is about the UI not attempting to offer something the backend would deny).
7. **All four DoD states** (§12.13) are drawn: loading while roster/attendance fetch is in flight, empty state if the class has zero active enrollments, error-preserving on fetch or submit failure, content once loaded/submitted.
8. **No client-side write to `attendance` outside the RPC** — every write goes through `mark_attendance_for_staff`, per ADR-0021 Consequences (direct `insert`/`update` grants are revoked at the DB level, so this is also enforced server-side, not just a code-review convention).

### Edge cases
- **Date with no existing attendance rows** — default-Present pre-population (decision above), not a blank/unmarked state.
- **Re-opening an already-submitted date** — loads stored statuses, not defaults; submitting again is a correction (upsert), matching ADR-0021's update branch.
- **Roster changes between load and submit** (e.g. a student withdrawn mid-session) — `/design` should decide whether a stale roster row still submits (RPC will simply also succeed/fail per its own enrollment lookup) or is refetched; not a business-rule question, deferred to `/design`.
- **Zero active enrollments in the class** — dedicated empty state, not an error (mirrors `client-auth-session-and-nav`'s zero-role precedent).
- **Denied RPC call** (scope mismatch — e.g. teacher's active role/class changed mid-session via a role switch in another tab) — surfaces as the error-preserving state per AC#5, not a silent no-op; the RPC itself returns `null` on denial rather than throwing, so the client must explicitly check for that and treat it as a failure, not a successful no-op.
- **Enrollment-id gap** (see decision above) — resolved by ADR-0030 (direct `enrollments` read, correlated client-side by `student_id`); `/design` implements the two-read/join shape, not a roster RPC change.

### Priority
**POC-core** (per issue #20 and doc 2 §2 Teacher). Previously blocked by `client-auth-session-and-nav` (#17) — that item is now Built (client auth session + role-derived nav shell landed, PR #30), so this item is unblocked and startable.

### Consumers (cross-persona)
Teacher is the sole direct actor. Coordinator/BV Coordinator/Admin consume the resulting `attendance` rows indirectly through their own compliance-dashboard reads (`get_class_attendance_for_staff` and org/session rollups) — this item does not build any of those dashboards, it only produces the data they read.

### Access scope (§5.4)
**Teacher = class scope**, enforced server-side by `mark_attendance_for_staff` and `get_class_roster_for_staff`'s own scope checks (JWT `scope_id` = the teacher's `class_id`) — this item's UI is not itself an access-control layer, per §12.1.

### Explicitly out of scope (so a later item picks it up)
- **Compliance dashboards** (Coordinator/BV Coordinator/Admin rollups reading this same data) — separate persona items.
- **Absence reporting to coordinator** (date/reason/notes) — a distinct doc 2 Teacher POC-core item, not part of "mark & submit attendance."
- **Attendance statistics/percentages** shown to Student/Parent — separate items (doc 2 Student/Parent "attendance stats").
- **New attendance status values** (e.g. late/excused) — would require an `attendance.status` check-constraint change; not requested by doc 2 for the POC.
- **Roster management** (add/remove/withdraw enrollments) — separate doc 2 Coordinator "roster management" item; this screen only reads active enrollments.

---

## Design (detailed spec)

> **Stage:** 1 — Design ✓ → human sign-off ✓ (2026-07-24) → `/plan` ✓ → held pending ADR-0031 → **Design revision ✓ (ADR-0031, 2026-07-24) → human sign-off ✓ (2026-07-24):** `sessions.day_of_week`/`start_time`/`end_time` are now migrated, seeded, and pgTAP-covered (`supabase/migrations/20260724120000_session_weekly_schedule_fields.sql`, `supabase/tests/160_session_weekly_schedule.sql`, `core-schema-and-rls.md` amended) — the date-default and date-nav step logic below are revised accordingly. Next: a `/plan` sync pass (this doc's plan-facing pseudocode changed; `attendance-ui.plan.md`'s F5/F6/F11 still show the superseded raw-`today`/±1-day version until that sync runs).
> **Design decisions captured this pass:**
> 1. **Date-navigation bound: current session only**, not a rolling N-day window. `sessions.start_date`/`end_date` already exist and Teacher already has a direct `select` on `sessions` (`sessions_teacher_select` RLS policy, scoped via `classes.session_id`) and on `classes` (`classes_teacher_select`) — reusing those existing plain-table reads avoids inventing an arbitrary "14 days" constant with no schema backing. The date nav clamps to `[session.start_date, min(today, session.end_date)]`; future dates are not selectable (nothing to mark yet). No migration — same zero-migration posture as ADR-0030.
>    - **Resolved by ADR-0031 (2026-07-24):** the clamp *range* is unchanged, but the **default `selectedDate`** is no longer raw `todayIso()` — it's "the most recent date on/before `min(today, session.end_date)` whose weekday matches `session.day_of_week`" (walk back 0–6 days from the capped today; if today itself matches, use today). Prev/Next now step by **±7 days**, not ±1 — real sessions (e.g. pilot target Frisco F3, Sundays only) have nothing to mark on the other six days, so a ±1-day stepper would let a teacher land on a dead date. `canGoPrev`/`canGoNext` change from a simple `selectedDate > min` / `< max` comparison to `selectedDate - 7 >= min` / `selectedDate + 7 <= max` — the *bound* check must account for the step size, or Prev/Next could step past `min`/`max` while still reporting `true`. See revised Behavior/pseudocode below.
>    - **Rare edge case, resolved defensively, not with new UI:** if a session's `start_date` falls after the most recent occurrence of its own `day_of_week` (i.e., the session has technically started but its first weekly meeting hasn't happened yet — only possible in the session's first partial week), the walk-back would land before `start_date`. In that case the default clamps to `start_date` itself even though it isn't a real meeting day, rather than introducing a new "no meeting yet" screen state. This is expected to be effectively unreachable for the pilot (Frisco F3 is an already-running session) and mirrors ADR-0031's own precedent of flagging residual scope (its holiday/skip-week note) instead of building for a case with no confirmed real occurrence.
> 2. **Submit concurrency: fire all visible rows' `mark_attendance_for_staff` calls concurrently** (`Promise.allSettled`), not sequentially — each call is an independent per-enrollment upsert with no ordering dependency, and the roster is small (one class). Every visible row is resubmitted on every Submit (the RPC's `on conflict ... do update` makes this idempotent) rather than diffing "changed since load," which would add local dirty-tracking for no behavioral difference.
> 3. **Partial-failure UX (AC#5, error-preserving state):** rows whose call **succeeds** flip to a read-only "saved" `StatusChip` (`present`/`absent`). Rows whose call **fails or returns `null`** (RPC's denial contract, per the refine-stage edge case) stay in their locally-marked, still-editable `SegmentedTabs` state with an inline `--danger`-toned note ("Couldn't save — retry"), matching the visual language `Field`'s error slot already establishes. The Submit button becomes **"Retry (N failed)"**, resubmitting only the still-failed subset — no re-marking the whole roster, satisfying AC#5 directly.
> 4. **Stale roster (refine's open edge case):** roster + enrollment-map + attendance-for-date are fetched once per date change or screen focus — no live/realtime refetch while the teacher is mid-marking, so in-progress local taps are never clobbered by a background update. A student withdrawn mid-session is not specially detected client-side: `mark_attendance_for_staff` only checks `enrollments.class_id = scope_id`, not `status`, so a stale row's call still succeeds or fails on the RPC's own terms — exactly the brief's "RPC will simply also succeed/fail per its own enrollment lookup" framing, no client special-case needed.
> 5. **No `bv-connect` component or screen exists for attendance-marking.** Checked both the local mirror (`design/sankalp/bv-connect/components/**`, `screens/{desktop,phone}`) and the live Chinmaya Mission Design System project via `DesignSync.list_files` — neither has an `attendance`/`classes`-domain component. The three `scraps/*-bv-attendance.png` images are early explorations of the **compliance-rollup dashboard** (Coordinator/BV/Admin "My class · 94.2% attendance today" card grid), which this item explicitly excludes (see Out of scope) — not the teacher's per-student marking screen. This screen is therefore composed from existing **core** primitives rather than matched against a pre-built domain screen, same precedent as `client-auth-session-and-nav`'s sign-in/switcher composition:
>    - `SegmentedTabs` (`core/SegmentedTabs.jsx`) repurposed **per roster row** as the Present/Absent toggle — its documented `value`/`onChange`/active-fills-with-ink behavior is exactly the tap-to-flip control the brief calls for; `StatusChip`'s `present`/`absent`/`info` statuses (already present in its documented status enum, `StatusChip.prompt.md`) are reserved for the **post-submit read-only "saved"** marker, since `StatusChip` is a passive `<span>` marker, not an interactive control (`StatusChip.jsx` has no `onClick`).
>    - `Card` (`tone="surface"`) as the per-student row container; `Button` (`variant="primary"`, `size="lg"`, `fullWidth`) as the single Submit CTA; a small ghost-`Button` pair (prev/next chevrons) either side of a date label for date nav — not `Stepper`, whose prompt scopes it to "attendee counts and quantities," not dates.
>    - `RoleBadge role="teacher" scope="<class name>"` in the header, matching the nav shell's existing context-chip pattern (`client-auth-session-and-nav.md`'s Design §UI).
>    - **Flagged, not blocking:** if this composition proves reusable beyond this one screen, a follow-up should propose it back into `bv-connect/components/attendance/` via `DesignSync.write_files` so later items (e.g. a Coordinator roster view) don't re-derive it. Not done in this pass — scope is this one screen.

### Behavior

**Screen mount.** `app/(tabs)/attendance.tsx` (currently a placeholder, `useRoleGuard("attendance")` already wired) replaces its body with the real screen. On mount and on every `selectedDate` change, `useAttendanceRoster(classId, selectedDate)` (new hook, `lib/attendance/`) runs four reads:
1. `supabase.rpc('get_class_roster_for_staff', { p_class_id: classId })` — student rows (id, first_name, last_name, grade_level).
2. `supabase.from('enrollments').select('id, student_id').eq('class_id', classId).eq('status', 'active')` — the ADR-0030 direct read; joined client-side by `student_id` to build `studentId → enrollmentId`.
3. `supabase.rpc('get_class_attendance_for_staff', { p_class_id: classId, p_date_from: selectedDate, p_date_to: selectedDate })` — existing `attendance` rows for the selected date, used to pre-populate; a student with no row in this result defaults to `present` (per refine's decision).
4. `supabase.from('classes').select('name, grade_band')` + `supabase.from('sessions').select('name, start_date, end_date, day_of_week, start_time, end_time')` (via the class's `session_id`) — both already Teacher-readable via existing RLS, used for the header label, the date-default/step logic (decision #1, ADR-0031), and the date-nav clamp bound. `day_of_week`/`start_time`/`end_time` are new columns (ADR-0031) on an already-selected row — no new read, no RLS change.

`classId` is the teacher's own JWT `scope_id` — never a user-supplied class id, matching AC#6.

**Local marking state.** Once all four reads resolve, a local `Record<enrollmentId, { status: 'present' | 'absent', saved: boolean, error: boolean }>` is seeded — `saved: true` and `status` from the fetched `attendance` row where one exists, else `status: 'present'`, `saved: false`. Tapping a row's `SegmentedTabs` only updates this local record (`saved` reset to `false`, `error` cleared) — no network call per tap, per the refine-stage "explicit Submit, not per-toggle autosave" decision.

**Submit.** Fires `mark_attendance_for_staff(p_enrollment_id, p_class_meeting_date: selectedDate, p_status)` for every visible row concurrently (decision #2). On settle: a fulfilled call with a non-null row → that row's `saved: true`, `error: false`; a fulfilled call returning `null` (RPC's denial no-throw contract) or a rejected promise (network/transient) → `saved: false`, `error: true`. If any row has `error: true` after the pass, the screen stays in the error-preserving state (decision #3) with the Submit button relabeled to retry only the failed subset; once every row is `saved: true`, the screen shows the content-state success confirmation (AC#4).

**Date default (revised, ADR-0031).** On mount, `selectedDate` initializes to `mostRecentSessionDate(session, today)`:
```typescript
function mostRecentSessionDate(session: { day_of_week: number; start_date: string; end_date: string }, today: string): string {
  const cappedToday = today < session.end_date ? today : session.end_date;
  const dow = isoWeekday(cappedToday); // 0=Sunday..6=Saturday, matching Postgres extract(dow from ...)
  const diff = (dow - session.day_of_week + 7) % 7; // days to walk back to the last matching weekday
  const candidate = addDaysIso(cappedToday, -diff);
  return candidate < session.start_date ? session.start_date : candidate; // rare pre-first-meeting clamp, decision #1
}
```
This replaces raw `todayIso()` as the hook's initial state and as what a date-nav "jump to today's session" affordance (if any) would resolve to.

**Date navigation (revised, ADR-0031).** Prev/next controls step `selectedDate` by **seven days** (the session's weekly cadence), not one — stepping by less would land on a weekday with nothing to mark. `computeDateBounds` (Stage 1, `dateBounds.ts`) changes its `canGoPrev`/`canGoNext` checks to account for the step size, not just the raw bound:
```typescript
canGoPrev: (selectedDate steps back 7 days) >= session.start_date
canGoNext: (selectedDate steps forward 7 days) <= min(today, session.end_date)
```
(A plain `selectedDate > min` check, as in the pre-ADR-0031 version, would let Prev/Next report `true` right up to the boundary and then step *past* `min`/`max` on the next tap — the check must look ahead by the full step, not just compare the current position.) Changing the date re-runs the mount sequence above (fresh reads, fresh local state) — in-flight local marks on the date being left are discarded, matching "no autosave" (a date switch mid-marking is an implicit navigate-away, not a submit).

### Data & RLS impact

**No migration required for this item** — confirmed by ADR-0030 for the `enrollments` read, and by the existing `classes_teacher_select` / `sessions_teacher_select` policies for the header/date-bound reads (both already scoped identically to `mark_attendance_for_staff`/`get_class_roster_for_staff`: `classes.id = scope_id` and, transitively, `sessions` via that class). ADR-0031's `sessions.day_of_week`/`start_time`/`end_time` columns landed as **its own** migration (`core-schema-and-rls` amendment, `supabase/migrations/20260724120000_session_weekly_schedule_fields.sql`, already applied) — this item just starts reading three more plain columns off a `sessions` row it already selects; no additional RLS/grant surface (confirmed by `supabase/tests/160_session_weekly_schedule.sql`'s teacher-scope assertion). This item itself still adds **zero new RLS policies, grants, or RPCs** — it is a pure client consumer of four existing read paths (2 RPC, 2 direct table reads) and one existing write RPC:

| Call | Kind | Existing scope check | Audited (`audit_log`) |
|---|---|---|---|
| `get_class_roster_for_staff(class_id)` | RPC (ADR-0019) | `p_class_id = scope_id` | Yes, per student row read |
| `enrollments` direct `select` | RLS (`enrollments_teacher_select`, ADR-0030) | `enrollments.class_id = scope_id` | No — `enrollments` outside ADR-0019's minors'-data table set |
| `get_class_attendance_for_staff(class_id, from, to)` | RPC (ADR-0019) | `p_class_id = scope_id` | Yes, per distinct student in range |
| `classes` direct `select` | RLS (`classes_teacher_select`) | `classes.id = scope_id` | No — non-minors'-data table |
| `sessions` direct `select` | RLS (`sessions_teacher_select`) | `exists(classes.session_id = sessions.id and classes.id = scope_id)` | No — non-minors'-data table |
| `mark_attendance_for_staff(enrollment_id, date, status)` | RPC (ADR-0021) | `enrollments.id = p_enrollment_id and enrollments.class_id = scope_id` | Yes, denial path only |

**`/build`'s adversarial RLS pass** (constitution #4) should confirm — likely already covered by `core-schema-and-rls`'s existing suite, per ADR-0030's own consequence — that a Teacher's `enrollments`/`classes`/`sessions` reads stay scoped to their own `class_id`/derived `session_id` and that an out-of-scope class/session id returns zero rows, not an error.

### API / new module surface (`lib/attendance/`)
- `useAttendanceRoster.ts` — the four-read fetch + local marking-state reducer described in Behavior above; exposes `{ status: 'loading'|'empty'|'error'|'content', rows, header, dateBounds, selectedDate, setSelectedDate, markLocal(enrollmentId, status), submit(), retryFailed() }`.
- `AttendanceRosterRow.tsx` — one row: student name/grade, `SegmentedTabs` (pre-submit) or `StatusChip` (post-submit saved), inline `--danger` retry note on `error`.
- `DateNav.tsx` — prev/next ghost-`Button` pair + date label, clamped per decision #1.

### File / route changes
- **Modified:** `app/(tabs)/attendance.tsx` (replace placeholder body with the real screen, keeping the existing `useRoleGuard("attendance")` call).
- **New:** `lib/attendance/{useAttendanceRoster,AttendanceRosterRow,DateNav}.ts(x)`.
- No migration file, no `netlify/functions/` change (all reads/writes are direct Supabase client calls with the anon key, per `.claude/rules/client-privacy.md` — no privileged/service-role operation here).

### UI
**Sankalp status:** no dedicated `bv-connect` reference exists for this screen (decision #5) — composed from `core/{SegmentedTabs,StatusChip,Card,Button,RoleBadge}` per the mapping above; not yet proposed back into the design-system mirror (flagged, not blocking).
- **Header:** `RoleBadge role="teacher" scope="<class name>"` + session context, matching the nav shell's existing chip pattern. Revised (ADR-0031): shows the session's weekday/time (e.g. "Sundays, 2:00–3:30 PM"), derived from `day_of_week`/`start_time`/`end_time`, instead of the prior raw `start_date`–`end_date` range — this is what tells the teacher why only every-seventh-day is navigable, reusing the same header slot rather than adding new UI surface.
- **Date nav:** prev/next `Button` (ghost, icon-only, ≥44px hit target per DoD) flanking the selected date (tabular numerics — it's a compared/steppable value). Each tap moves ±7 days (ADR-0031); disabled per the revised `canGoPrev`/`canGoNext` in Behavior above.
- **Roster rows:** one `Card` (`tone="surface"`) per active enrollment — student name/grade + `SegmentedTabs` (`present`/`absent`, local pre-submit state) or, once saved, a `StatusChip` in its place.
- **Submit:** one primary `Button` (`fullWidth`, `size="lg"`) — the screen's single primary action (design DoD: one primary per view); relabels to "Retry (N failed)" when any row errored.
- **Four states (design DoD, §12.13):**
  - *Loading* — while the four-read fetch is in flight (skeleton `Card` rows or a simple loading indicator).
  - *Empty* — zero active enrollments (AC#7/refine edge case): a dedicated `Card` message, no roster/Submit UI, mirroring `client-auth-session-and-nav`'s zero-role empty-state precedent rather than treating it as an error.
  - *Error-preserving* — either the initial fetch failed (retry re-runs all four reads) or a post-submit partial failure (decision #3: failed rows stay editable, "Retry (N failed)" resubmits only those).
  - *Content* — roster loaded and/or fully submitted; success confirmation shown once every row is `saved: true`.
- **No permission-denied state** — `classId` is always the teacher's own `scope_id`; there is no class-picker UI to mis-offer (AC#6).
- **≥44px touch targets:** `SegmentedTabs` options and date-nav buttons sized to the design system's existing pill/button minimums, already ≥44px in `core.card.html`'s reference.

### Edge cases (design detail)
- **Date with no existing attendance rows** — every row seeds `saved: false`, `status: 'present'` (Behavior above).
- **Re-opening an already-submitted date** — every row seeds from the fetched `attendance` row, `saved: true`; re-submitting is the same concurrent-`Promise.allSettled` path, hitting the RPC's `on conflict … do update` branch.
- **Roster changes between load and submit** — no live refetch (decision #4); a stale row's call succeeds/fails on the RPC's own terms, no client special-case.
- **Zero active enrollments** — dedicated empty state (UI above), not an error.
- **Denied RPC call** (`null` return, no throw) — treated as `error: true` on that row, not a silent no-op (decision #3), surfaced via the same error-preserving path as a thrown/network failure.
- **Enrollment-id gap** — resolved by ADR-0030's direct `enrollments` read, implemented in `useAttendanceRoster`'s step 2 (Behavior above).
- **Date-nav boundary (revised, ADR-0031)** — prev/next disabled once a further ±7-day step would cross `session.start_date` / `min(today, session.end_date)`; no case where an out-of-session or off-weekday date can be selected.
- **Session with no meeting yet this week (rare, ADR-0031)** — if the walk-back default would land before `session.start_date` (session started mid-week, before its first scheduled weekday), the default clamps to `start_date` itself rather than a real meeting date; not given dedicated UI (decision #1), expected unreachable for the pilot's single already-running target session.

### Out of scope (confirmed, unchanged from refine)
- Compliance dashboards (Coordinator/BV Coordinator/Admin rollups) — separate persona items; the `scraps/*-bv-attendance.png` mockups referenced in decision #5 belong to that later item, not this one.
- Absence reporting to coordinator (date/reason/notes), attendance statistics for Student/Parent, new `attendance.status` values, roster management — unchanged from refine.
- Proposing the row-level Present/Absent composition back into `bv-connect/components/attendance/` (decision #5's flagged follow-up) — not done this pass.

---

## Sign-off
- [x] **Human sign-off on this design** (project owner, 2026-07-24) → ready for **`/plan`**.
- [x] **Human sign-off on the ADR-0031 design revision** (project owner, 2026-07-24 — date-default walk-back + ±7-day step logic, header weekday/time display) → ready for **`/plan` sync pass** (updates `attendance-ui.plan.md`'s F5/F6/F11 to match).

---

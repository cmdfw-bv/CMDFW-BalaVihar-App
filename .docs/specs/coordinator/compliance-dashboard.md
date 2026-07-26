# Coordinator — compliance dashboard

> **owner:** Coordinator · **consumers:** Coordinator (own session only, this pass — BV Coordinator's separate `org-wide-metrics` POC-core item may follow a similar shape later but does not consume this spec) · **scope:** Coordinator = session (all classes in own session; RPC + RLS enforced per ADR-0019, no direct table reads) · **governing ADR:** ADR-0030 (`class_updates` — System-owned, not Coordinator-owned or Teacher-gated), ADR-0031 (`class_meetings` calendar — System-owned source of truth for expected meeting dates) · **covers:** doc 2 (Coordinator POC-core: "compliance dashboard (per-class attendance + update tracking)"); doc 1 §2/§5; issue #23

**Stage:** `/refine` ✓ → `/architect` ✓ (ADR-0030, ADR-0031) → `/design` ✓ → `/plan` ✓ ([compliance-dashboard.plan.md](compliance-dashboard.plan.md); coordinated schema addendum plan in `core-schema-and-rls.plan.md` Tasks 12–14) → `/migration` ✓ (2026-07-24 — schema/RLS/RPC side landed via `core-schema-and-rls.plan.md` Tasks 12–14; this item's own client-side Tasks 1–11 are unaffected/unbuilt) → next is `/build`.

---

## Requirements (refined)

### User story
As a Coordinator, I want a live, session-scoped compliance dashboard showing per-class attendance-submission and class-update-posting rates over a trailing window, so that I can quickly see which classes in my session are falling behind and follow up with the right teacher — without seeing any other session's data or any individual student's record.

### Decisions captured during refine (human-confirmed)
- **Rolling-window compliance rate, not a single-day snapshot.** Each class gets a 0–100% compliance figure over a trailing window (default: the session's last 4 scheduled class-meeting dates), rendered via `ComplianceBar` (tone auto-derives: ≥85 success / ≥70 warning / <70 danger). This matches the existing `get_class_attendance_for_staff(p_class_id, p_date_from, p_date_to)` RPC, which already takes a date range — no new query shape needed for the attendance half.
- **Both attendance and class-update tracking are in scope for this brief**, even though no `class_updates`-style table exists yet and Teacher's "post class update" item (doc 2) hasn't been refined. This item is written as the first consumer of that not-yet-existing data and explicitly flags the cross-persona dependency for `/architect` to resolve (see "Open dependency" below) rather than silently assuming a schema shape.

### Acceptance criteria
1. **Session-scoped rows only.** The dashboard lists exactly the classes in the coordinator's own session (their active role's `scope_type='session', scope_id=<session>`). Classes in any other session — including sibling sessions at the same center — never appear. Enforced by RLS/RPC scope, not client-side filtering (§5.4, ADR-0019).
2. **Two compliance metrics per class**, each a `ComplianceBar`-style 0–100% figure over the trailing window:
   - **Attendance-submission rate** — reuses the existing `attendance` table + `get_class_attendance_for_staff` RPC.
   - **Class-update-posting rate** — whether the class's teacher posted a class update for each expected date in the window (schema owner TBD — see Open dependency).
3. **"Submitted" definition for attendance (this item's contribution to the metric, not a schema change):** a class-meeting date counts as submitted only if attendance rows exist for **all** currently-active enrollments in that class for that date, not just some. Partial submissions (rows for only some students) count as *not* submitted for this metric — see Edge cases for why.
4. **Summary roll-up.** A top-of-screen stat-tile row (`StatTile`) shows, across the whole session: count of classes fully compliant (both metrics ≥85%), at-risk (either metric 70–84%), and non-compliant (either metric <70%).
5. **Honest empty state, not a false zero.** A class with no enrollments, or no scheduled class-meeting dates yet inside the window, renders an honest **"—" placeholder** for that metric (per `CenterRollupRow`'s documented placeholder pattern) — never a `0%` that would misread as "class failed to submit."
6. **Read-only.** No write/edit affordance anywhere on this screen. Marking attendance and posting class updates remain exclusively Teacher-owned actions on Teacher's own screens; this dashboard only reads and aggregates.
7. **Refresh model: poll-on-focus**, matching the architecture's feed pattern (doc 3 §2) — not a Realtime broadcast subscription (Realtime is reserved for chat, doc 3 §9). "Live" in doc 1 §5 means "current when you look at it," not push-updated.
8. **No student-level data leaves this screen.** The dashboard shows class-level aggregates only — no per-student names, rows, or attendance status. Coordinator has no direct `SELECT` on `attendance`/`students` (ADR-0019); every read this screen performs goes through an RPC that scope-checks and writes an `audit_log` row, same as every other staff-facing screen. This item introduces no new audit-bypass path.
9. **Multi-session Coordinators see one session at a time.** A Coordinator account holding more than one session-scoped Coordinator role (multi-persona, doc 2 §2) sees only the currently active role's session on this screen. Switching sessions is the existing active-role switch (§5.3) — this screen has no separate session picker.

### Architect review — resolved (ADR-0030, ADR-0031)
- **`class_updates` ownership.** Resolved by **ADR-0030**: System owns `class_updates` (schema addendum to `core-schema-and-rls.md`), not this item, and this item does not wait on Teacher's unrefined "post class update" item. Both this item's read (compliance-dashboard) and Teacher's future write path (once refined) are consumers of a System-owned table/RPC pair, matching the existing `attendance` pattern (ADR-0019/ADR-0021) rather than the illustrative single-owner example in §12.12.
- **Expected-meeting-date source of truth (found during `/architect` review, not originally flagged in refine).** A class-meeting-date window with zero `attendance` rows was previously indistinguishable between "no meeting scheduled" (AC5's honest `—`) and "meeting happened, nothing submitted" (full non-compliance — the case this dashboard exists to catch). Resolved by **ADR-0031**: a new System-owned `class_meetings` calendar (generated from `sessions.meeting_weekday` + `sessions.start_date`/`end_date`, skip weeks applied via the existing CSV-import seam per ADR-0022) becomes the sole source of truth for "expected" dates for both metrics.
- **`get_class_attendance_for_staff` is a per-class RPC; this dashboard is session-wide.** Not architecturally significant on its own (no new access pattern), but resolved in the same direction as ADR-0031's data-layer work: `/design` specifies one new session-scoped aggregate RPC (querying `class_meetings` + `attendance` +, once it exists, `class_updates` together) rather than N per-class client calls.

`/design` for this item must coordinate the System-side schema addendum to `core-schema-and-rls.md` (new `class_meetings` table, new `sessions.meeting_weekday` column, and — cross-referencing ADR-0030 — the minimal `class_updates` table) alongside its own detailed data/RLS section; these are additive addenda to an already-built spec (mirrors the ADR-0021 addendum precedent), not a new System item.

### Edge cases
- **Partial attendance submission** (attendance rows exist for some but not all currently-active enrollments in a class on a given date) counts as "not submitted" for the rate calculation (AC 3) — otherwise a teacher who marked 2 of 25 students would read as fully compliant, defeating the dashboard's purpose.
- **New class, no meetings yet in the window** → "—" placeholder (AC 5), never `0%`.
- **Mid-window roster change** (a student enrolls or withdraws partway through the trailing window) — the "expected" denominator for a given date must use the enrollment state **as of that date**, not the currently-active roster, so a class isn't retroactively penalized or credited for roster changes that happened after the fact. **Resolved at `/design` (human-confirmed, current-roster approximation):** `enrollments` has no withdrawal timestamp, only current `status` + `enrolled_at` — so a **new** enrollment mid-window is handled precisely (excluded from expected dates before its `enrolled_at`), but a **withdrawn** student cannot be precisely placed in time and is excluded from the *entire* trailing window, not just the dates after their actual withdrawal. This is a deliberate lenient approximation (it can only make a class's rate look as good or better than reality, never worse) rather than a speculative new `enrollments.status_changed_at` column — revisit only if it surfaces as a real pilot problem (mirrors ADR-0018's precedent for deferring unmodeled roster complexity).
- **A scheduled meeting date with zero expected enrollments** (e.g. a class created after the window's earlier dates, so no student was active-as-of that date) is excluded from the attendance-submission denominator entirely for that date — a class can't be penalized or credited for a date nobody was expected to attend. It still counts toward the update-posting denominator (that metric never depends on roster).
- **Multi-session Coordinator** — see AC 9; no picker, active-role switch only.
- **Coordinator's own session has zero classes** (edge of pilot data) — screen shows the empty state (design-system DoD: "draw all four states," §design-system rule), not a blank screen.

### Priority
**POC-core**, per doc 2 (Coordinator persona) and issue #23.

### Consumers
Coordinator only, this pass (own session). No other persona consumes this spec directly.

### Access scope
Coordinator = session — all classes in the coordinator's own session; every data read goes through RPC + RLS scope checks (ADR-0019), consistent with `core-schema-and-rls`'s existing staff-read pattern. No direct table access, no client-side scope filtering.

---

## Design

### Behavior
On screen focus (mount or tab/window refocus — not Realtime, AC7), the client calls the new session-scoped RPC `get_session_compliance_for_staff(p_session_id, p_window_size default 4)` once, with the Coordinator's active-role session as `p_session_id`. The RPC returns one row per class in the session: `class_id`, `class_name`, `enrolled_count`, `window_start`/`window_end`, `attendance_rate`, `update_rate` (the latter two nullable — `null` renders as the AC5 "—" placeholder, never `0`). The client does no aggregation of its own; the RPC is the single source of both the per-class figures and the roll-up counts (fully-compliant / at-risk / non-compliant, AC4), computed client-side from the returned rates using the same ≥85/≥70/<70 thresholds `ComplianceBar` uses for tone.

### Data & RLS impact
This item requires a small, additive schema addendum to the System-owned `core-schema-and-rls.md` (per ADR-0030/ADR-0031's consequences), coordinated here and specified in full in that file's new **"Design addendum — ADR-0030 → ADR-0031"** section:
- `sessions.meeting_weekday` (new column) and `class_meetings` (new table, System-owned, ADR-0031) — the session's expected-meeting calendar.
- `class_updates` (new table, System-owned, ADR-0030) — minimum shape (`class_id`, `meeting_date`, `posted_by`, `posted_at`); Teacher's write path is a future consumer, not built this pass.
- A new `SECURITY DEFINER` RPC, `get_session_compliance_for_staff`, is this dashboard's **only** data-access path — no direct client `SELECT` on `class_meetings`/`class_updates`/`attendance`/`enrollments` (matches ADR-0019's existing staff-read posture). Scope-checked against the caller's active role (`coordinator` + `scope_id = p_session_id`, or org-scoped `bv_coordinator`/`admin` for the future org-wide-metrics item); a denied call logs one `audit_log` row (`action='denied', target_table='sessions'`) and a successful call logs exactly **one** `audit_log` row (`action='read', target_table='attendance'`) per call — one row per call, not per underlying student/attendance row, since this RPC never returns student-identifying data (a deliberate, documented deviation from the per-row audit granularity `get_class_attendance_for_staff` uses, justified by AC8 — no student-level data ever crosses this boundary).
- **Roster approximation (human-confirmed this pass):** the attendance-submission rate's per-date "expected" roster uses `enrollments.status='active' and enrolled_at <= meeting_date` — precise for new enrollments, an accepted lenient approximation for withdrawals (see Edge cases). No new column added to `enrollments`.
- Full RPC SQL, RLS posture for the two new tables, and the generation mechanism for `class_meetings` are specified in `core-schema-and-rls.md`'s addendum — cross-reference, not duplicated here.

### UI
No new component is needed — the screen composes entirely from three already-ported Sankalp components, matching the design mirror's own composition pattern in `design/sankalp/bv-connect/screens/desktop/dash.jsx` (its "Compliance" card stacks multiple `ComplianceBar` rows in one card; this screen repeats that pattern once per class instead of once per metric-category):
- `design/sankalp/components/core/StatTile.jsx` — the top summary row (AC4): three tiles, **Fully compliant / At-risk / Non-compliant**, plain mono value (not `display`, matching `dash.jsx`'s own stat-row usage, not the large-serif hero variant).
- `design/sankalp/bv-connect/components/dashboard/ComplianceBar.jsx` — two per class, inside one card per class: **"Attendance submission"** (`value=attendance_rate`) and **"Class updates posted"** (`value=update_rate`). Tone auto-derives (≥85/≥70/<70) — no explicit `status` override needed. **`note` is a date-range** (e.g. "Jan 11 – Jan 18"), not an "x of n meetings" count as originally sketched here — the RPC returns only `window_start`/`window_end`, not a meeting count, and inventing one client-side would violate AC5's honest-placeholder principle applied to copy, not just figures (as-built: `ComplianceDashboardScreen.tsx`'s `formatWindowNote`). `enrolled_count` (also returned by the RPC) renders as a small muted caption under the class name, matching `CenterRollupRow`'s marked/enrolled caption precedent.
- `design/sankalp/bv-connect/components/dashboard/CenterRollupRow.jsx` — not reused as a component (its single-metric/single-bar shape can't carry two independent rates), but its **honest-placeholder visual language** (mono `—` in `ink-4`, no invented figure) is the pattern this screen's per-metric `null` handling follows: when `attendance_rate` is `null`, that `ComplianceBar` slot is replaced with a `—` line in the same style, not rendered with `value=0`; likewise for `update_rate`.
- Screen chrome (sidebar/nav/top bar/context chip) reuses the existing role-derived nav shell (ADR-0014, already built in `client-auth-session-and-nav`) — this item adds one screen behind Coordinator's existing dashboard nav entry, not new chrome. Per AC9, no session picker on this screen; single-role Coordinators show the existing static context chip ("Coordinator · <Session name>"), multi-role accounts show the existing active-role switcher.
- **Four states (design-system DoD):** *loading* — skeleton cards in place of per-class cards; *empty* — "No classes in this session yet" (edge case, zero classes); *error-preserving* — a poll-on-focus failure keeps the last-good render with an inline error banner, never a blank screen; *content* — as above.
- Breakpoints 360/768/1024/1440, ≥44px touch targets, tabular numerics — inherited for free from the three reused components (already Sankalp-DoD-compliant).
- `dash.jsx`'s "Export report" button and its consent-rate `ComplianceBar` are **not** part of this screen (see Out of scope) — the reference file is used for its layout/composition pattern only, not ported wholesale.

### Out of scope
- **Report/CSV export affordance** shown in the `dash.jsx` reference screen — no export requirement in this brief's ACs; would also need a new Netlify function (trusted-server boundary) not scoped here.
- **Consent-on-file metric** shown in the `dash.jsx` reference screen — not one of this dashboard's two metrics (AC2); belongs to a different item if ever built.
- **Teacher's `class_updates` write RPC** (ADR-0030) — not built this pass; this item is read-only (AC6).
- **Manual per-date `class_meetings` edit UI** (ADR-0031) — cancellations enter only via the CSV skip-dates seam.
- **Retrofitting `mark_attendance_for_staff` to validate against `class_meetings`** (ADR-0031, explicitly out of scope there).
- **Session/class-creation UI** (Admin, unrefined backlog item) — `sessions.meeting_weekday` is set via seed/migration for POC; `generate_class_meetings_for_session` is written to also serve that future item without a rewrite.
- **Precise historical roster reconstruction** for withdrawn students — accepted approximation, see Edge cases; no `enrollments.status_changed_at` column added.
- **BV Coordinator's org-wide-metrics item** — a separate, not-yet-refined item; may reuse this shape later but doesn't consume this spec (see header).

---

## Sign-off
- [ ] Human sign-off on this refined brief → ready for **`/architect`**.
- [x] **Human sign-off on this architect review** (2026-07-24, mehta.maulik@gmail.com) — ADR-0030 (`class_updates`, System-owned) and ADR-0031 (`class_meetings` calendar, System-owned) confirmed → ready for **`/design`**.
- [x] **Human sign-off on this design** (2026-07-24, mehta.maulik@gmail.com) — incl. the coordinated `core-schema-and-rls.md`/`csv-enrollment-import.md` addenda → ready for **`/plan`**.
- [x] **`/build` complete, all 11 tasks** (2026-07-24) — [compliance-dashboard.plan.md](compliance-dashboard.plan.md)'s automated tasks (unit tests, screen composition, role-branch wiring) built, `npm run test`/`lint`/`typecheck` all clean; Task 11's manual checklist verified via a scripted Playwright/Chromium pass against the running dev server + local Supabase (real magic-link sign-in, real RPC calls, injected network failures, all four states, all four breakpoints, role-guard regression) → ready for **`/test`**.

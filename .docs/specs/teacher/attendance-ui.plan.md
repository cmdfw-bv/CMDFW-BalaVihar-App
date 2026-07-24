# Plan — Teacher: attendance-ui

> Spec: [attendance-ui.md](attendance-ui.md) · ADR-0019, ADR-0021, ADR-0030, ADR-0031 (all Closed, unchanged) · stage: `/plan` sync ✓ → `/migration` ✓ → `/build` ✓ (2026-07-24) → `/test` → `/deploy-staging` → `/promote`
>
> **`/plan` sync pass (2026-07-24):** ADR-0031 landed — `sessions.day_of_week`/`start_time`/`end_time` are migrated (`supabase/migrations/20260724120000_session_weekly_schedule_fields.sql`), seeded, and pgTAP-covered (`supabase/tests/160_session_weekly_schedule.sql`), and `attendance-ui.md`'s Design section was revised + signed off accordingly (2026-07-24). This pass brings Stage 1 (`dateBounds.ts`/F5–F6) and Stage 2 (`useAttendanceRoster.ts`/F11) — plus Stage 3's F13/F14 descriptions — in line with the revised walk-back date-default and ±7-day step logic below. No other stage changed: Stage 0 (RLS confirmation), `rosterMap.ts`/`seedMarks.ts`/`submitResults.ts`/`viewState.ts` (F1–F4, F7–F10), F12 (`AttendanceRosterRow.tsx`), and Stage 4 are unaffected by ADR-0031 and are unchanged from the prior pass.

## Shared seam

**This item still has no migration of its own** (ADR-0030's zero-migration posture, confirmed by inspection of `supabase/migrations/`: `enrollments_teacher_select`, `classes_teacher_select`, `sessions_teacher_select` all already exist and are already scoped identically to `mark_attendance_for_staff`/`get_class_roster_for_staff`). ADR-0031's three new `sessions` columns landed as their **own**, already-applied migration (`20260724120000_session_weekly_schedule_fields.sql`) under `core-schema-and-rls`'s ownership, not this item's — this item only starts reading three more plain columns off a `sessions` row it already selects, via existing RLS. So there is still no schema/RLS stage to serialize ahead of app code for *this* item — `/migration` for this item remains a pass-through to confirm that, not a new migration file.

**One coverage gap found, not assumed from the spec:** `supabase/tests/010_operational_core_rls.sql` (plan(14)) asserts teacher-scoped `enrollments`/`classes` reads (lines 73–80) but has **no assertion for `sessions`**, even though ADR-0030 and the Design spec's "Data & RLS impact" table both claim the teacher-scoped `sessions` read (used for the date-nav clamp bound) is "likely already covered." It isn't, quite — Stage 0 below closes that gap with two new assertions in the existing file before any client code is written, per constitution #4 (RLS gets adversarial role × scope tests before promotion) and the spec's own line 100 ("`/build`'s adversarial RLS pass... should confirm"). This is a **confirmation test**, not a RED→GREEN cycle — the policy already exists and is expected to pass immediately; it exists so the claim is asserted in CI, not just written down in an ADR.

**TDD boundary (matching `client-auth-session-and-nav.plan.md`'s precedent — no React/RN component-test harness in this repo, `vitest.config.ts` covers `lib/**/__tests__` etc. only):** everything that is a plain function — the roster/enrollment join, mark-state seeding, date-bounds clamp, and submit-result reduction — gets a RED→GREEN vitest unit test (Stage 1). The **hook's live wiring** (`useAttendanceRoster`'s `useEffect`/`supabase.rpc`/`supabase.from` calls) and all **JSX** (`AttendanceRosterRow`, `DateNav`, the screen) are verified by hand at `/build` (`npm run dev`) and again at `/test` — not by a component unit test. This isn't a spec deviation (the public module surface in the Design spec's "API / new module surface" is unchanged) and isn't architecturally significant — no bounce to `/architect`.

**Branch:** current branch `mehtamaulik-creator/issue-20-teacher-attendance-ui`, cut from `main`. Single-owner, client-only item (no shared schema surface) — no worktree needed.

**Verify-at-build flag:** decision #3's partial-failure UX means the hook's exposed `status` (`'loading'|'empty'|'error'|'content'`) must **not** flip to `'error'` on a post-submit partial failure — only on the *initial* fetch failing. A post-submit failure stays `status: 'content'` with the affected rows' local `{ saved: false, error: true }` flags driving the inline retry note + "Retry (N failed)" button (Design spec §Submit). Stage 1's `deriveRosterViewState` (F5below) is deliberately scoped to the initial-fetch decision only, to keep this distinction explicit in code rather than re-deriving it ad hoc in the hook.

---

## Task list (ordered — TDD throughout)

### Stage 0 — RLS confirmation (no migration; precedes app code as the nominal "shared seam")

- [x] **RLS1 — extend `supabase/tests/010_operational_core_rls.sql`** with the missing teacher-scoped `sessions` assertions, using the file's existing fixtures (`v_teacher_a1` is already authenticated as `teacher`/`class`/`c1111111-...-0001`, whose `session_id` is `a1111111-...-0001`; the sibling class `c1111111-...-0002` sits in the sibling session `a1111111-...-0002`). Insert right after the existing "teacher sees only enrollments in their own class" assertion (line 80):
  ```sql
  select is(
    (select count(*) from sessions)::int, 1,
    'teacher sees exactly their own class''s session, via classes.session_id (date-nav clamp bound)'
  );
  select ok(
    not exists (select 1 from sessions where id = 'a1111111-0000-0000-0000-000000000002'::uuid),
    'teacher does not see the sibling session, even though it shares the same center'
  );
  ```
  Bump `select plan(14);` → `select plan(16);` at the top of the file.
- [x] **RLS2 — run `npm run db:reset`** and confirm the full suite (000–150, 999) passes, including the two new assertions. No new migration, no new policy — this only proves the existing `sessions_teacher_select` policy behaves as ADR-0030 assumed.

---

### Stage 1 — Pure logic modules, `lib/attendance/` (TDD, RED → GREEN)

All five modules are pure functions — no Supabase client, no React. Each gets a test file first.

- [x] **F0 — test harness**: `vitest.config.ts`'s `include` already covers `lib/**/__tests__/**/*.test.ts` (confirmed — no change needed, unlike the `client-auth-session-and-nav` plan which had to add this line).

#### `rosterMap.ts` — joins `get_class_roster_for_staff`'s student rows with the direct `enrollments` read by `student_id` (ADR-0030)

- [x] **F1 — tests (RED)** `lib/attendance/__tests__/rosterMap.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { joinRosterWithEnrollments } from '../rosterMap';

  const student = (over: Partial<{ id: string; first_name: string; last_name: string; grade_level: string }> = {}) => ({
    id: 's1', first_name: 'Ann', last_name: 'Iyer', grade_level: 'Grade3', ...over,
  });

  describe('joinRosterWithEnrollments', () => {
    it('joins a student to its active enrollment by student_id', () => {
      const rows = joinRosterWithEnrollments(
        [student({ id: 's1', first_name: 'Ann', last_name: 'Iyer' })],
        [{ id: 'e1', student_id: 's1' }],
      );
      expect(rows).toEqual([{ enrollmentId: 'e1', studentId: 's1', firstName: 'Ann', lastName: 'Iyer', gradeLevel: 'Grade3' }]);
    });

    it('sorts rows by last name then first name (deterministic render order)', () => {
      const rows = joinRosterWithEnrollments(
        [student({ id: 's1', first_name: 'Zed', last_name: 'Anand' }), student({ id: 's2', first_name: 'Amy', last_name: 'Zee' })],
        [{ id: 'e1', student_id: 's1' }, { id: 'e2', student_id: 's2' }],
      );
      expect(rows.map((r) => r.studentId)).toEqual(['s1', 's2']);
    });

    it('drops a roster student with no matching active enrollment (race between the two reads — e.g. mid-fetch withdrawal, decision #4)', () => {
      const rows = joinRosterWithEnrollments([student({ id: 's1' })], []);
      expect(rows).toEqual([]);
    });

    it('drops an enrollment with no matching roster student (defensive, same race)', () => {
      const rows = joinRosterWithEnrollments([], [{ id: 'e1', student_id: 's1' }]);
      expect(rows).toEqual([]);
    });

    it('returns [] for an empty roster (feeds the empty-state view)', () => {
      expect(joinRosterWithEnrollments([], [])).toEqual([]);
    });
  });
  ```

- [x] **F2 — implementation** `lib/attendance/rosterMap.ts`
  ```typescript
  export interface RosterStudent {
    id: string;
    first_name: string;
    last_name: string;
    grade_level: string;
  }

  export interface EnrollmentLink {
    id: string;
    student_id: string;
  }

  export interface RosterRow {
    enrollmentId: string;
    studentId: string;
    firstName: string;
    lastName: string;
    gradeLevel: string;
  }

  // The two reads (get_class_roster_for_staff RPC + direct enrollments select, ADR-0030) are not
  // transactional against each other — a student row with no matching enrollment (or vice versa)
  // is silently dropped rather than shown half-populated; per decision #4 this is the same
  // "stale roster tolerated, no client special-case" posture, just applied to the join itself.
  export function joinRosterWithEnrollments(students: RosterStudent[], enrollments: EnrollmentLink[]): RosterRow[] {
    const enrollmentByStudentId = new Map(enrollments.map((e) => [e.student_id, e.id]));
    const rows: RosterRow[] = [];
    for (const s of students) {
      const enrollmentId = enrollmentByStudentId.get(s.id);
      if (!enrollmentId) continue;
      rows.push({ enrollmentId, studentId: s.id, firstName: s.first_name, lastName: s.last_name, gradeLevel: s.grade_level });
    }
    return rows.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }
  ```
  Run F1 → GREEN.

#### `seedMarks.ts` — pre-population (refine decision: default Present, mark exceptions)

- [x] **F3 — tests (RED)** `lib/attendance/__tests__/seedMarks.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { seedMarks } from '../seedMarks';
  import type { RosterRow } from '../rosterMap';

  const rows: RosterRow[] = [
    { enrollmentId: 'e1', studentId: 's1', firstName: 'Ann', lastName: 'Iyer', gradeLevel: 'Grade3' },
    { enrollmentId: 'e2', studentId: 's2', firstName: 'Bob', lastName: 'Rao', gradeLevel: 'Grade3' },
  ];

  describe('seedMarks', () => {
    it('defaults every row to present/unsaved when there is no existing attendance row (AC#3)', () => {
      expect(seedMarks(rows, [])).toEqual({
        e1: { status: 'present', saved: false, error: false },
        e2: { status: 'present', saved: false, error: false },
      });
    });

    it('loads the stored status for a row with an existing attendance record, marked saved (re-opening a submitted date)', () => {
      const marks = seedMarks(rows, [{ enrollment_id: 'e1', status: 'absent' }]);
      expect(marks.e1).toEqual({ status: 'absent', saved: true, error: false });
      expect(marks.e2).toEqual({ status: 'present', saved: false, error: false }); // untouched row still defaults
    });

    it('ignores an attendance row whose enrollment_id is not in the current roster (defensive — stale join)', () => {
      const marks = seedMarks(rows, [{ enrollment_id: 'e-not-in-roster', status: 'absent' }]);
      expect(Object.keys(marks)).toEqual(['e1', 'e2']);
    });
  });
  ```

- [x] **F4 — implementation** `lib/attendance/seedMarks.ts`
  ```typescript
  import type { RosterRow } from './rosterMap';

  export interface AttendanceRecord {
    enrollment_id: string;
    status: 'present' | 'absent';
  }

  export interface MarkState {
    status: 'present' | 'absent';
    saved: boolean;
    error: boolean;
  }

  export type MarksByEnrollment = Record<string, MarkState>;

  // Refine decision: "default Present, mark exceptions" — a row seeds from its stored attendance
  // row when one exists (re-opening a submitted/corrected date), else defaults to present/unsaved.
  export function seedMarks(rows: RosterRow[], attendanceRows: AttendanceRecord[]): MarksByEnrollment {
    const statusByEnrollmentId = new Map(attendanceRows.map((a) => [a.enrollment_id, a.status]));
    const marks: MarksByEnrollment = {};
    for (const row of rows) {
      const stored = statusByEnrollmentId.get(row.enrollmentId);
      marks[row.enrollmentId] = stored
        ? { status: stored, saved: true, error: false }
        : { status: 'present', saved: false, error: false };
    }
    return marks;
  }
  ```
  Run F3 → GREEN.

#### `dateBounds.ts` — date-nav clamp + walk-back default (design decision #1, **revised by ADR-0031**: current session only, ±7-day weekly cadence)

- [x] **F5 — tests (RED)** `lib/attendance/__tests__/dateBounds.test.ts` — revised this pass: `computeDateBounds`'s `canGoPrev`/`canGoNext` now check a full ±7-day step against the bound (not a raw `selectedDate > min`/`< max` comparison, which would let Prev/Next report `true` right up to the boundary and then step past it), and a new `mostRecentSessionDate` covers the walk-back default (ADR-0031 Decision #2). **Also fixes a latent bug found while revising this function:** the prior version's `max` had no floor at `min`, so a not-yet-started session (today before `start_date`) computed `max < min` — the existing "session not started yet" test below already asserted the correct floored value, it just wouldn't have passed against the old implementation had it been run.
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { computeDateBounds, mostRecentSessionDate, addDaysIso } from '../dateBounds';

  const session = { start_date: '2026-06-01', end_date: '2026-08-01' };

  describe('computeDateBounds (±7-day step-aware, ADR-0031)', () => {
    it('canGoNext is false when stepping +7 from selectedDate would cross the clamped max', () => {
      // max clamps to today (2026-07-24); selectedDate + 7 = 2026-07-24 is not <= itself... use a date 3 days short
      const b = computeDateBounds(session, '2026-07-24', '2026-07-24');
      expect(b).toEqual({ min: '2026-06-01', max: '2026-07-24', canGoPrev: true, canGoNext: false });
    });

    it('canGoNext is true when selectedDate + 7 still lands on/before the clamped max', () => {
      const b = computeDateBounds(session, '2026-07-24', '2026-07-17');
      expect(b.canGoNext).toBe(true); // 2026-07-17 + 7 = 2026-07-24 <= max
    });

    it('canGoNext is false one day short of a full week before max, even though selectedDate < max (the bug a raw comparison would miss)', () => {
      const b = computeDateBounds(session, '2026-07-24', '2026-07-18');
      expect(b.canGoNext).toBe(false); // 2026-07-18 + 7 = 2026-07-25 > max=2026-07-24
    });

    it('clamps max to session.end_date when today is after the session has ended', () => {
      const b = computeDateBounds(session, '2026-09-01', '2026-08-01');
      expect(b.max).toBe('2026-08-01');
      expect(b.canGoNext).toBe(false);
    });

    it('canGoPrev is false when stepping -7 from selectedDate would cross session.start_date', () => {
      const b = computeDateBounds(session, '2026-07-24', '2026-06-01');
      expect(b.canGoPrev).toBe(false); // 2026-06-01 - 7 < start_date
    });

    it('canGoPrev is true when selectedDate - 7 still lands on/after session.start_date', () => {
      const b = computeDateBounds(session, '2026-07-24', '2026-06-08');
      expect(b.canGoPrev).toBe(true); // 2026-06-08 - 7 = 2026-06-01 >= start_date
    });

    it('a session that has not started yet (today before start_date) still returns a usable min/max, canGoPrev/Next both false at start', () => {
      const b = computeDateBounds(session, '2026-05-01', '2026-06-01');
      expect(b).toEqual({ min: '2026-06-01', max: '2026-06-01', canGoPrev: false, canGoNext: false });
    });
  });

  describe('mostRecentSessionDate (ADR-0031 walk-back default)', () => {
    const weeklySession = { day_of_week: 0, start_date: '2026-06-01', end_date: '2026-08-01' }; // Sunday

    it('returns today unchanged when today itself is the matching weekday', () => {
      expect(mostRecentSessionDate(weeklySession, '2026-07-19')).toBe('2026-07-19'); // a Sunday
    });

    it('walks back to the most recent matching weekday when today is not that weekday', () => {
      expect(mostRecentSessionDate(weeklySession, '2026-07-22')).toBe('2026-07-19'); // Wed -> prior Sunday
    });

    it('caps at session.end_date before walking back when today is after the session ended', () => {
      expect(mostRecentSessionDate(weeklySession, '2026-09-01')).toBe('2026-07-26'); // last Sunday on/before end_date
    });

    it('clamps to start_date in the rare case the walk-back lands before the session started (first partial week, decision #1 residual case)', () => {
      const midWeekStart = { day_of_week: 0, start_date: '2026-07-22', end_date: '2026-08-01' }; // starts Wed, meets Sundays
      expect(mostRecentSessionDate(midWeekStart, '2026-07-23')).toBe('2026-07-22'); // walk-back would hit 2026-07-19, before start_date
    });
  });

  describe('addDaysIso (helper)', () => {
    it('adds/subtracts days across a month boundary', () => {
      expect(addDaysIso('2026-07-30', 3)).toBe('2026-08-02');
      expect(addDaysIso('2026-08-02', -3)).toBe('2026-07-30');
    });
  });
  ```

- [x] **F6 — implementation** `lib/attendance/dateBounds.ts`
  ```typescript
  export interface SessionRange {
    start_date: string; // ISO yyyy-mm-dd
    end_date: string;
  }

  export interface WeeklySession extends SessionRange {
    day_of_week: number; // 0=Sunday..6=Saturday, matching Postgres extract(dow from ...) (ADR-0031)
  }

  export interface DateBounds {
    min: string;
    max: string;
    canGoPrev: boolean;
    canGoNext: boolean;
  }

  const STEP_DAYS = 7; // sessions meet on one fixed weekday (ADR-0031) — stepping by 1 would land on a dead date

  // ISO yyyy-mm-dd arithmetic via Date.UTC (never local timezone) so month/year rollovers are correct
  // without a date library.
  export function addDaysIso(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  export function isoWeekday(date: string): number {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sunday..6=Saturday
  }

  // ADR-0031 Decision #2: default selectedDate is no longer raw today — it's the most recent date
  // on/before min(today, session.end_date) whose weekday matches session.day_of_week (walk back 0-6
  // days). Rare residual case (decision #1's "first partial week" note): if the walk-back lands
  // before session.start_date, clamp to start_date itself rather than invent a new UI state.
  export function mostRecentSessionDate(session: WeeklySession, today: string): string {
    const cappedToday = today < session.end_date ? today : session.end_date;
    const diff = (isoWeekday(cappedToday) - session.day_of_week + 7) % 7;
    const candidate = addDaysIso(cappedToday, -diff);
    return candidate < session.start_date ? session.start_date : candidate;
  }

  // Design decision #1 (clamp) + ADR-0031 (±7-day step): canGoPrev/canGoNext must check the FULL
  // step against the bound, not just compare selectedDate's current position — otherwise Prev/Next
  // reports true right up to the boundary and then steps past min/max on the next tap.
  export function computeDateBounds(session: SessionRange, today: string, selectedDate: string): DateBounds {
    const min = session.start_date;
    const rawMax = today < session.end_date ? today : session.end_date;
    const max = rawMax < min ? min : rawMax; // floor: a not-yet-started session (today < start_date) must not report max < min
    return {
      min,
      max,
      canGoPrev: addDaysIso(selectedDate, -STEP_DAYS) >= min,
      canGoNext: addDaysIso(selectedDate, STEP_DAYS) <= max,
    };
  }
  ```
  Run F5 → GREEN.

#### `formatSchedule.ts` — new this pass (ADR-0031): renders the header's weekday/time label, replacing the prior raw `start_date`–`end_date` range display (Design spec §UI "Header")

- [x] **F6a — tests (RED)** `lib/attendance/__tests__/formatSchedule.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { formatSessionSchedule } from '../formatSchedule';

  describe('formatSessionSchedule', () => {
    it('formats a same-period range with a single AM/PM suffix (pilot target: Frisco F3, Sunday 2:00-3:30PM)', () => {
      expect(formatSessionSchedule({ day_of_week: 0, start_time: '14:00:00', end_time: '15:30:00' })).toBe('Sundays, 2:00–3:30 PM');
    });

    it('formats Saaket S4 (Friday 6:45-8:15PM)', () => {
      expect(formatSessionSchedule({ day_of_week: 5, start_time: '18:45:00', end_time: '20:15:00' })).toBe('Fridays, 6:45–8:15 PM');
    });

    it('shows both AM and PM suffixes when the range crosses noon', () => {
      expect(formatSessionSchedule({ day_of_week: 0, start_time: '11:00:00', end_time: '13:00:00' })).toBe('Sundays, 11:00 AM–1:00 PM');
    });

    it('formats a morning-only session (9:00-10:30AM)', () => {
      expect(formatSessionSchedule({ day_of_week: 0, start_time: '09:00:00', end_time: '10:30:00' })).toBe('Sundays, 9:00–10:30 AM');
    });
  });
  ```

- [x] **F6b — implementation** `lib/attendance/formatSchedule.ts`
  ```typescript
  export interface WeeklySchedule {
    day_of_week: number; // 0=Sunday..6=Saturday (ADR-0031, matches Postgres extract(dow from ...))
    start_time: string; // "HH:MM:SS", as returned for a Postgres `time` column
    end_time: string;
  }

  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function timeParts(time: string): { hour12: number; minute: number; period: 'AM' | 'PM' } {
    const [hStr, mStr] = time.split(':');
    const h = Number(hStr);
    const period: 'AM' | 'PM' = h < 12 ? 'AM' : 'PM';
    return { hour12: h % 12 === 0 ? 12 : h % 12, minute: Number(mStr), period };
  }

  function clock({ hour12, minute }: { hour12: number; minute: number }): string {
    return `${hour12}:${String(minute).padStart(2, '0')}`;
  }

  // Replaces the header's prior raw start_date-end_date display (ADR-0031): teachers need to know
  // WHICH weekday/time their session meets, not the enrollment-period range, since only that one
  // weekday is ever navigable (dateBounds.ts's ±7-day step). Single AM/PM suffix when both times
  // share a period (the common case, e.g. "2:00–3:30 PM"), both shown when the range crosses noon.
  export function formatSessionSchedule(session: WeeklySchedule): string {
    const start = timeParts(session.start_time);
    const end = timeParts(session.end_time);
    const startLabel = start.period === end.period ? clock(start) : `${clock(start)} ${start.period}`;
    return `${WEEKDAY_NAMES[session.day_of_week]}s, ${startLabel}–${clock(end)} ${end.period}`;
  }
  ```
  Run F6a → GREEN.

#### `submitResults.ts` — reduces `Promise.allSettled` outcomes into per-row saved/error flags (decisions #2/#3)

- [x] **F7 — tests (RED)** `lib/attendance/__tests__/submitResults.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { applySubmitResults } from '../submitResults';
  import type { MarksByEnrollment } from '../seedMarks';

  const baseMarks: MarksByEnrollment = {
    e1: { status: 'present', saved: false, error: false },
    e2: { status: 'absent', saved: false, error: false },
    e3: { status: 'present', saved: false, error: true }, // e.g. a previous failed attempt
  };

  describe('applySubmitResults', () => {
    it('a fulfilled call returning a row flips that row to saved/no-error', () => {
      const next = applySubmitResults(baseMarks, [
        { enrollmentId: 'e1', settled: { status: 'fulfilled', value: { status: 'present' } } },
      ]);
      expect(next.e1).toEqual({ status: 'present', saved: true, error: false });
    });

    it('a fulfilled call returning null (RPC denial contract, not a throw) is treated as a failure, not a silent no-op', () => {
      const next = applySubmitResults(baseMarks, [
        { enrollmentId: 'e2', settled: { status: 'fulfilled', value: null } },
      ]);
      expect(next.e2).toEqual({ status: 'absent', saved: false, error: true });
    });

    it('a rejected call (network/transient) is also treated as a failure', () => {
      const next = applySubmitResults(baseMarks, [
        { enrollmentId: 'e1', settled: { status: 'rejected', reason: new Error('network') } },
      ]);
      expect(next.e1).toEqual({ status: 'present', saved: false, error: true });
    });

    it('a successful retry clears a previously-failed row\'s error flag (Retry (N failed) path)', () => {
      const next = applySubmitResults(baseMarks, [
        { enrollmentId: 'e3', settled: { status: 'fulfilled', value: { status: 'present' } } },
      ]);
      expect(next.e3).toEqual({ status: 'present', saved: true, error: false });
    });

    it('rows not present in the results list are left untouched (retryFailed only resubmits the failed subset)', () => {
      const next = applySubmitResults(baseMarks, [
        { enrollmentId: 'e1', settled: { status: 'fulfilled', value: { status: 'present' } } },
      ]);
      expect(next.e2).toBe(baseMarks.e2);
      expect(next.e3).toBe(baseMarks.e3);
    });

    it('does not mutate the input record (pure)', () => {
      const before = JSON.stringify(baseMarks);
      applySubmitResults(baseMarks, [{ enrollmentId: 'e1', settled: { status: 'fulfilled', value: { status: 'present' } } }]);
      expect(JSON.stringify(baseMarks)).toBe(before);
    });
  });
  ```

- [x] **F8 — implementation** `lib/attendance/submitResults.ts`
  ```typescript
  import type { MarksByEnrollment } from './seedMarks';

  export interface SubmitResult {
    enrollmentId: string;
    settled: PromiseSettledResult<{ status: 'present' | 'absent' } | null>;
  }

  // Decision #2/#3: every visible row's mark_attendance_for_staff call is fired concurrently and
  // this reduces the Promise.allSettled output back onto the marks record. A fulfilled call with
  // a non-null row -> saved. A fulfilled call returning null (the RPC's no-throw denial contract,
  // per the refine-stage edge case) or a rejected promise -> error, never a silent no-op. Local
  // `status` (what the teacher tapped) is left as-is either way — only saved/error flip.
  export function applySubmitResults(marks: MarksByEnrollment, results: SubmitResult[]): MarksByEnrollment {
    const next = { ...marks };
    for (const { enrollmentId, settled } of results) {
      const current = next[enrollmentId];
      if (!current) continue;
      const ok = settled.status === 'fulfilled' && settled.value !== null;
      next[enrollmentId] = { ...current, saved: ok, error: !ok };
    }
    return next;
  }
  ```
  Run F7 → GREEN.

#### `viewState.ts` — hook-level screen status (initial-fetch only — see Shared seam's Verify-at-build flag)

- [x] **F9 — tests (RED)** `lib/attendance/__tests__/viewState.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { deriveRosterViewState } from '../viewState';

  describe('deriveRosterViewState', () => {
    it('loading while the initial fetch is in flight', () => {
      expect(deriveRosterViewState({ fetchStatus: 'loading', rosterRowCount: 0 })).toBe('loading');
    });
    it('error when the initial fetch failed, regardless of row count', () => {
      expect(deriveRosterViewState({ fetchStatus: 'error', rosterRowCount: 3 })).toBe('error');
    });
    it('empty when the fetch succeeded with zero active enrollments (AC#7)', () => {
      expect(deriveRosterViewState({ fetchStatus: 'ready', rosterRowCount: 0 })).toBe('empty');
    });
    it('content when the fetch succeeded with at least one row', () => {
      expect(deriveRosterViewState({ fetchStatus: 'ready', rosterRowCount: 1 })).toBe('content');
    });
  });
  ```

- [x] **F10 — implementation** `lib/attendance/viewState.ts`
  ```typescript
  export type FetchStatus = 'loading' | 'error' | 'ready';
  export type RosterViewState = 'loading' | 'empty' | 'error' | 'content';

  // Governs ONLY the initial four-read fetch (Behavior, Design spec). A post-submit partial
  // failure (decision #3) does NOT route through this function — it stays 'content' with the
  // affected rows' local { saved: false, error: true } flags carrying the error-preserving UX,
  // so a submit failure never regresses the whole screen back through this 'error' branch.
  export function deriveRosterViewState({ fetchStatus, rosterRowCount }: { fetchStatus: FetchStatus; rosterRowCount: number }): RosterViewState {
    if (fetchStatus === 'loading') return 'loading';
    if (fetchStatus === 'error') return 'error';
    return rosterRowCount === 0 ? 'empty' : 'content';
  }
  ```
  Run F9 → GREEN.

---

### Stage 2 — `useAttendanceRoster.ts` (wiring — hand-verified at `/build`, see Shared seam)

- [x] **F11 — implementation** `lib/attendance/useAttendanceRoster.ts`. Composes Stage 1's pure functions around the four reads + one write from the Design spec's "Behavior" section. **Revised this pass (ADR-0031):** the `sessions` read now selects `day_of_week`/`start_time`/`end_time` alongside the existing columns; the initial `selectedDate` comes from `mostRecentSessionDate` instead of raw `todayIso()`; `header` gains a `scheduleLabel` (via `formatSessionSchedule`, F6b) replacing the raw date-range display; and date nav is exposed as `goToPrevious`/`goToNext` (±7-day steps via `dateBounds.ts`'s `addDaysIso`) rather than a raw `setSelectedDate` a caller could misuse with an arbitrary date. Sketch (exact React-state shape is `/build`'s call — this fixes the data flow, not the file line-by-line):
  ```typescript
  import { useCallback, useEffect, useState } from 'react';
  import { supabase } from '../supabase';
  import { useSession } from '../auth/SessionProvider';
  import { joinRosterWithEnrollments, type RosterRow } from './rosterMap';
  import { seedMarks, type MarksByEnrollment } from './seedMarks';
  import { computeDateBounds, mostRecentSessionDate, addDaysIso, type DateBounds, type WeeklySession } from './dateBounds';
  import { formatSessionSchedule } from './formatSchedule';
  import { applySubmitResults } from './submitResults';
  import { deriveRosterViewState, type FetchStatus } from './viewState';

  function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  export function useAttendanceRoster(classId: string) {
    // Seeded lazily on first successful load (needs session.day_of_week) — see load() below;
    // '' is a transient placeholder never rendered (fetchStatus stays 'loading' until it's set.
    const [selectedDate, setSelectedDate] = useState('');
    const [fetchStatus, setFetchStatus] = useState<FetchStatus>('loading');
    const [rows, setRows] = useState<RosterRow[]>([]);
    const [marks, setMarks] = useState<MarksByEnrollment>({});
    const [header, setHeader] = useState<{ className: string; sessionName: string; scheduleLabel: string } | null>(null);
    const [session, setSession] = useState<WeeklySession | null>(null);
    const [dateBounds, setDateBounds] = useState<DateBounds | null>(null);

    const load = useCallback(async (dateOverride?: string) => {
      setFetchStatus('loading');
      try {
        const { data: classRow, error: e4 } = await supabase
          .from('classes').select('name, grade_band, session_id').eq('id', classId).single();
        if (e4 || !classRow) throw e4 ?? new Error('class not found');

        const { data: sessionRow, error: e5 } = await supabase
          .from('sessions')
          .select('name, start_date, end_date, day_of_week, start_time, end_time') // +3 cols, ADR-0031
          .eq('id', classRow.session_id)
          .single();
        if (e5 || !sessionRow) throw e5 ?? new Error('session not found');

        // ADR-0031: default is the walk-back match, not raw today; dateOverride carries an
        // already-known date across a goToPrevious/goToNext-triggered reload (see below).
        const targetDate = dateOverride ?? mostRecentSessionDate(sessionRow, todayIso());

        const [{ data: students, error: e1 }, { data: enrollments, error: e2 }, { data: attendance, error: e3 }] =
          await Promise.all([
            supabase.rpc('get_class_roster_for_staff', { p_class_id: classId }),
            supabase.from('enrollments').select('id, student_id').eq('class_id', classId).eq('status', 'active'),
            supabase.rpc('get_class_attendance_for_staff', { p_class_id: classId, p_date_from: targetDate, p_date_to: targetDate }),
          ]);
        if (e1 || e2 || e3) throw e1 ?? e2 ?? e3;

        const joined = joinRosterWithEnrollments(students ?? [], enrollments ?? []);
        setRows(joined);
        setMarks(seedMarks(joined, attendance ?? []));
        setHeader({ className: classRow.name, sessionName: sessionRow.name, scheduleLabel: formatSessionSchedule(sessionRow) });
        setSession(sessionRow);
        setSelectedDate(targetDate);
        setDateBounds(computeDateBounds(sessionRow, todayIso(), targetDate));
        setFetchStatus('ready');
      } catch {
        setFetchStatus('error');
      }
    }, [classId]);

    useEffect(() => { load(); }, [load]);

    const markLocal = useCallback((enrollmentId: string, status: 'present' | 'absent') => {
      setMarks((prev) => ({ ...prev, [enrollmentId]: { status, saved: false, error: false } }));
    }, []);

    // ±7-day steps (ADR-0031) — a date switch mid-marking discards in-flight local marks (Design
    // spec Behavior, "Date navigation"), so this re-runs the full load() rather than patching state.
    const goToPrevious = useCallback(() => { if (dateBounds?.canGoPrev) load(addDaysIso(selectedDate, -7)); }, [load, dateBounds, selectedDate]);
    const goToNext = useCallback(() => { if (dateBounds?.canGoNext) load(addDaysIso(selectedDate, 7)); }, [load, dateBounds, selectedDate]);

    async function submitRows(enrollmentIds: string[]) {
      const settled = await Promise.allSettled(
        enrollmentIds.map((id) =>
          supabase.rpc('mark_attendance_for_staff', {
            p_enrollment_id: id,
            p_class_meeting_date: selectedDate,
            p_status: marks[id].status,
          }).then(({ data, error }) => { if (error) throw error; return data; }),
        ),
      );
      setMarks((prev) => applySubmitResults(prev, enrollmentIds.map((enrollmentId, i) => ({ enrollmentId, settled: settled[i] }))));
    }

    const submit = useCallback(() => submitRows(rows.map((r) => r.enrollmentId)), [rows, marks, selectedDate]);
    const retryFailed = useCallback(
      () => submitRows(Object.entries(marks).filter(([, m]) => m.error).map(([id]) => id)),
      [marks, selectedDate],
    );

    return {
      status: deriveRosterViewState({ fetchStatus, rosterRowCount: rows.length }),
      rows,
      marks,
      header,
      dateBounds,
      selectedDate,
      goToPrevious,
      goToNext,
      markLocal,
      submit,
      retryFailed,
      retry: () => load(selectedDate || undefined), // initial-fetch retry (error state) — re-walks-back only if no date was ever established
    };
  }
  ```
  **Verify at `/build`:** run against a real local Supabase (`npm run db:start` + seeded fixtures) as a signed-in teacher — confirm all four DoD states render, a denied/failed submit surfaces per-row (not a full-screen error), the default date lands on the session's actual weekday (not raw today), and `goToPrevious`/`goToNext` step ±7 days and clamp correctly at both session boundaries. No unit test for this file itself (live Supabase client + React state — see Shared seam); its data-flow correctness is covered by Stage 1's pure-function tests (including F5/F6a's revised/new cases) plus this manual pass.

---

### Stage 3 — Presentational components (JSX — hand-verified at `/build`, composed from `components/core/*` per Design spec §UI)

- [x] **F12 — `lib/attendance/AttendanceRosterRow.tsx`**: one `Card` (`tone="surface"`) per roster row — student `firstName lastName · gradeLevel`; pre-submit (`!mark.saved`) renders `SegmentedTabs` with `tabs={['present','absent']}`, `value={mark.status}`, `onChange={(id) => markLocal(row.enrollmentId, id as 'present'|'absent')}`; post-submit (`mark.saved`) renders `StatusChip status={mark.status}` read-only in its place. When `mark.error`, keep the row in its editable `SegmentedTabs` state (never swap to `StatusChip`) and add an inline `--danger`-toned note ("Couldn't save — retry"), reusing `Field`'s reserved-hint-slot visual language (`theme.colors.status.absent`, per `Field.tsx`'s `hint` style) rather than inventing a new error-text style.
- [x] **F13 — `lib/attendance/DateNav.tsx`**: prev/next ghost `Button` (`variant="ghost"`, icon-only, `disabled` driven by `!dateBounds.canGoPrev` / `!dateBounds.canGoNext`, `onPress={goToPrevious}` / `onPress={goToNext}` — **revised, ADR-0031:** the component takes `goToPrevious`/`goToNext` callbacks from the hook, not a raw `setSelectedDate`, since each tap is a ±7-day step plus a refetch, not an arbitrary date write) flanking a tabular-numerics date label (`fontVariant: ['tabular-nums']`, per design-system rule).
- [x] **F14 — `app/(tabs)/attendance.tsx`**: replace the placeholder body, keeping `useRoleGuard("attendance")`. Reads `classId` from `useSession().scopeId` (never user-supplied, AC#6). Wires `useAttendanceRoster(classId)`'s `status` through `StateView` for `loading`/`empty`/`error` (initial-fetch only, per Stage 1's `deriveRosterViewState` boundary); `content` renders `RoleBadge role="teacher" scope={header.className}"` + a session context line showing `header.scheduleLabel` (**revised, ADR-0031:** e.g. "Sundays, 2:00–3:30 PM", replacing the prior raw `start_date`–`end_date` display — this is what tells the teacher why only every-seventh-day is navigable) + `DateNav` (wired to `goToPrevious`/`goToNext`/`dateBounds`) + one `AttendanceRosterRow` per row + a single primary `Button` (`fullWidth`, `size="lg"`) reading `submit`/label "Submit" normally, or `retryFailed`/label `` `Retry (${failedCount} failed)` `` when any row has `error: true`.
  **Verify at `/build`:** `npm run dev`, sign in as a teacher fixture, walk all four states + both boundary dates + a forced-denial retry (e.g. temporarily revoke the RPC grant or use an out-of-scope enrollment id) end-to-end; confirm ≥44px hit targets and no horizontal scroll at 360/768/1024/1440 per the design-system DoD.

---

### Stage 4 — Full-suite check

- [x] **F15** `npm test` (vitest) — Stage 1's six suites green (`rosterMap`, `seedMarks`, `dateBounds`, `formatSchedule` [new this pass], `submitResults`, `viewState`), nothing else regressed.
- [x] **F16** `npm run db:reset` (or `npx supabase test db`) — full pgTAP suite (000–150, 999, including Stage 0's two new assertions) green.
- [x] **F17** Manual `/build` walkthrough per F14's note, then hand off to `/test` for the AC-by-AC pass (playwright-cli or equivalent) before `/deploy-staging`.

---

## Out of scope (unchanged from Design)
Compliance dashboards, absence reporting, attendance statistics, new status values, roster management — see spec's "Out of scope" section. Proposing this row composition back into `bv-connect/components/attendance/` (Design decision #5's flagged follow-up) is also not part of this plan.

---

## Sign-off
- [x] Original plan (pre-ADR-0031) human sign-off — implicit in the item reaching held-for-ADR-0031 status; superseded by the sync below.
- [x] **Human sign-off on this `/plan` sync pass** (project owner, 2026-07-24 — F5/F6 revised, F6a/F6b added, F11/F13/F14 revised for the walk-back default + ±7-day step + schedule-label header; also fixes a pre-existing `computeDateBounds` floor-clamp bug caught while revising it) → ready for **`/migration`** (pass-through confirmation only, per Shared seam — no new migration file for this item).

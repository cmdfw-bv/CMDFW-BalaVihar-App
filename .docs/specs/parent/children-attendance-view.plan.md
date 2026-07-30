# Plan — Parent: Children & attendance view

> Spec: [children-attendance-view.md](children-attendance-view.md) · governing ADRs: ADR-0018, ADR-0019, ADR-0014 (all Closed, consumed unchanged) · stage: `/plan` (this doc) → next `/migration` (no-op, see Shared seam) → `/build` → `/test` → `/deploy-staging` → `/promote`

## Shared seam

**No serialized migration stage.** Confirmed against the live schema (`supabase/migrations/20260709032506_core_operational_schema.sql`, `…032818_core_operational_rls_policies.sql`) — `students`, `enrollments` (`status in ('active','withdrawn')`, one-active-per-session partial unique index), `attendance` (`status in ('present','absent')`), `classes`, and the four `*_parent_select` policies all exist exactly as the spec's "Data & RLS impact" table describes. This item consumes them unchanged; `/migration` is a pass-through (no file to write) straight to `/build`.

**Everything in this plan is either pure TypeScript (TDD, vitest) or RN/Expo Router wiring (hand-verified at `/build`/`/test`, no unit test)** — same testability split `client-auth-session-and-nav` established: pure logic gets RED→GREEN unit tests, `useEffect`/Supabase-client/router glue is verified by running the app (no React Native Testing Library in this repo yet; adding one is a bigger call than this item's scope). Concretely:

- **Pure, TDD:** `childAttendanceStats.ts` (`computeAttendanceStats`, `mapEnrollmentRow`, `sortChildrenByName`) and a `CHILDREN_ATTENDANCE_QUERY` descriptor constant (below) — both plain data, no React/Supabase runtime involved.
- **Wiring, hand-verified:** `useChildrenAttendance.ts` (the `useEffect` + live `supabase.from(...)` call), `ChildAttendanceRow.tsx` / `ParentAttendanceScreen.tsx` (RN components), and the `app/(tabs)/attendance.tsx` role branch.

**AC#7 ("client query itself only ever requests the caller's own scope") is proven by the pure descriptor constant, not by mocking `supabase-js`.** Rather than test the wiring hook directly (this repo has no supabase-js/React mocking harness — see above), the query shape itself is extracted into a plain exported constant:

```typescript
export const CHILDREN_ATTENDANCE_QUERY = {
  table: 'enrollments',
  select: 'id, student:students(id, first_name, last_name), class:classes(name, grade_band), attendance(status)',
  statusFilter: 'active',
} as const;
```

`useChildrenAttendance.ts` builds its call directly from these three values (`supabase.from(CHILDREN_ATTENDANCE_QUERY.table).select(CHILDREN_ATTENDANCE_QUERY.select).eq('status', CHILDREN_ATTENDANCE_QUERY.statusFilter)`) — a unit test asserts the constant contains exactly `status: 'active'` and no family/user-id-shaped field anywhere in `select`, which is what AC#7 actually asks this item's own coverage to confirm (a client-side bug that starts threading a `family_id` param through would fail this test before it ever reached RLS). This is a plan-level testability choice, not a spec deviation — the module surface (`useChildrenAttendance`, `childAttendanceStats`) is unchanged from the Design doc — so it doesn't bounce back to `/architect`.

**Branch:** current branch `mehtamaulik-creator/issue-22-parent-children-attendance`, 0 commits ahead of `main`. Single small client-only item — no worktree needed.

**Verify-at-build flag:** `ListRow`'s `leading` prop is typed required (`leading: ReactNode`, `components/core/ListRow.tsx:9`), but the Design doc calls for no leading content ("no `leading`/`trailing` — nothing in the requirements calls for an avatar"). `ReactNode` includes `null`, so `leading={null}` satisfies both the type and the design — confirm at `/build` that a `null` leading slot doesn't reserve unwanted layout width (the `leading` style has no fixed size, so this should be a non-issue, but hasn't been visually checked yet).

---

## Task list (ordered — TDD for pure logic, hand-verify for wiring)

### Stage 1 — `lib/attendance/parent/childAttendanceStats.ts` (pure, TDD)

- [x] **P1 — tests (RED)** `lib/attendance/parent/__tests__/childAttendanceStats.test.ts`
  ```typescript
  import { describe, it, expect } from 'vitest';
  import {
    computeAttendanceStats,
    mapEnrollmentRow,
    sortChildrenByName,
    CHILDREN_ATTENDANCE_QUERY,
    type EnrollmentRow,
  } from '../childAttendanceStats';

  describe('computeAttendanceStats', () => {
    it('returns percent: null for zero marked rows (AC#2 — no attendance recorded yet, never 0%/NaN)', () => {
      expect(computeAttendanceStats([])).toEqual({ present: 0, absent: 0, percent: null });
    });
    it('computes 100% for all-present', () => {
      expect(computeAttendanceStats([{ status: 'present' }, { status: 'present' }]))
        .toEqual({ present: 2, absent: 0, percent: 100 });
    });
    it('computes 0% for all-absent (not confused with the null "no data" case)', () => {
      expect(computeAttendanceStats([{ status: 'absent' }]))
        .toEqual({ present: 0, absent: 1, percent: 0 });
    });
    it('rounds a mixed record (2 present, 1 absent -> 67%)', () => {
      expect(computeAttendanceStats([{ status: 'present' }, { status: 'present' }, { status: 'absent' }]))
        .toEqual({ present: 2, absent: 1, percent: 67 });
    });
  });

  describe('mapEnrollmentRow', () => {
    const row: EnrollmentRow = {
      id: 'enr-1',
      student: { id: 'stu-1', first_name: 'Asha', last_name: 'Rao' },
      class: { name: 'Balvihar 3', grade_band: 'Grade 3' },
      attendance: [{ status: 'present' }, { status: 'absent' }],
    };
    it('maps a raw enrollment row into a ChildAttendance', () => {
      expect(mapEnrollmentRow(row)).toEqual({
        enrollmentId: 'enr-1',
        studentId: 'stu-1',
        name: 'Asha Rao',
        className: 'Balvihar 3',
        gradeBand: 'Grade 3',
        present: 1,
        absent: 1,
        percent: 50,
      });
    });
  });

  describe('sortChildrenByName', () => {
    it('sorts children alphabetically by name (stable default, not an AC)', () => {
      const unsorted = [
        { enrollmentId: '2', studentId: 's2', name: 'Zara Iyer', className: 'X', gradeBand: 'Y', present: 0, absent: 0, percent: null },
        { enrollmentId: '1', studentId: 's1', name: 'Asha Rao', className: 'X', gradeBand: 'Y', present: 0, absent: 0, percent: null },
      ];
      expect(sortChildrenByName(unsorted).map((c) => c.name)).toEqual(['Asha Rao', 'Zara Iyer']);
    });
  });

  describe('CHILDREN_ATTENDANCE_QUERY (AC#7 — client query only ever requests the caller\'s own scope)', () => {
    it('filters on status only — no family/user-id-shaped parameter anywhere in the query shape', () => {
      expect(CHILDREN_ATTENDANCE_QUERY.statusFilter).toBe('active');
      expect(CHILDREN_ATTENDANCE_QUERY.select).not.toMatch(/family|user_id|auth\.uid/i);
    });
  });
  ```
  Run `npm test` (or `vitest run lib/attendance/parent`) → confirm RED (module doesn't exist yet).

- [x] **P2 — implementation** `lib/attendance/parent/childAttendanceStats.ts`
  ```typescript
  export interface AttendanceStats {
    present: number;
    absent: number;
    percent: number | null;
  }

  export interface ChildAttendance extends AttendanceStats {
    enrollmentId: string;
    studentId: string;
    name: string;
    className: string;
    gradeBand: string;
  }

  export interface EnrollmentRow {
    id: string;
    student: { id: string; first_name: string; last_name: string };
    class: { name: string; grade_band: string };
    attendance: { status: 'present' | 'absent' }[];
  }

  // The query shape itself, extracted as data (not inlined in the fetch hook) so it's unit
  // testable without a live Supabase call — AC#7's own coverage: prove the built query only
  // ever asks for status='active', never a family/user id (see plan Shared seam).
  export const CHILDREN_ATTENDANCE_QUERY = {
    table: 'enrollments',
    select: 'id, student:students(id, first_name, last_name), class:classes(name, grade_band), attendance(status)',
    statusFilter: 'active',
  } as const;

  export function computeAttendanceStats(records: { status: 'present' | 'absent' }[]): AttendanceStats {
    const present = records.filter((r) => r.status === 'present').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const total = present + absent;
    return { present, absent, percent: total === 0 ? null : Math.round((present / total) * 100) };
  }

  export function mapEnrollmentRow(row: EnrollmentRow): ChildAttendance {
    return {
      enrollmentId: row.id,
      studentId: row.student.id,
      name: `${row.student.first_name} ${row.student.last_name}`,
      className: row.class.name,
      gradeBand: row.class.grade_band,
      ...computeAttendanceStats(row.attendance),
    };
  }

  export function sortChildrenByName(children: ChildAttendance[]): ChildAttendance[] {
    return [...children].sort((a, b) => a.name.localeCompare(b.name));
  }
  ```
  Run P1 → GREEN.

---

### Stage 2 — `lib/attendance/parent/useChildrenAttendance.ts` (wiring, hand-verified at `/build`)

- [x] **P3 — implementation**
  ```typescript
  import { useCallback, useEffect, useState } from 'react';
  import { supabase } from '../../supabase';
  import { CHILDREN_ATTENDANCE_QUERY, mapEnrollmentRow, sortChildrenByName, type ChildAttendance, type EnrollmentRow } from './childAttendanceStats';
  import type { ViewState } from '../../../components/core/StateView.logic';

  export interface UseChildrenAttendanceResult {
    state: ViewState;
    children: ChildAttendance[];
    errorText?: string;
    refetch: () => void;
  }

  export function useChildrenAttendance(): UseChildrenAttendanceResult {
    const [state, setState] = useState<ViewState>('loading');
    const [children, setChildren] = useState<ChildAttendance[]>([]);
    const [errorText, setErrorText] = useState<string | undefined>(undefined);

    const load = useCallback(() => {
      setState('loading');
      supabase
        .from(CHILDREN_ATTENDANCE_QUERY.table)
        .select(CHILDREN_ATTENDANCE_QUERY.select)
        .eq('status', CHILDREN_ATTENDANCE_QUERY.statusFilter)
        .then(({ data, error }) => {
          if (error) {
            setErrorText(error.message);
            setState('error');
            return;
          }
          const rows = (data ?? []) as unknown as EnrollmentRow[];
          const mapped = sortChildrenByName(rows.map(mapEnrollmentRow));
          setChildren(mapped);
          setState(mapped.length === 0 ? 'empty' : 'content');
        });
    }, []);

    useEffect(() => {
      load();
    }, [load]);

    return { state, children, errorText, refetch: load };
  }
  ```
  No unit test (live Supabase client + `useEffect` — see Shared seam). Verify at `/build`: with a seeded Parent account, confirm loading → content, and that an empty-family account lands on `empty`.

---

### Stage 3 — Presentational components (wiring, hand-verified)

- [x] **P4 — `lib/attendance/parent/ChildAttendanceRow.tsx`**
  ```typescript
  import { View } from 'react-native';
  import { StyleSheet } from 'react-native-unistyles';
  import Card from '../../../components/core/Card';
  import ListRow from '../../../components/core/ListRow';
  import StatTile from '../../../components/core/StatTile';
  import StatusChip from '../../../components/core/StatusChip';
  import type { ChildAttendance } from './childAttendanceStats';

  export function ChildAttendanceRow({ child }: { child: ChildAttendance }) {
    return (
      <Card tone="surface">
        <ListRow leading={null} title={child.name} subtitle={`${child.className} · ${child.gradeBand}`} />
        {child.percent === null ? (
          <StatusChip status="neutral">No attendance recorded yet</StatusChip>
        ) : (
          <View style={styles.stats}>
            <StatTile label="Present" value={child.present} />
            <StatTile label="Absent" value={child.absent} />
            <StatTile label="Attendance %" value={`${child.percent}%`} accent />
          </View>
        )}
      </Card>
    );
  }

  const styles = StyleSheet.create((theme) => ({
    stats: { flexDirection: 'row', gap: theme.space['5'], marginTop: theme.space['3'] },
  }));
  ```

- [x] **P5 — `lib/attendance/parent/ParentAttendanceScreen.tsx`**
  ```typescript
  import { ScrollView } from 'react-native';
  import { StyleSheet } from 'react-native-unistyles';
  import StateView from '../../../components/core/StateView';
  import { useChildrenAttendance } from './useChildrenAttendance';
  import { ChildAttendanceRow } from './ChildAttendanceRow';

  export function ParentAttendanceScreen() {
    const { state, children, errorText, refetch } = useChildrenAttendance();

    return (
      <ScrollView contentContainerStyle={styles.content}>
        <StateView
          state={state}
          emptyText="No children are actively enrolled this session."
          errorText={errorText ?? 'Could not load attendance. Please try again.'}
          onRetry={refetch}
        >
          {children.map((child) => (
            <ChildAttendanceRow key={child.enrollmentId} child={child} />
          ))}
        </StateView>
      </ScrollView>
    );
  }

  const styles = StyleSheet.create((theme) => ({
    content: { padding: theme.space['4'], gap: theme.space['3'] },
  }));
  ```

---

### Stage 4 — Screen wiring

- [x] **P6 — `app/(tabs)/attendance.tsx`** — add the Parent branch (decision #5: thin role dispatcher, every other role keeps today's placeholder)
  ```typescript
  import { View, Text } from "react-native";
  import { useRoleGuard } from "../../lib/auth/useRoleGuard";
  import { useSession } from "../../lib/auth/SessionProvider";
  import { ParentAttendanceScreen } from "../../lib/attendance/parent/ParentAttendanceScreen";

  export default function AttendanceScreen() {
    useRoleGuard("attendance");
    const { activeRole } = useSession();

    if (activeRole === "parent") {
      return <ParentAttendanceScreen />;
    }

    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Attendance — placeholder</Text>
      </View>
    );
  }
  ```

---

### Stage 5 — Verify (`/build`, `/test`)

- [x] **P7 — `/build` manual walkthrough:** seed a Parent test account (single child, multi-child, zero-active-enrollment, and a child with zero marked attendance) via local Supabase; confirm all four `StateView` states render correctly and `refetch` recovers from a forced error (e.g. kill local Supabase mid-load).
- [x] **P8 — `/test` design-parity pass (`playwright-cli`):** all four breakpoints (360/768/1024/1440) against AC#8 — no hex literals (grep `ChildAttendanceRow.tsx`/`ParentAttendanceScreen.tsx` for hex, expect none), tabular-nums via `StatTile`'s existing mono variant, ≥44px touch targets via `ListRow`'s existing `theme.chrome.hitMin`, long-name truncation at 360px (`ListRow`'s existing `numberOfLines={1}`, no new work needed — just confirm it holds for this consumer). Multi-guardian case (AC edge case) is provable by construction (no per-guardian filtering code exists) rather than a live two-account test — note this in `/test`'s report rather than re-deriving it.

---

## Out of scope (confirmed, unchanged from spec)
Same list as the Design doc: no new schema/migration/RLS; Teacher's mark/submit and Student's view-own attendance (separate items sharing the tab slot); Coordinator's compliance dashboard; historical/cross-session stats; withdrawn/not-yet-enrolled children in the list; push/email notifications.

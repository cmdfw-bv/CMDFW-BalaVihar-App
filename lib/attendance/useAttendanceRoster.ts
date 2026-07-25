import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { joinRosterWithEnrollments, type RosterRow } from './rosterMap';
import { seedMarks, type MarksByEnrollment } from './seedMarks';
import { computeDateBounds, mostRecentSessionDate, addDaysIso, type DateBounds, type WeeklySession } from './dateBounds';
import { formatSessionSchedule } from './formatSchedule';
import { applySubmitResults } from './submitResults';
import { deriveRosterViewState, type FetchStatus } from './viewState';

export interface AttendanceHeader {
  className: string;
  sessionName: string;
  scheduleLabel: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Behavior (Design spec): on mount and on every date change, four reads build the roster +
// pre-populated local marking state; submit fires mark_attendance_for_staff concurrently per
// visible row (decision #2) and reduces the settled results back onto that state (decision #3).
export function useAttendanceRoster(classId: string) {
  // Seeded lazily on first successful load (needs session.day_of_week) — '' is a transient
  // placeholder never rendered (fetchStatus stays 'loading' until it's set).
  const [selectedDate, setSelectedDate] = useState('');
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('loading');
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [marks, setMarks] = useState<MarksByEnrollment>({});
  const [header, setHeader] = useState<AttendanceHeader | null>(null);
  const [dateBounds, setDateBounds] = useState<DateBounds | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Ref alongside the state: a double-tap fires both event handlers before React commits the
  // disabled-button re-render, so the `disabled` prop alone doesn't close the race — this does.
  const isSubmittingRef = useRef(false);

  const load = useCallback(async (dateOverride?: string) => {
    setFetchStatus('loading');
    try {
      const { data: classRow, error: classError } = await supabase
        .from('classes').select('name, grade_band, session_id').eq('id', classId).single();
      if (classError || !classRow) throw classError ?? new Error('class not found');

      const { data: sessionRow, error: sessionError } = await supabase
        .from('sessions')
        .select('name, start_date, end_date, day_of_week, start_time, end_time') // +3 cols, ADR-0031
        .eq('id', classRow.session_id)
        .single();
      if (sessionError || !sessionRow) throw sessionError ?? new Error('session not found');

      // ADR-0031: default is the walk-back match, not raw today; dateOverride carries an
      // already-known date across a goToPrevious/goToNext-triggered reload.
      const targetDate = dateOverride ?? mostRecentSessionDate(sessionRow as WeeklySession, todayIso());

      const [rosterResult, enrollmentsResult, attendanceResult] = await Promise.all([
        supabase.rpc('get_class_roster_for_staff', { p_class_id: classId }),
        supabase.from('enrollments').select('id, student_id').eq('class_id', classId).eq('status', 'active'),
        supabase.rpc('get_class_attendance_for_staff', { p_class_id: classId, p_date_from: targetDate, p_date_to: targetDate }),
      ]);
      if (rosterResult.error) throw rosterResult.error;
      if (enrollmentsResult.error) throw enrollmentsResult.error;
      if (attendanceResult.error) throw attendanceResult.error;

      const joined = joinRosterWithEnrollments(rosterResult.data ?? [], enrollmentsResult.data ?? []);
      setRows(joined);
      setMarks(seedMarks(joined, attendanceResult.data ?? []));
      setHeader({
        className: classRow.name,
        sessionName: sessionRow.name,
        scheduleLabel: formatSessionSchedule(sessionRow),
      });
      setSelectedDate(targetDate);
      setDateBounds(computeDateBounds(sessionRow, todayIso(), targetDate));
      setFetchStatus('ready');
    } catch {
      setFetchStatus('error');
    }
  }, [classId]);

  useEffect(() => {
    // Guard against the transient classId="" the screen passes before the teacher's JWT/scopeId
    // has resolved — querying with it would fail and flash the error state before the real
    // scopeId arrives and re-triggers this effect. fetchStatus stays at its initial 'loading'.
    if (!classId) return;
    load();
    // Fresh reads on every classId change only — a date-nav step calls load(dateOverride)
    // directly rather than re-running this effect (Design spec, "Date navigation").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const markLocal = useCallback((enrollmentId: string, status: 'present' | 'absent') => {
    setMarks((prev) => ({ ...prev, [enrollmentId]: { status, saved: false, error: false } }));
  }, []);

  // ±7-day steps (ADR-0031) — a date switch mid-marking discards in-flight local marks (Design
  // spec Behavior, "Date navigation"), so this re-runs the full load() rather than patching state.
  const goToPrevious = useCallback(() => {
    if (dateBounds?.canGoPrev) load(addDaysIso(selectedDate, -7));
  }, [load, dateBounds, selectedDate]);

  const goToNext = useCallback(() => {
    if (dateBounds?.canGoNext) load(addDaysIso(selectedDate, 7));
  }, [load, dateBounds, selectedDate]);

  const submitRows = useCallback(async (enrollmentIds: string[], currentMarks: MarksByEnrollment) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      const settled = await Promise.allSettled(
        enrollmentIds.map((id) =>
          supabase.rpc('mark_attendance_for_staff', {
            p_enrollment_id: id,
            p_class_meeting_date: selectedDate,
            p_status: currentMarks[id].status,
          }).then(({ data, error }) => {
            if (error) throw error;
            return data;
          }),
        ),
      );
      setMarks((prev) => applySubmitResults(prev, enrollmentIds.map((enrollmentId, i) => ({ enrollmentId, settled: settled[i] }))));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [selectedDate]);

  const submit = useCallback(() => submitRows(rows.map((r) => r.enrollmentId), marks), [submitRows, rows, marks]);
  const retryFailed = useCallback(
    () => submitRows(Object.entries(marks).filter(([, m]) => m.error).map(([id]) => id), marks),
    [submitRows, marks],
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
    isSubmitting,
    // Initial-fetch retry (error state) — re-walks-back only if no date was ever established.
    retry: () => load(selectedDate || undefined),
  };
}

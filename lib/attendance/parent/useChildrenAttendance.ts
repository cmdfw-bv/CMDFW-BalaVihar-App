import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { buildChildrenQuery, mapEnrollmentRows, type ChildAttendance, type EnrollmentRow } from './childAttendanceStats';
import type { ViewState } from '../../../components/core/StateView.logic';

export interface UseChildrenAttendanceResult {
  state: ViewState;
  children: ChildAttendance[];
  refetch: () => void;
}

export function useChildrenAttendance(): UseChildrenAttendanceResult {
  const [state, setState] = useState<ViewState>('loading');
  const [children, setChildren] = useState<ChildAttendance[]>([]);
  // Monotonic request id: only the newest in-flight fetch may write state. Guards both a
  // double-tap of Retry resolving out of order and a setState after unmount (PR #51 review,
  // Important #4). The unmount cleanup bumps it, invalidating anything still in flight.
  const requestId = useRef(0);

  // Deliberately does NOT set 'loading' itself. The mount path relies on that being the initial
  // state, which keeps this free of a synchronous setState inside useEffect — the
  // react-hooks/set-state-in-effect error the repo's real lint run reports (the `expo lint`
  // script never surfaced it; see #50's review). Refetch sets 'loading' from the event handler
  // below, where it is not an effect-phase write.
  const fetchChildren = useCallback(() => {
    const id = ++requestId.current;

    // Built by the shared builder rather than inline, so AC#7's regression guard asserts against
    // the path actually used (PR #51 review, Important #3).
    buildChildrenQuery(supabase).then(({ data, error }) => {
      if (id !== requestId.current) return;

      if (error) {
        // Deliberately NOT surfaced. PostgREST text like "permission denied for table students"
        // is schema disclosure on a minors'-data-adjacent screen (Important #2); the screen shows
        // fixed generic copy. console is the only sink that exists today — issue #64 owns the
        // real destination and the privacy-rules scrubbing question.
        console.error('children_attendance_fetch_failed', error.message);
        setState('error');
        return;
      }

      // mapEnrollmentRows drops individual unrenderable rows rather than throwing, so one null
      // embed can no longer blank the whole list (Important #1). Nothing here throws, which is
      // why there is no try/catch — the previous one also wrapped the setState calls, blurring
      // what it guarded (review Minor #6).
      const mapped = mapEnrollmentRows((data ?? []) as unknown as EnrollmentRow[]);
      setChildren(mapped);
      setState(mapped.length === 0 ? 'empty' : 'content');
    });
  }, []);

  useEffect(() => {
    fetchChildren();
    return () => {
      requestId.current += 1;
    };
  }, [fetchChildren]);

  const refetch = useCallback(() => {
    setState('loading');
    fetchChildren();
  }, [fetchChildren]);

  return { state, children, refetch };
}

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
        try {
          const rows = (data ?? []) as unknown as EnrollmentRow[];
          const mapped = sortChildrenByName(rows.map(mapEnrollmentRow));
          setChildren(mapped);
          setState(mapped.length === 0 ? 'empty' : 'content');
        } catch {
          setErrorText('Something went wrong loading attendance.');
          setState('error');
        }
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { state, children, errorText, refetch: load };
}

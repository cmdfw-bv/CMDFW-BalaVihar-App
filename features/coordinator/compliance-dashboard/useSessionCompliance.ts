import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { getSessionCompliance } from './api';
import { computeRollup, type ComplianceRow } from './rollup';
import { deriveDashboardViewState } from './viewState';

export function useSessionCompliance(sessionId: string | null, windowSize = 4) {
  const [rows, setRows] = useState<ComplianceRow[] | null>(null);
  const hasEverSucceeded = useRef(false);
  const [lastFetchFailed, setLastFetchFailed] = useState(false);

  const fetchOnce = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await getSessionCompliance(supabase, sessionId, windowSize);
      setRows(data);
      hasEverSucceeded.current = true;
      setLastFetchFailed(false);
    } catch {
      setLastFetchFailed(true);
    }
  }, [sessionId, windowSize]);

  // Mount + in-app route refocus.
  useFocusEffect(useCallback(() => { fetchOnce(); }, [fetchOnce]));

  // Browser tab/window refocus (web only — useFocusEffect alone doesn't fire for this).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onVisible = () => { if (document.visibilityState === 'visible') fetchOnce(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [fetchOnce]);

  const derived = deriveDashboardViewState({ hasEverSucceeded: hasEverSucceeded.current, rows, lastFetchFailed });

  return { ...derived, rollup: computeRollup(derived.rows), retry: fetchOnce };
}

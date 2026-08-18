import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { getSessionCompliance } from './api';
import { createFetchCoalescer } from './fetchCoalescer';
import { computeRollup } from './rollup';
import { applyFetchResult, selectSessionState, type SessionFetchState } from './sessionScopedState';
import { deriveDashboardViewState } from './viewState';

export function useSessionCompliance(sessionId: string | null, windowSize = 4) {
  // Keyed BY session rather than a single tagged slot. The tagged slot guarded the read but not
  // the write: a switch rebuilds the coalescer, so A's and B's requests can be in flight at once,
  // and if A settled second it overwrote B's state. `selectSessionState` then refused to render
  // it (correct) and fell back to `loading` — with nothing left to re-trigger, since B's
  // `fetchOnce` had already run and cleared `inFlight`, so the screen stranded on skeletons with
  // no retry affordance. A map makes a stale write land in its own key and become unreachable
  // instead of displacing the current one (PR #50 review round 5, @ssrinivas90).
  const [bySession, setBySession] = useState<Record<string, SessionFetchState>>({});

  const doFetch = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await getSessionCompliance(supabase, sessionId, windowSize);
      setBySession((prev) => applyFetchResult(prev, sessionId, { ok: true, rows: data }));
    } catch {
      // Preserve last-good rows for THIS session so a failed refresh keeps content + banner
      // (AC7); a failure for a session we have no rows for stays a plain error.
      setBySession((prev) => applyFetchResult(prev, sessionId, { ok: false }));
    }
  }, [sessionId, windowSize]);

  // Coalesces overlapping triggers (e.g. visibilitychange + focus firing together on browser
  // refocus) into a single in-flight request, so a tab refocus can't double-write audit_log
  // rows or let a stale response clobber a newer one out of order.
  // useMemo rather than a ref: the previous `useRef(createFetchCoalescer(doFetch))` invoked the
  // factory on every render, which React Compiler flags (react-hooks/refs) — an error the repo's
  // real lint run reports and the `expo lint` script never surfaced (PR #50 review).
  //
  // Keying it on `doFetch` is the refetch half of the session-switch fix: `doFetch` closes over
  // sessionId, so a Coordinator holding two session-scoped roles who switches scope now gets a
  // fresh coalescer and a re-fetch. Previously the trigger was a stable `useCallback(..., [])`,
  // so nothing re-ran. Rebuilding the coalescer per session is correct on its own terms too — an
  // in-flight request for the old session must not absorb the new one's.
  //
  // The render half is `selectSessionState` below. Re-triggering alone still left Session A's
  // cards under a Session B chip until the new response landed, because the row state was
  // untagged (PR #50 review, @ssrinivas90).
  const fetchOnce = useMemo(() => createFetchCoalescer(doFetch), [doFetch]);

  // Mount, in-app route refocus, and session change.
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

  // Derived rather than tracked in a ref: `rows` starts null and is only ever assigned a
  // non-null array in the same success branch that used to flip the ref, so the two are
  // equivalent — and reading a ref during render is precisely what react-hooks/refs objects to.
  const { rows, lastFetchFailed } = selectSessionState(sessionId ? bySession[sessionId] ?? null : null, sessionId);
  const derived = deriveDashboardViewState({ hasEverSucceeded: rows !== null, rows, lastFetchFailed });

  return { ...derived, rollup: computeRollup(derived.rows), retry: fetchOnce };
}

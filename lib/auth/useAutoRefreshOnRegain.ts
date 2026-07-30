import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "../supabase";

// Extracted from the hook so it's testable without rendering React (mirrors
// isRouteInScope/useRoleGuard in navMap.ts — pure logic tested directly, the hook itself
// is a thin useEffect wrapper). Both triggers — the interval and "regained focus" — call
// the exact same one-line refreshSession(); errors are swallowed here, never surfaced
// (decision #3, AC#4), mirroring switchRole's existing no-op contract for switch_active_role.
// `inFlight` also dedupes visibilitychange+focus firing together on a single regain (both
// fire on a typical tab switch back; without this each one triggers its own refresh call).
export function setupAutoRefreshOnRegain(intervalMs: number): () => void {
  let inFlight = false;
  const tick = () => {
    if (inFlight) return;
    inFlight = true;
    void supabase.auth
      .refreshSession()
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  };

  const interval = setInterval(tick, intervalMs);

  if (Platform.OS === "web") {
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", tick);
    };
  }

  const subscription = AppState.addEventListener("change", (next) => {
    if (next === "active") tick();
  });
  return () => {
    clearInterval(interval);
    subscription.remove();
  };
}

// Pure side effect, no return value, no local state (Design spec, decision #1).
export function useAutoRefreshOnRegain(intervalMs: number): void {
  useEffect(() => setupAutoRefreshOnRegain(intervalMs), [intervalMs]);
}

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
    // try/catch is defensive, not reachable with auth-js 2.108.2: if refreshSession() ever threw
    // synchronously instead of returning a rejected promise, `.catch`/`.finally` would never
    // attach, `inFlight` would stay true for the life of the screen, and auto-recovery would die
    // silently — leaving only the sign-out path. The throw would also escape the focus listener
    // as a console error, contradicting AC#4's "no console-visible crash" (PR #54 review).
    try {
      void supabase.auth
        .refreshSession()
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    } catch {
      inFlight = false;
    }
  };

  const interval = setInterval(tick, intervalMs);

  if (Platform.OS === "web") {
    // `document`/`window` are only safe here because the sole call site is inside useEffect,
    // which never runs during Expo Router's static web export. This function is exported and
    // carries no such precondition in its signature, so the guard makes the invariant hold for
    // any future non-effect caller rather than relying on the current call site (PR #54 review).
    if (typeof document === "undefined" || typeof window === "undefined") {
      return () => clearInterval(interval);
    }
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

/**
 * How often `/no-role` re-checks whether a role has been granted.
 *
 * 60s was an explicit architect decision (client-auth-session-and-nav.md, decision #2). Named
 * here rather than left as a literal at the call site so the value is greppable from the code
 * and not only from the plan doc (PR #54 review, @ssrinivas90).
 */
export const ROLE_POLL_MS = 60_000;

// Pure side effect, no return value, no local state (Design spec, decision #1).
export function useAutoRefreshOnRegain(intervalMs: number = ROLE_POLL_MS): void {
  useEffect(() => setupAutoRefreshOnRegain(intervalMs), [intervalMs]);
}

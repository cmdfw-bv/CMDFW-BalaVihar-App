import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { supabase } from "../supabase";

// Pure side effect, no return value, no local state (Design spec, decision #1). Both triggers
// — the interval and "regained focus" — call the exact same one-line refreshSession(); errors
// are swallowed here, never surfaced (decision #3, AC#4), mirroring switchRole's existing
// no-op contract for switch_active_role.
export function useAutoRefreshOnRegain(intervalMs: number): void {
  useEffect(() => {
    const tick = () => {
      void supabase.auth.refreshSession().catch(() => {});
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
  }, [intervalMs]);
}

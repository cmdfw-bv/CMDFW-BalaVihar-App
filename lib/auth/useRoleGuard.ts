import { useEffect } from "react";
import { router } from "expo-router";
import { useSession } from "./SessionProvider";
import { isRouteInScope, type TabKey } from "./navMap";

// Applied at the top of every tab screen (including the two stub screens) — one mechanism
// covers both "never had this tab" and "had it, then switched/got-revoked into not having
// it" (AC#9). The membership check itself (isRouteInScope) is unit-tested in navMap.test.ts;
// this hook is just the router.replace side effect, which needs a live router to verify.
export function useRoleGuard(route: TabKey) {
  const { activeRole, status } = useSession();
  useEffect(() => {
    if (status === "ready" && !isRouteInScope(route, activeRole)) {
      router.replace("/feed");
    }
  }, [status, activeRole, route]);
}

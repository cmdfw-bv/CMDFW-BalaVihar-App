import { Redirect } from "expo-router";
import { useSession } from "../lib/auth/SessionProvider";
import { tabsForRole } from "../lib/auth/navMap";

// "/" is the one route always mounted in app/_layout.tsx's root Stack (not wrapped in
// Stack.Protected), so it's reachable in every status. It routes onward to whichever guarded
// group actually matches: sign-in / no-role / the current role's first mapped tab (AC#3) —
// never a role-agnostic hardcoded one. `loading` renders nothing; the splash screen stays up.
export default function Index() {
  const { status, activeRole } = useSession();
  if (status === "signed-out") return <Redirect href="/sign-in" />;
  if (status === "zero-role") return <Redirect href="/no-role" />;
  if (status === "ready") {
    const firstTab = tabsForRole(activeRole)[0] ?? "feed";
    return <Redirect href={`/${firstTab}` as never} />;
  }
  return null;
}

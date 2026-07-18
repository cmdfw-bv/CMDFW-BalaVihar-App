import { useWindowDimensions } from "react-native";
import { isDesktopWidth } from "./isDesktopWidth";

// Thin wrapper over useWindowDimensions — the width->boolean check itself is unit-tested
// in __tests__/isDesktopWidth.test.ts; this hook just needs a live window to verify (same
// seam as lib/auth/useRoleGuard.ts over navMap's pure isRouteInScope).
export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return isDesktopWidth(width);
}

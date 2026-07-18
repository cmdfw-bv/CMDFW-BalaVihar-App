import { ALL_TABS, type TabKey } from "../lib/auth/navMap";

const KNOWN_TABS = new Set<string>(ALL_TABS);

export function activeSidebarTab(routeNames: string[], focusedIndex: number): TabKey | null {
  const name = routeNames[focusedIndex];
  if (name === undefined || !KNOWN_TABS.has(name)) return null;
  return name as TabKey;
}

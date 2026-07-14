import type { TabKey } from "../../lib/auth/navMap";

export type IconName = "feed" | "people" | "attendance" | "msg" | "overview" | "reg" | "audit";

// Lifted from the design mirror's bv-connect icon sets — see the test file for per-tab
// provenance (exact name match vs. closest semantic match).
const TAB_ICON: Record<TabKey, IconName> = {
  feed: "feed",
  classes: "people",
  attendance: "attendance",
  chat: "msg",
  dashboard: "overview",
  approvals: "reg",
  admin: "audit",
};

export function iconNameForTab(tab: TabKey): IconName {
  return TAB_ICON[tab];
}

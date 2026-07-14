import { Tabs } from "expo-router";
import { useSession } from "../../lib/auth/SessionProvider";
import { ALL_TABS, tabsForRole } from "../../lib/auth/navMap";
import RoleSwitcher from "../../components/RoleSwitcher";
import AppHeader from "../../components/AppHeader";
import DesktopSidebar from "../../components/DesktopSidebar";
import { useIsDesktop } from "../../lib/useIsDesktop";

const TAB_TITLES: Record<string, string> = {
  feed: "Feed",
  classes: "Classes",
  attendance: "Attendance",
  chat: "Chat",
  dashboard: "Dashboard",
  approvals: "Approvals",
  admin: "Admin",
};

export default function TabsLayout() {
  const { activeRole } = useSession();
  const isDesktop = useIsDesktop();
  const visible = new Set(tabsForRole(activeRole));

  return (
    <Tabs
      tabBar={isDesktop ? (props) => <DesktopSidebar {...props} visible={visible} /> : undefined}
      screenOptions={
        isDesktop
          ? { tabBarPosition: "left", header: () => <AppHeader /> }
          : { headerRight: () => <RoleSwitcher /> }
      }
    >
      {ALL_TABS.map((tab) => (
        <Tabs.Screen
          key={tab}
          name={tab}
          options={{ title: TAB_TITLES[tab], href: visible.has(tab) ? undefined : null }}
        />
      ))}
    </Tabs>
  );
}

import "../../lib/unistyles";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import { useSession } from "../../lib/auth/SessionProvider";
import { ALL_TABS, tabsForRole } from "../../lib/auth/navMap";
import AppHeader from "../../components/AppHeader";
import DesktopSidebar from "../../components/DesktopSidebar";
import { TabIcon } from "../../components/icons/TabIcons";
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

  // AppHeader renders off-desktop (the design mirror's phone header, bv-connect/screens/
  // phone/app.jsx .hdr, always shows the OM mark + app name + role/scope, not just the bare
  // route title Expo Router's default header would show). On desktop the sidebar rail already
  // shows brand + role/scope (its own logoRow + stacked RoleSwitcher footer, issue #31) — an
  // AppHeader top bar there would duplicate both, diverging from the design mirror's
  // screens/desktop/dash.jsx (brand shown once, top bar reserved for page-specific content).
  const tabs = (
    <Tabs
      tabBar={isDesktop ? (props) => <DesktopSidebar {...props} visible={visible} /> : undefined}
      screenOptions={{
        ...(isDesktop
          ? { headerShown: false, tabBarPosition: "left" as const }
          : { header: () => <AppHeader showSwitcher /> }),
      }}
    >
      {ALL_TABS.map((tab) => (
        <Tabs.Screen
          key={tab}
          name={tab}
          options={{
            title: TAB_TITLES[tab],
            href: visible.has(tab) ? undefined : null,
            tabBarIcon: ({ color, size }) => <TabIcon tab={tab} color={color} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );

  // Caps + centers the desktop shell at theme.chrome.deskw, matching the design mirror's
  // `.shell { max-width: var(--app-deskw); margin: 0 auto }` (dash.css) — previously unused,
  // the shell stretched full-bleed to the viewport at wide desktop widths (e.g. 1440px).
  return isDesktop ? <View style={styles.deskWrap}>{tabs}</View> : tabs;
}

const styles = StyleSheet.create((theme) => ({
  deskWrap: {
    flex: 1,
    width: "100%",
    maxWidth: theme.chrome.deskw,
    alignSelf: "center",
    backgroundColor: theme.colors.canvas,
  },
}));

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

  // AppHeader renders at every width now (Design parity fix — the design mirror's phone
  // header, bv-connect/screens/phone/app.jsx .hdr, always shows the OM mark + app name +
  // role/scope, not just the bare route title Expo Router's default header would show).
  // showSwitcher is only true off-desktop: the desktop rail already mounts RoleSwitcher in
  // its own footer (DesktopSidebar), matching dash.jsx's side__foot (issue #31).
  const tabs = (
    <Tabs
      tabBar={isDesktop ? (props) => <DesktopSidebar {...props} visible={visible} /> : undefined}
      screenOptions={{
        header: () => <AppHeader showSwitcher={!isDesktop} />,
        ...(isDesktop ? { tabBarPosition: "left" as const } : {}),
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

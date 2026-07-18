import "../../lib/unistyles";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSession } from "../../lib/auth/SessionProvider";
import { ALL_TABS, TAB_TITLES, tabsForRole } from "../../lib/auth/navMap";
import AppHeader from "../../components/AppHeader";
import DesktopSidebar, { SIDEBAR_WIDTH } from "../../components/DesktopSidebar";
import MobileTabBar from "../../components/MobileTabBar";
import { useIsDesktop } from "../../lib/useIsDesktop";

export default function TabsLayout() {
  const { activeRole } = useSession();
  const isDesktop = useIsDesktop();
  const visible = new Set(tabsForRole(activeRole));
  // React Navigation's `sceneStyle` isn't rendered through a `style={styles.x}` JSX attribute
  // (it's read internally by react-navigation's own <Screen>, via screenOptions), so it never
  // passes through Unistyles' compile-time transform — a StyleSheet.create() value handed to
  // it silently resolves to nothing. Build a plain object from the live theme instead
  // (confirmed live: a literal object here renders correctly, a StyleSheet.create() one
  // doesn't produce any visible maxWidth/backgroundColor at all).
  const { theme } = useUnistyles();
  const desktopScene = {
    flex: 1,
    width: "100%" as const,
    maxWidth: theme.chrome.deskw - SIDEBAR_WIDTH,
    alignSelf: "center" as const,
    backgroundColor: theme.colors.canvas,
  };

  // AppHeader renders off-desktop (the design mirror's phone header, bv-connect/screens/
  // phone/app.jsx .hdr, always shows the OM mark + app name + role/scope, not just the bare
  // route title Expo Router's default header would show). On desktop the sidebar rail already
  // shows brand + role/scope (its own logoRow + stacked RoleSwitcher footer, issue #31) — an
  // AppHeader top bar there would duplicate both, diverging from the design mirror's
  // screens/desktop/dash.jsx (brand shown once, top bar reserved for page-specific content).
  const tabs = (
    <Tabs
      tabBar={(props) =>
        isDesktop ? (
          <DesktopSidebar {...props} visible={visible} />
        ) : (
          <MobileTabBar {...props} visible={visible} />
        )
      }
      screenOptions={{
        ...(isDesktop
          ? {
              headerShown: false,
              tabBarPosition: "left" as const,
              // Caps + centers only the content pane (not the sidebar) at wide desktop
              // widths. Intentional deviation from the design mirror's `.shell { max-width:
              // var(--app-deskw); margin: 0 auto }` (dash.css), which caps sidebar+content
              // together and so centers the whole shell — on very wide monitors that leaves
              // the nav rail stranded away from the true left edge with an empty gutter
              // beside it (reported 2026-07-16). Here the sidebar always sits flush at the
              // true left edge (styles.desktopWrap has no maxWidth/alignSelf of its own) and
              // only this scene pane centers within the remaining row space. Width mirrors
              // the mirror's overall proportions: deskw minus the sidebar's own width.
              sceneStyle: desktopScene,
            }
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
          }}
        />
      ))}
    </Tabs>
  );

  // No longer caps/centers the whole shell (see sceneStyle above) — just fills the viewport
  // and paints the canvas background behind the sidebar-flush-left / content-centered split.
  return isDesktop ? <View style={styles.desktopWrap}>{tabs}</View> : tabs;
}

const styles = StyleSheet.create((theme) => ({
  desktopWrap: {
    flex: 1,
    width: "100%",
    backgroundColor: theme.colors.canvas,
  },
}));

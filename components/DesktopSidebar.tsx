import "../lib/unistyles";
import { View, Text, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { TabIcon } from "./icons/TabIcons";
import Logo from "./brand/Logo";
import RoleSwitcher from "./RoleSwitcher";
import { activeSidebarTab } from "./activeSidebarTab";
import { lightTheme } from "../lib/theme";
import type { TabKey } from "../lib/auth/navMap";

// Exported so app/(tabs)/_layout.tsx can size the desktop content pane's max-width against
// the sidebar's own width without a second, driftable copy of the same number (issue: wide
// monitors were centering the whole sidebar+content shell instead of pinning the sidebar to
// the true left edge, 2026-07-16). Derived from lightTheme directly (not the useUnistyles()
// runtime hook) since this app has a single theme and the constant must be usable at module
// scope, outside any component.
export const SIDEBAR_WIDTH = lightTheme.space["16"] * 4;

const TAB_TITLES: Record<TabKey, string> = {
  feed: "Feed",
  classes: "Classes",
  attendance: "Attendance",
  chat: "Chat",
  dashboard: "Dashboard",
  approvals: "Approvals",
  admin: "Admin",
};

// Narrow local slice of React Navigation's BottomTabBarProps (avoids importing the type from
// expo-router's internal build path, which isn't part of its public surface) — just the shape
// this sidebar actually reads: the route list, per-route options, current focused index, and
// enough of `navigation` to emit tabPress + navigate.
type SidebarProps = {
  state: { routes: { key: string; name: string }[]; index: number };
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  // Expo Router consumes `href: null` for its own Link-resolution/default-tabBar layer before
  // it reaches React Navigation's descriptor.options — role-scoped visibility is passed in
  // directly instead, computed the same way (tabsForRole(activeRole)) as the phone tabs' own
  // `href` prop in (tabs)/_layout.tsx.
  visible: Set<TabKey>;
};

export default function DesktopSidebar({ state, navigation, visible }: SidebarProps) {
  const { theme } = useUnistyles();
  const active = activeSidebarTab(
    state.routes.map((r) => r.name),
    state.index,
  );

  return (
    <View style={styles.rail}>
      <View style={styles.logoRow}>
        <Logo size={28} title="Bala Vihar App" tagline="CMDFW" />
      </View>
      <View style={styles.nav}>
        {state.routes
          .filter((route) => visible.has(route.name as TabKey))
          .map((route) => {
            const tab = route.name as TabKey;
            const isActive = tab === active;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[styles.item, isActive && styles.itemActive]}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!isActive && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
              >
                <TabIcon tab={tab} size={18} color={isActive ? theme.colors.accent : theme.colors.ink3} />
                <Text style={[styles.itemLabel, isActive && styles.itemLabelActive]}>{TAB_TITLES[tab]}</Text>
              </Pressable>
            );
          })}
      </View>
      <View style={styles.foot}>
        <RoleSwitcher stacked />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  rail: {
    width: SIDEBAR_WIDTH,
    minHeight: "100%",
    backgroundColor: theme.colors.surface,
    borderRightWidth: 1,
    borderRightColor: theme.colors.line,
    paddingVertical: theme.space["5"],
    paddingHorizontal: theme.space["4"],
  },
  logoRow: {
    marginBottom: theme.space["6"],
  },
  nav: {
    flex: 1,
    gap: theme.space["1"],
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"],
    minHeight: theme.chrome.hitMin,
    paddingHorizontal: theme.space["3"],
    borderRadius: theme.radius.md,
  },
  itemActive: {
    backgroundColor: theme.colors.primarySoft,
  },
  itemLabel: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
  },
  itemLabelActive: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.accent,
  },
  foot: {
    marginTop: theme.space["6"],
  },
}));

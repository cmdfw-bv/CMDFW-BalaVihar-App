import "../lib/unistyles";
import { View, Text, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabIcon } from "./icons/TabIcons";
import { activeSidebarTab } from "./activeSidebarTab";
import { TAB_TITLES } from "../lib/auth/navMap";
import type { TabKey } from "../lib/auth/navMap";

// Narrow local slice of React Navigation's BottomTabBarProps (same narrowing as
// DesktopSidebar — avoids importing the type from expo-router's internal build path).
// Matches the design mirror's bv-connect/screens/phone/screen.css `.tabbar`/`.tab`: a
// continuous surface-colored bar with a top border, not the platform-default bottom tabs
// (unstyled white bg + default RN Navigation blue) that render below breakpoint 768 today.
type MobileTabBarProps = {
  state: { routes: { key: string; name: string }[]; index: number };
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
  visible: Set<TabKey>;
};

export default function MobileTabBar({ state, navigation, visible }: MobileTabBarProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const active = activeSidebarTab(
    state.routes.map((r) => r.name),
    state.index,
  );

  return (
    <View style={[styles.bar, { paddingBottom: theme.space["2"] + insets.bottom }]}>
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
              style={styles.tab}
              onPress={() => {
                const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!isActive && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            >
              <TabIcon tab={tab} size={22} color={isActive ? theme.colors.accent : theme.colors.ink4} />
              <Text style={[styles.label, isActive && styles.labelActive]}>{TAB_TITLES[tab]}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: "row",
    minHeight: theme.chrome.tabbar,
    backgroundColor: theme.colors.appSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
    paddingTop: theme.space["2"],
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space["1"],
    minHeight: theme.chrome.hitMin,
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.ink4,
  },
  labelActive: {
    color: theme.colors.accent,
  },
}));

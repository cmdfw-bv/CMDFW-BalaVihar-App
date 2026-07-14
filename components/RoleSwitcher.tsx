import { View, Text, Pressable } from "react-native";
// Direct side-effect import (not just relying on app/_layout.tsx importing it first): Expo
// Router's static-export manifest builder (getBuildTimeServerManifestAsync -> getRoutes ->
// loadRoute) requires app/(tabs)/_layout.tsx standalone, outside the real render tree, so
// root layout's own "../lib/unistyles" import never runs first in that pass. Any module-scope
// StyleSheet.create() reachable from a layout's top-level imports must pull the config in
// itself. Metro dedupes by resolved path, so StyleSheet.configure() still only runs once.
// Confirmed via `npx expo export --platform web` (2026-07-13): fails without this import,
// passes with it. See issue #29.
import "../lib/unistyles";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSession } from "../lib/auth/SessionProvider";
import type { lightTheme } from "../lib/theme";

type RoleKey = keyof (typeof lightTheme)["colors"]["roles"];

function roleColor(theme: typeof lightTheme, role: string | null) {
  return theme.colors.roles[role as RoleKey] ?? theme.colors.ink3;
}

type RoleSwitcherProps = {
  // Row (default): fits the wide, fixed-height phone/desktop top header — pills shrink +
  // ellipsize rather than wrap, since a native header can't grow to fit a wrapped row.
  // Column: fits DesktopSidebar's narrow-but-tall rail footer — pills stack instead of
  // spilling past the rail's fixed width.
  stacked?: boolean;
};

export default function RoleSwitcher({ stacked = false }: RoleSwitcherProps) {
  const { myRoles, switchRole, signOut, activeRole, scopeType, scopeId } = useSession();
  const { theme } = useUnistyles();
  const containerStyle = [styles.container, stacked && styles.containerStacked];

  if (myRoles.length < 2) {
    // Static, non-interactive context chip — single-role accounts (AC#6).
    return (
      <View style={containerStyle}>
        <View style={[styles.badge, { backgroundColor: roleColor(theme, activeRole) }]}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {activeRole} · {scopeType} · {scopeId ?? "—"}
          </Text>
        </View>
        <Pressable style={styles.signOut} onPress={() => signOut()} hitSlop={8}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      {myRoles.map((r) => (
        <Pressable
          key={r.id}
          style={[
            styles.badge,
            styles.badgePressable,
            r.role === activeRole && styles.badgeActive,
            { backgroundColor: roleColor(theme, r.role) },
          ]}
          onPress={() => switchRole(r.id)}
        >
          <Text style={styles.badgeText} numberOfLines={1}>
            {r.role} · {r.scope_type} · {r.scope_id ?? "—"}
          </Text>
        </Pressable>
      ))}
      <Pressable style={styles.signOut} onPress={() => signOut()} hitSlop={8}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.xs,
    paddingHorizontal: theme.space.sm,
    minHeight: theme.chrome.hitMin,
    maxWidth: "100%",
  },
  containerStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    paddingHorizontal: 0,
  },
  badge: {
    maxWidth: "100%",
    flexShrink: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space["1"],
    justifyContent: "center",
  },
  badgePressable: {
    minHeight: theme.chrome.hitMin,
  },
  badgeActive: {
    borderWidth: 2,
    borderColor: theme.colors.ink,
  },
  badgeText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    color: theme.colors.onDark,
  },
  signOut: {
    minHeight: theme.chrome.hitMin,
    paddingHorizontal: theme.space.sm,
    justifyContent: "center",
  },
  signOutText: {
    fontFamily: theme.fonts.medium,
    fontSize: theme.type.scale.xs,
    color: theme.colors.accent,
  },
}));

import { useState } from "react";
import { View, Text, Pressable, Modal } from "react-native";
// Direct side-effect import (not just relying on app/_layout.tsx importing it first): Expo
// Router's static-export manifest builder (getBuildTimeServerManifestAsync -> getRoutes ->
// loadRoute) requires app/(tabs)/_layout.tsx standalone, outside the real render tree, so
// root layout's own "../lib/unistyles" import never runs first in that pass. Any module-scope
// StyleSheet.create() reachable from a layout's top-level imports must pull the config in
// itself. Metro dedupes by resolved path, so StyleSheet.configure() still only runs once.
// Confirmed via `npx expo export --platform web` (2026-07-13): fails without this import,
// passes with it. See issue #29.
import "../lib/unistyles";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useSession } from "../lib/auth/SessionProvider";
import { appHeaderSubtitle } from "./appHeaderSubtitle";
import type { lightTheme } from "../lib/theme";

type RoleKey = keyof (typeof lightTheme)["colors"]["roles"];

function roleColor(theme: typeof lightTheme, role: string | null) {
  return theme.colors.roles[role as RoleKey] ?? theme.colors.ink3;
}

type RoleSwitcherProps = {
  // Row (default): fits the wide, fixed-height phone/desktop top header. Column: fits
  // DesktopSidebar's narrow rail footer — trigger above, sign-out below instead of beside.
  // Matches the design mirror's single-trigger PersonaSwitcher at every width — this prop only
  // ever rearranges the trigger + sign-out pair, never a list of pills (that list lives inside
  // the modal sheet below, sized to its own bottom-sheet layout regardless of header width).
  stacked?: boolean;
};

export default function RoleSwitcher({ stacked = false }: RoleSwitcherProps) {
  const { myRoles, switchRole, signOut, activeRole, scopeType, scopeLabel } = useSession();
  const { theme } = useUnistyles();
  const [open, setOpen] = useState(false);
  const containerStyle = [styles.container, stacked ? styles.containerStacked : styles.containerHeader];
  const activeLabel = appHeaderSubtitle(activeRole, scopeType, scopeLabel);

  if (myRoles.length < 2) {
    // Static, non-interactive context chip — single-role accounts (AC#6).
    return (
      <View style={containerStyle}>
        <View style={[styles.chip, { backgroundColor: roleColor(theme, activeRole) }]}>
          <Text style={styles.chipText} numberOfLines={1}>
            {activeLabel}
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
      {/* Matches the design mirror's PersonaSwitcher — one compact trigger showing the active
          role, never one pill per held role (that list belongs in the sheet below). Fixes the
          360px header overflow the previous one-pill-per-role render caused (issue #31). */}
      <Pressable
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Switch active role"
        accessibilityHint="Opens a sheet to switch which role is active"
      >
        <View style={[styles.dot, { backgroundColor: roleColor(theme, activeRole) }]} />
        <Text style={styles.triggerText} numberOfLines={1}>
          {activeLabel}
        </Text>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.colors.ink4} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M6 9l6 6 6-6" />
        </Svg>
      </Pressable>
      <Pressable style={styles.signOut} onPress={() => signOut()} hitSlop={8}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} accessibilityLabel="Close role switcher">
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.grabber} />
            <Text style={styles.sheetHint}>Switch active role — re-scopes your data</Text>
            {myRoles.map((r) => {
              const isActive = r.role === activeRole;
              return (
                <Pressable
                  key={r.id}
                  style={[styles.row, isActive && styles.rowActive]}
                  onPress={() => {
                    setOpen(false);
                    switchRole(r.id);
                  }}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={[styles.dot, styles.rowDot, { backgroundColor: roleColor(theme, r.role) }]} />
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {appHeaderSubtitle(r.role, r.scope_type, r.scope_label)}
                  </Text>
                  {isActive ? (
                    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={theme.colors.accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M5 12l4 4L19 6" />
                    </Svg>
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    paddingHorizontal: theme.space.sm,
    minHeight: theme.chrome.hitMin,
    maxWidth: "100%",
  },
  containerStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: theme.space["1"],
    paddingHorizontal: 0,
  },
  containerHeader: {
    flexShrink: 1,
    maxWidth: "58%",
  },
  chip: {
    maxWidth: "100%",
    flexShrink: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space["1"],
    justifyContent: "center",
  },
  chipText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    color: theme.colors.onDark,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["1"],
    maxWidth: "100%",
    flexShrink: 1,
    minHeight: theme.chrome.hitMin,
    paddingHorizontal: theme.space.sm,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.line2,
    backgroundColor: theme.colors.surface,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },
  triggerText: {
    flexShrink: 1,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink2,
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
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: theme.chrome.maxw,
    backgroundColor: theme.colors.canvas,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.space.md,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.lg,
  },
  grabber: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: theme.colors.line2,
    alignSelf: "center",
    marginBottom: theme.space.md,
  },
  sheetHint: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow,
    letterSpacing: theme.type.tracking.eyebrow,
    textTransform: "uppercase",
    color: theme.colors.ink4,
    marginBottom: theme.space.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    minHeight: theme.chrome.hitMin,
    paddingHorizontal: theme.space.sm,
    paddingVertical: theme.space["2"],
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.space["1"],
  },
  rowActive: {
    borderColor: theme.colors.accent,
  },
  rowDot: {
    width: 11,
    height: 11,
  },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink,
  },
}));

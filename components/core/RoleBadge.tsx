import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { roleBadgeMeta, type RoleKey } from "./RoleBadge.logic";
import { colorAtPath } from "./tokenPath";

// Matches design/sankalp/components/core/RoleBadge.jsx — role-hued capsule with optional mono
// scope, for the multi-persona / access-scope model. Role hues are data-coding only — never
// page or action colors.
export interface RoleBadgeProps {
  role?: RoleKey;
  /** Override the visible name (defaults to the role's label). */
  label?: React.ReactNode;
  /** Optional mono scope label (e.g. "JR·A", "BRAMPTON"). */
  scope?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function RoleBadge({ role = "student", label, scope, style }: RoleBadgeProps) {
  const meta = roleBadgeMeta(role);

  return (
    <View style={[styles.badge, style]}>
      <View style={styles.dot(meta.colorTokenKey)} />
      <Text style={styles.label}>{label ?? meta.label}</Text>
      {scope ? (
        <View style={styles.scopeWrap}>
          <Text style={styles.scope}>{scope}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["2"], // 8px — nearest token to the reference's 7px
    paddingHorizontal: theme.space["3"], // 12px — nearest token to the reference's 11px
    paddingVertical: theme.space["1"], // 4px — nearest token to the reference's 5px
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  dot: (colorTokenKey: string) => ({
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colorAtPath(theme.colors, colorTokenKey),
  }),
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink2,
  },
  scopeWrap: {
    // Deliberate literal — 6px sits exactly between space.1=4 and space.2=8, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    paddingLeft: 6,
    marginLeft: 2,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.line,
  },
  scope: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow, // 11 — nearest token to the reference's 10.5px
    letterSpacing: theme.type.tracking.mono,
    color: theme.colors.ink4,
  },
}));

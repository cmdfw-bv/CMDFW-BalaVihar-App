import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { statusChipStyle, statusChipShowsDot, type StatusChipStatus } from "./StatusChip.logic";
import { colorAtPath } from "./tokenPath";

// Matches design/sankalp/components/core/StatusChip.jsx — uppercase capsule status marker.
export interface StatusChipProps {
  status?: StatusChipStatus;
  /** Force the leading dot on/off (defaults on for open & present). */
  dot?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function StatusChip({ status = "neutral", dot, children, style }: StatusChipProps) {
  const c = statusChipStyle(status);
  const showDot = statusChipShowsDot(status, dot);

  return (
    <View style={[styles.chip(c), style]}>
      {showDot ? <View style={styles.dot(c)} /> : null}
      <Text style={styles.label(c)}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: (c: { bg: string; fg: string; border: string }) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    // Deliberate literal — 6px (matches StatusChip.jsx's gap: 6) sits exactly between
    // space.1=4 and space.2=8, neither is a closer fit, so this is disclosed rather than
    // silently rounded.
    gap: 6,
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    paddingHorizontal: 10,
    paddingVertical: theme.space["1"], // 4px
    borderRadius: theme.radius.pill,
    backgroundColor: colorAtPath(theme.colors, c.bg),
    borderWidth: 1,
    borderColor: colorAtPath(theme.colors, c.border),
  }),
  dot: (c: { dot: string }) => ({
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colorAtPath(theme.colors, c.dot),
  }),
  label: (c: { fg: string }) => ({
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    letterSpacing: 0.16,
    textTransform: "uppercase" as const,
    color: colorAtPath(theme.colors, c.fg),
  }),
}));

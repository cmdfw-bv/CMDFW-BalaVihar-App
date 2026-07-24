import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { statTileValueStyle } from "./StatTile.logic";
import { colorAtPath } from "./tokenPath";

// Matches design/sankalp/components/core/StatTile.jsx — a single figure with an uppercase label.
export interface StatTileProps {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Render the value in the large display serif (hero stats) instead of mono. */
  display?: boolean;
  /** Color the figure terracotta. */
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function StatTile({ label, value, display = false, accent = false, style }: StatTileProps) {
  const v = statTileValueStyle(display, accent);

  return (
    <View style={[styles.wrap, style]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value(v)}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flexDirection: "column",
    gap: theme.space["2"],
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.eyebrow,
    letterSpacing: theme.type.tracking.eyebrow,
    textTransform: "uppercase" as const,
    color: theme.colors.ink4,
  },
  value: (v: { fontFamily: 'display' | 'mono'; colorTokenKey: string }) =>
    v.fontFamily === "display"
      ? {
          // Marcellus is single-weight — no fontWeight alongside theme.fonts.display.
          fontFamily: theme.fonts.display,
          fontSize: 44,
          lineHeight: 44,
          color: colorAtPath(theme.colors, v.colorTokenKey),
        }
      : {
          fontFamily: theme.fonts.mono,
          fontSize: 28,
          lineHeight: 28,
          fontVariant: ["tabular-nums" as const],
          color: colorAtPath(theme.colors, v.colorTokenKey),
        },
}));

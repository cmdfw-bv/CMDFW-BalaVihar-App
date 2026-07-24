import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { clampPercent, complianceTone, TONE_TOKEN_KEYS, type ComplianceTone } from "./ComplianceBar.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/dashboard/ComplianceBar.jsx — a labelled
// progress bar for a single metric (attendance, update compliance, approvals). Tone
// auto-derives from the value unless set explicitly; the figure is mono-tabular so rows align.
export interface ComplianceBarProps {
  label?: React.ReactNode;
  /** 0–100. Tone auto-derives (>=85 success, >=70 warning, else danger). */
  value?: number;
  /** Unit appended to value (default "%"). */
  suffix?: string;
  /** Override the displayed figure (e.g. "47/50"); bar fill still uses value. */
  display?: React.ReactNode;
  note?: React.ReactNode;
  /** Force the tone instead of deriving from value. */
  status?: ComplianceTone;
  style?: StyleProp<ViewStyle>;
}

export default function ComplianceBar({ label, value = 0, suffix = "%", display, note, status, style }: ComplianceBarProps) {
  const tone = complianceTone(value, status);
  const pct = clampPercent(value);

  return (
    <View style={style}>
      <View style={styles.header}>
        {label != null ? <Text style={styles.label} numberOfLines={1}>{label}</Text> : null}
        <Text style={styles.figure(tone)}>{display != null ? display : `${value}${suffix}`}</Text>
      </View>
      <View style={styles.track}>
        <View style={styles.fill(tone, pct)} />
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space["3"],
  },
  label: {
    flexShrink: 1,
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.lead,
    letterSpacing: theme.type.tracking.display,
    color: theme.colors.ink,
  },
  // JetBrains Mono (theme.fonts.mono) is single-weight — no fontWeight paired here
  // (StatTile.tsx/AuditEntry.tsx precedent).
  figure: (tone: ComplianceTone) => ({
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.sm,
    fontVariant: ["tabular-nums" as const],
    letterSpacing: theme.type.tracking.mono,
    color: colorAtPath(theme.colors, TONE_TOKEN_KEYS[tone]),
  }),
  track: {
    height: theme.space["2"], // 8px, matches the reference's track height
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: "hidden" as const,
    marginTop: theme.space["3"],
  },
  fill: (tone: ComplianceTone, pct: number) => ({
    height: "100%" as const,
    borderRadius: theme.radius.pill,
    width: `${pct}%` as const,
    backgroundColor: colorAtPath(theme.colors, TONE_TOKEN_KEYS[tone]),
  }),
  note: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink3,
    marginTop: theme.space["3"],
  },
}));

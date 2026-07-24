import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { clampPercent, complianceDisplayState, TONE_TOKEN_KEYS, type ComplianceDisplayState, type ComplianceTone } from "./ComplianceBar.logic";
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
  /** No data yet — render an honest "—" (mono, ink4) instead of a value-derived figure/fill. */
  placeholder?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ComplianceBar({ label, value = 0, suffix = "%", display, note, status, placeholder = false, style }: ComplianceBarProps) {
  const state = complianceDisplayState(value, status, placeholder);
  const pct = placeholder ? 0 : clampPercent(value);

  return (
    <View style={style}>
      <View style={styles.header}>
        {label != null ? <Text style={styles.label} numberOfLines={1}>{label}</Text> : null}
        <Text style={styles.figure(state)}>{placeholder ? "—" : display != null ? display : `${value}${suffix}`}</Text>
      </View>
      <View style={styles.track}>
        <View style={styles.fill(state, pct)} />
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
  figure: (state: ComplianceDisplayState) => ({
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.sm,
    fontVariant: ["tabular-nums" as const],
    letterSpacing: theme.type.tracking.mono,
    color: state === "placeholder" ? theme.colors.ink4 : colorAtPath(theme.colors, TONE_TOKEN_KEYS[state]),
  }),
  track: {
    height: theme.space["2"], // 8px, matches the reference's track height
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceAlt,
    overflow: "hidden" as const,
    marginTop: theme.space["3"],
  },
  fill: (state: ComplianceDisplayState, pct: number) => ({
    height: "100%" as const,
    borderRadius: theme.radius.pill,
    width: `${pct}%` as const,
    backgroundColor: state === "placeholder" ? theme.colors.line2 : colorAtPath(theme.colors, TONE_TOKEN_KEYS[state]),
  }),
  note: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink3,
    marginTop: theme.space["3"],
  },
}));

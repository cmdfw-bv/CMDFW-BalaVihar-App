import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { auditActionMeta, type AuditAction } from "./AuditEntry.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/privacy/AuditEntry.jsx — one mono line in the
// minors'-access audit log: timestamp · actor (role:scope) · action · target.
//
// Privacy: this component performs ZERO side effects. `time`/`actor`/`target` are opaque
// ReactNode/string props rendered as-is via <Text> — never parsed, reformatted, derived from,
// logged (`console.*`), or sent to analytics/any side channel. Callers own what these fields
// contain; this component only paints them.
export interface AuditEntryProps {
  /** Timestamp (mono, tabular). Opaque — rendered as-is, never parsed. */
  time?: React.ReactNode;
  /** Actor, e.g. "teacher:JR·A" or "coordinator". Opaque — rendered as-is. */
  actor?: React.ReactNode;
  /** Action verb → color. */
  action?: AuditAction;
  /** What was accessed, e.g. "student #3 record". Opaque — rendered as-is. */
  target?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function AuditEntry({ time, actor, action = "view", target, style }: AuditEntryProps) {
  const meta = auditActionMeta(action);

  return (
    <View style={[styles.row, style]}>
      <Text style={styles.time}>{time}</Text>
      <Text style={styles.actor}>{actor}</Text>
      <Text style={styles.action(meta.colorTokenKey)}>{meta.label}</Text>
      <Text style={styles.target} numberOfLines={1} ellipsizeMode="tail">
        {target}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["2"], // 8px, nearest token to the reference's 10px row gap
    paddingHorizontal: theme.space["3"], // 12px
    paddingVertical: theme.space["2"], // 8px, nearest token to the reference's "9px 12px"
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  // JetBrains Mono (theme.fonts.mono) is single-weight, same precedent as StatTile.tsx and
  // Comment.tsx's Marcellus note — no fontWeight is paired with it anywhere in this row,
  // including the reference's fontWeight: 600 on the action label.
  time: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.xs, // nearest scale token to the reference's 11.5px
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink4,
    flexShrink: 0,
    fontVariant: ["tabular-nums" as const],
  },
  actor: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink2,
    flexShrink: 0,
  },
  action: (colorTokenKey: string) => ({
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: colorAtPath(theme.colors, colorTokenKey),
    flexShrink: 0,
  }),
  target: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink,
  },
}));

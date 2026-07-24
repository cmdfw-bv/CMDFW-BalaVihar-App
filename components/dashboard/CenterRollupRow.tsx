import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import ListRow from "../core/ListRow";
import { rollupMeta } from "./CenterRollupRow.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/dashboard/CenterRollupRow.jsx — one center in
// the org-level (BV Coordinator) rollup: center name, a headline attendance %, marked/enrolled,
// and an honest "—" for centers with no data yet. Built on top of core/ListRow (leading/title/
// subtitle/trailing slots) per the Stage 9 brief — the reference's own progress bar lives in its
// left column (a slot ListRow doesn't expose), so the trailing slot here carries the tone-colored
// figure alone, matching the reference's own right-side visual density (which never puts a bar
// there either).
export interface CenterRollupRowProps {
  name?: React.ReactNode;
  region?: React.ReactNode;
  /** Attendance percent (0-100). */
  attendance?: number;
  marked?: number;
  enrolled?: number;
  /** No data yet — render an honest "—" instead of figures. */
  placeholder?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function CenterRollupRow({
  name,
  region,
  attendance,
  marked,
  enrolled,
  placeholder = false,
  onPress,
  style,
}: CenterRollupRowProps) {
  const { theme } = useUnistyles();
  const meta = rollupMeta(attendance, placeholder);
  const tone = colorAtPath(theme.colors, meta.toneTokenKey);
  // Reference: `(name || "?").trim().charAt(0)` — guard for string type since `name` is now
  // `React.ReactNode` to match the design mirror's `.d.ts` (ConversationRow.tsx precedent).
  const initial = typeof name === "string" ? (name.trim() || "?").charAt(0) : "?";
  const hasCounts = typeof marked === "number" && typeof enrolled === "number";

  return (
    <View style={style}>
      <ListRow
        onPress={onPress}
        leading={
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{initial}</Text>
          </View>
        }
        title={name}
        subtitle={region}
        trailing={
          <View style={styles.trailingWrap}>
            <Text style={styles.figure(placeholder, tone)}>{meta.display}</Text>
            {!placeholder && hasCounts ? (
              <Text style={styles.counts}>{marked}/{enrolled}</Text>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  avatar: {
    // theme.chrome.hitMin (44) doubles as ConversationRow.tsx's precedent avatar diameter.
    width: theme.chrome.hitMin,
    height: theme.chrome.hitMin,
    borderRadius: theme.chrome.hitMin / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.colors.scope.center,
  },
  avatarLabel: {
    // Marcellus is single-weight — no fontWeight paired here.
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.lead,
    color: theme.colors.onAction,
  },
  trailingWrap: {
    flexDirection: "column" as const,
    alignItems: "flex-end" as const,
    gap: theme.space["1"],
  },
  // JetBrains Mono (theme.fonts.mono) is single-weight — no fontWeight paired here
  // (StatTile.tsx/AuditEntry.tsx precedent).
  figure: (placeholder: boolean, tone: string) => ({
    fontFamily: theme.fonts.mono,
    // Nearest scale token to the reference's 18/19px figures.
    fontSize: theme.type.scale.lead,
    fontVariant: ["tabular-nums" as const],
    letterSpacing: theme.type.tracking.mono,
    color: placeholder ? theme.colors.ink4 : tone,
  }),
  counts: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.ink4,
    fontVariant: ["tabular-nums" as const],
  },
}));

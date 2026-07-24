import "../../lib/unistyles";
import * as React from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { csvImportPhase } from "./CsvImport.logic";

// Matches design/sankalp/bv-connect/components/admin/CsvImport.jsx — enrollment import
// control. A dropzone before a file is chosen; a parsed summary (rows ready / flagged) after.
// Presentational only — `onChoose`/`onConfirm` are callback props; this component never parses
// a real file or uploads anything itself (that seam is future feature-owner wiring).
export interface CsvImportProps {
  /** When set, switches from dropzone to parsed-summary state. */
  fileName?: string;
  total?: number;
  ready?: number;
  flagged?: number;
  /** Open the file picker / replace the file. */
  onChoose?: () => void;
  /** Confirm the import. */
  onConfirm?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function CsvImport({ fileName, total = 0, ready = 0, flagged = 0, onChoose, onConfirm, style }: CsvImportProps) {
  const { theme } = useUnistyles();
  const phase = csvImportPhase(fileName);

  return (
    <View style={style}>
      {phase === "dropzone" ? (
        <Pressable onPress={onChoose} style={styles.dropzone} accessibilityRole="button">
          <View style={styles.dropIconWrap}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={theme.colors.primary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <Path d="M17 8l-5-5-5 5" />
              <Path d="M12 3v12" />
            </Svg>
          </View>
          <Text style={styles.dropTitle}>Upload enrollment CSV</Text>
          <Text style={styles.dropHelp}>One row per student · columns: name, family ID, class, parent email.</Text>
        </Pressable>
      ) : (
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <View style={styles.fileIconWrap}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.present} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <Path d="M14 2v6h6" />
              </Svg>
            </View>
            <View style={styles.fileMeta}>
              <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
              <Text style={styles.rowsParsed}>{total} rows parsed</Text>
            </View>
            <Pressable onPress={onChoose} style={styles.replaceBtn} accessibilityRole="button">
              <Text style={styles.replaceLabel}>Replace</Text>
            </Pressable>
          </View>
          <View style={styles.statsRow}>
            <View style={[styles.statCell, styles.statCellDivider]}>
              <Text style={styles.statValue(theme.colors.status.present)}>{ready}</Text>
              <Text style={styles.statLabel}>Ready</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue(flagged ? theme.colors.status.absent : theme.colors.ink4)}>{flagged}</Text>
              <Text style={styles.statLabel}>Flagged</Text>
            </View>
          </View>
          <View style={styles.confirmWrap}>
            <Pressable onPress={onConfirm} style={styles.confirmBtn} accessibilityRole="button">
              <Text style={styles.confirmLabel}>Import {ready} students</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  dropzone: {
    width: "100%" as const,
    flexDirection: "column" as const,
    alignItems: "center" as const,
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, neither is a
    // closer fit, so this is disclosed rather than silently rounded (StatusChip.tsx precedent).
    gap: 10,
    paddingVertical: theme.space["8"], // 32px — nearest token to the reference's 30px
    paddingHorizontal: theme.space["5"], // 20px, exact match to the reference's 20px
    backgroundColor: theme.colors.appSurface2,
    borderWidth: 1.5,
    borderStyle: "dashed" as const,
    borderColor: theme.colors.line2,
    borderRadius: theme.radius.card,
  },
  dropIconWrap: {
    width: theme.space["12"], // 48px — nearest token to the reference's 46px
    height: theme.space["12"],
    borderRadius: theme.space["12"] / 2,
    backgroundColor: theme.colors.appSurface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  dropTitle: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm, // 14 — nearest token to the reference's 14.5px
    color: theme.colors.ink,
  },
  dropHelp: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs, // 13 — nearest token to the reference's 12.5px
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink3,
    textAlign: "center" as const,
  },
  summaryCard: {
    backgroundColor: theme.colors.appSurface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.card,
    overflow: "hidden" as const,
  },
  summaryHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, same tie as
    // dropzone's gap above.
    gap: 10,
    paddingVertical: theme.space["3"], // 12px — nearest token to the reference's 13px
    paddingHorizontal: theme.space["4"], // 16px — nearest token to the reference's 15px
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  fileIconWrap: {
    width: theme.space["8"], // 32px — nearest token to the reference's 34px
    height: theme.space["8"],
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.statusRamp.presentSoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
  },
  fileMeta: {
    flex: 1,
    minWidth: 0,
  },
  // 13.5px sits exactly equidistant between xs=13 and sm=14; picking sm since this is the row's
  // title-weight text (ListRow.tsx's own `title` style is sm for the same reason).
  fileName: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink,
  },
  rowsParsed: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow, // 11, exact match to the reference's 11px
    color: theme.colors.ink4,
    fontVariant: ["tabular-nums" as const],
  },
  // fontSize 12 in the reference sits equidistant between eyebrow=11 and xs=13; picking xs to
  // match Button.tsx's sm-size secondary-label token (this is a ghost/secondary button label).
  replaceBtn: {
    borderWidth: 1,
    borderColor: theme.colors.line2,
    backgroundColor: "transparent",
    borderRadius: theme.radius.pill,
    // Deliberate literal — 6px sits exactly between space.1=4 and space.2=8, neither is a closer
    // fit, so this is disclosed rather than silently rounded (StatusChip.tsx precedent).
    paddingVertical: 6,
    paddingHorizontal: theme.space["3"], // 12px, exact match
    minHeight: theme.chrome.hitMin, // 44px — satisfies the global >=44px touch target
  },
  replaceLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink2,
  },
  statsRow: {
    flexDirection: "row" as const,
  },
  statCell: {
    flex: 1,
    paddingVertical: theme.space["3"], // 12px — nearest token to the reference's 13px
    paddingHorizontal: theme.space["4"], // 16px — nearest token to the reference's 15px
    alignItems: "center" as const,
  },
  statCellDivider: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.line,
  },
  statValue: (color: string) => ({
    fontFamily: theme.fonts.medium,
    fontSize: theme.type.scale.h3, // 22, exact match to the reference's 22px
    color,
    fontVariant: ["tabular-nums" as const],
  }),
  statLabel: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow, // 11, exact match
    letterSpacing: theme.type.tracking.eyebrow,
    textTransform: "uppercase" as const,
    color: theme.colors.ink4,
    marginTop: 2, // no matching token — small vertical nudge (ListRow.tsx subtitle precedent)
  },
  confirmWrap: {
    padding: theme.space["3"], // 12px, exact match
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  confirmBtn: {
    width: "100%" as const,
    // 44px (chrome.hitMin) — satisfies the global >=44px touch target; nearest available token
    // to the reference's 46px (Button.tsx precedent for button min-height).
    minHeight: theme.chrome.hitMin,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primary,
  },
  confirmLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm, // 14, exact match
    color: theme.colors.onAction,
  },
}));

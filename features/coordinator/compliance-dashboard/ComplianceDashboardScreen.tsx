import "../../../lib/unistyles";
import * as React from "react";
import { ScrollView, View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import StatTile from "../../../components/core/StatTile";
import Card from "../../../components/core/Card";
import StateView from "../../../components/core/StateView";
import ComplianceBar from "../../../components/dashboard/ComplianceBar";
import { useSessionCompliance } from "./useSessionCompliance";

// Matches design/sankalp/bv-connect/screens/desktop/dash.jsx's "Compliance" card composition
// pattern (spec §"Composition"): a StatTile roll-up row, then one Card per class carrying two
// ComplianceBars. No new shared component — everything here is layout only.
export interface ComplianceDashboardScreenProps {
  /** The Coordinator's own active-role scopeId — never a picker, never someone else's session. */
  sessionId: string | null;
}

// window_start/window_end are the only window bounds the RPC returns (no "x of n meetings"
// count) — an honest date-range note, not an invented count (AC5's placeholder principle
// extended to copy, not just figures).
function formatWindowNote(start: string | null, end: string | null): string | undefined {
  if (!start || !end) return undefined;
  const fmt = (d: string) => {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  };
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

export default function ComplianceDashboardScreen({ sessionId }: ComplianceDashboardScreenProps) {
  const { viewState, rows, rollup, showRefreshErrorBanner, retry } = useSessionCompliance(sessionId);

  return (
    // A session's class list is as long as the session has classes (13 for the F3 pilot), so the
    // screen must scroll — a plain View clipped everything past the fold and made the lower
    // classes unreachable (PR #50 review, found in live testing). `wrap` carries `flexGrow` and
    // NOT `flex: 1`: `flex: 1` on a contentContainerStyle pins the content box to the viewport
    // height, which silently defeats scrolling — the same shape of bug this is fixing.
    <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap}>
      <View style={styles.statRow}>
        <StatTile label="Fully compliant" value={rollup.fullyCompliant} style={styles.statcell} />
        <StatTile label="At-risk" value={rollup.atRisk} style={styles.statcell} />
        <StatTile label="Non-compliant" value={rollup.nonCompliant} style={styles.statcell} />
      </View>

      {viewState === "loading" ? (
        <View style={styles.classList}>
          {[0, 1, 2].map((i) => (
            <Card key={i} style={styles.skeletonCard} />
          ))}
        </View>
      ) : (
        <StateView
          state={viewState}
          emptyText="No classes in this session yet."
          errorText="Couldn't load the compliance dashboard."
          onRetry={retry}
        >
          {showRefreshErrorBanner ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>Showing last-loaded data — refresh failed.</Text>
            </View>
          ) : null}
          <View style={styles.classList}>
            {rows.map((row) => (
              <Card key={row.class_id} style={styles.classCard}>
                <Text style={styles.className}>{row.class_name}</Text>
                <Text style={styles.enrolledCaption}>{row.enrolled_count} enrolled</Text>
                <ComplianceBar
                  label="Attendance submission"
                  value={row.attendance_rate ?? 0}
                  placeholder={row.attendance_rate === null}
                  note={row.attendance_rate === null ? undefined : formatWindowNote(row.window_start, row.window_end)}
                />
                <ComplianceBar
                  label="Class updates posted"
                  value={row.update_rate ?? 0}
                  placeholder={row.update_rate === null}
                  note={row.update_rate === null ? undefined : formatWindowNote(row.window_start, row.window_end)}
                  style={styles.secondBar}
                />
              </Card>
            ))}
          </View>
        </StateView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  scroll: {
    flex: 1,
  },
  wrap: {
    flexGrow: 1,
    gap: theme.space["6"],
  },
  statRow: {
    flexDirection: "row",
    flexWrap: "wrap" as const,
    gap: theme.space["4"],
  },
  statcell: {
    minWidth: 140,
    flexGrow: 1,
  },
  classList: {
    gap: theme.space["4"],
  },
  classCard: {
    gap: theme.space["3"],
  },
  skeletonCard: {
    height: 96,
    opacity: 0.4,
  },
  className: {
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.h3,
    color: theme.colors.ink,
  },
  // CenterRollupRow.tsx's muted mono-caption precedent (marked/enrolled counts) — the RPC
  // already returns enrolled_count, this just stops it being dead payload the UI never renders.
  enrolledCaption: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.ink4,
    fontVariant: ["tabular-nums" as const],
  },
  secondBar: {
    marginTop: theme.space["3"],
  },
  errorBanner: {
    borderWidth: 1,
    borderColor: theme.colors.statusRamp.absentLine,
    backgroundColor: theme.colors.statusRamp.absentSoft,
    borderRadius: theme.radius.md,
    padding: theme.space["3"],
    marginBottom: theme.space["3"],
  },
  errorBannerText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.statusRamp.absent,
  },
}));

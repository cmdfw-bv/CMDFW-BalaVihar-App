import "../unistyles";
import * as React from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Card from "../../components/core/Card";
import SegmentedTabs from "../../components/core/SegmentedTabs";
import StatusChip from "../../components/core/StatusChip";
import type { RosterRow } from "./rosterMap";
import type { MarkState } from "./seedMarks";

export interface AttendanceRosterRowProps {
  row: RosterRow;
  mark: MarkState;
  onChange: (enrollmentId: string, status: "present" | "absent") => void;
}

// Design spec §UI "Roster rows" / decision #6 (revised 2026-07-25, PR #49 correction-flow fix):
// SegmentedTabs is always rendered and always interactive, saved or not — this is what makes
// correcting an already-submitted row reachable. StatusChip renders alongside it (never in its
// place) purely as a passive saved-confirmation marker, per its own documented contract. An
// errored row shows no chip and an inline retry note instead, reusing Field's reserved-hint-slot
// visual language (theme.colors.status.absent) per decision #3.
export default function AttendanceRosterRow({ row, mark, onChange }: AttendanceRosterRowProps) {
  return (
    <Card tone="surface" style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>{row.firstName} {row.lastName}</Text>
        <Text style={styles.grade}>{row.gradeLevel}</Text>
      </View>
      <View style={styles.control}>
        <View style={styles.controlRow}>
          <SegmentedTabs
            tabs={["present", "absent"]}
            value={mark.status}
            onChange={(id) => onChange(row.enrollmentId, id as "present" | "absent")}
          />
          {mark.saved ? <StatusChip status={mark.status}>{mark.status}</StatusChip> : null}
        </View>
        {mark.error ? <Text style={styles.errorNote}>Couldn't save — retry</Text> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space["4"],
    marginBottom: theme.space["3"],
  },
  // flex:1 + a floor (not 0) minWidth, mirroring ListRow.tsx's body slot: without the floor,
  // a growing sibling (control, now two pills wide once saved) can squeeze this to ~0 and RN-Web
  // wraps the name one character per line instead of by word (found via /test's 360px design-parity
  // gate, PR #49).
  info: {
    flex: 1,
    minWidth: theme.space["16"],
  },
  name: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.body,
    color: theme.colors.ink,
  },
  grade: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink3,
  },
  // flexShrink:1 + minWidth:0 (mirroring ListRow.tsx's trailing slot) so this slot yields width to
  // `info` under pressure — combined with controlRow's flexWrap, the two pills wrap onto their own
  // line rather than forcing `info` toward zero width.
  control: {
    flexShrink: 1,
    minWidth: 0,
    alignItems: "flex-end",
    gap: theme.space["1"],
  },
  controlRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.space["2"],
  },
  errorNote: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.status.absent,
  },
}));

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

// Design spec §UI "Roster rows" / decision #5 & #3: SegmentedTabs pre-submit (editable), StatusChip
// once saved. An errored row stays editable (never swaps to StatusChip) with an inline retry note,
// reusing Field's reserved-hint-slot visual language (theme.colors.status.absent) per decision #3.
export default function AttendanceRosterRow({ row, mark, onChange }: AttendanceRosterRowProps) {
  return (
    <Card tone="surface" style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.name}>{row.firstName} {row.lastName}</Text>
        <Text style={styles.grade}>{row.gradeLevel}</Text>
      </View>
      <View style={styles.control}>
        {mark.saved ? (
          <StatusChip status={mark.status}>{mark.status}</StatusChip>
        ) : (
          <SegmentedTabs
            tabs={["present", "absent"]}
            value={mark.status}
            onChange={(id) => onChange(row.enrollmentId, id as "present" | "absent")}
          />
        )}
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
  info: {
    flex: 1,
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
  control: {
    alignItems: "flex-end",
    gap: theme.space["1"],
  },
  errorNote: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.status.absent,
  },
}));

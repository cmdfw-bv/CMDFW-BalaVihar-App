import "../../lib/unistyles";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
import { useSession } from "../../lib/auth/SessionProvider";
import { ParentAttendanceScreen } from "../../lib/attendance/parent/ParentAttendanceScreen";
import { useAttendanceRoster } from "../../lib/attendance/useAttendanceRoster";
import AttendanceRosterRow from "../../lib/attendance/AttendanceRosterRow";
import DateNav from "../../lib/attendance/DateNav";
import StateView from "../../components/core/StateView";
import RoleBadge from "../../components/core/RoleBadge";
import Button from "../../components/core/Button";

// Two personas share this one route: Teacher marks a roster (issue #20), Parent reads their own
// children's attendance (issue #22). They are split into sibling components rather than branched
// inside one, so each owns its own hooks.
//
// Why the split matters, beyond rules-of-hooks: `useAttendanceRoster` calls
// `get_class_roster_for_staff`, which is role-gated and writes an `action='denied'` audit_log row
// for an unauthorized caller (20260709040853_audit_log_and_staff_rpcs.sql:99). Branching *after*
// the hook would make every Parent visit to this tab emit a denied audit row — audit noise on a
// minors'-data governance surface, not just a wasted request.
export default function AttendanceScreen() {
  useRoleGuard("attendance");
  const { activeRole } = useSession();

  if (activeRole === "parent") return <ParentAttendanceScreen />;
  return <TeacherAttendanceScreen />;
}

function TeacherAttendanceScreen() {
  const { scopeId } = useSession();
  const { status, rows, marks, header, dateBounds, selectedDate, goToPrevious, goToNext, markLocal, submit, retryFailed, retry, isSubmitting } =
    useAttendanceRoster(scopeId ?? "");

  const failedCount = Object.values(marks).filter((m) => m.error).length;
  const allSaved = rows.length > 0 && rows.every((r) => marks[r.enrollmentId]?.saved);

  return (
    <View style={styles.container}>
      <StateView
        state={status}
        emptyText="No active students are enrolled in this class yet."
        errorText="Couldn't load your roster. Check your connection and try again."
        onRetry={retry}
      >
        {header ? (
          <View style={styles.header}>
            <RoleBadge role="teacher" scope={header.className} />
            <Text style={styles.schedule}>{header.scheduleLabel}</Text>
          </View>
        ) : null}
        <DateNav selectedDate={selectedDate} dateBounds={dateBounds} onPrevious={goToPrevious} onNext={goToNext} />
        <View style={styles.list}>
          {rows.map((row) => (
            <AttendanceRosterRow key={row.enrollmentId} row={row} mark={marks[row.enrollmentId]} onChange={markLocal} />
          ))}
        </View>
        <Button variant="primary" size="lg" fullWidth disabled={isSubmitting} onClick={failedCount > 0 ? retryFailed : submit}>
          {isSubmitting ? "Submitting…" : failedCount > 0 ? `Retry (${failedCount} failed)` : allSaved ? "Submitted" : "Submit"}
        </Button>
      </StateView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    padding: theme.space["4"],
    gap: theme.space["4"],
  },
  header: {
    gap: theme.space["1"],
  },
  schedule: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
  },
  list: {
    flex: 1,
  },
}));

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

// Three roles reach this route: `ROLE_TABS` (navMap.ts) grants `attendance` to student, parent and
// teacher, and `useRoleGuard` only redirects a role that is *out* of scope for the tab — so all
// three mount this screen. Each gets its own sibling component rather than a branch inside one, so
// each owns its own hooks.
//
// Why the split matters, beyond rules-of-hooks: `useAttendanceRoster` calls
// `get_class_roster_for_staff`, which authorizes only teacher/coordinator/bv_coordinator/admin and
// writes an `action='denied'` audit_log row for anyone else
// (20260709040853_audit_log_and_staff_rpcs.sql). Branching *after* the hook would make every
// non-staff visit to this tab emit a denied audit row — audit noise on a minors'-data governance
// surface, not just a wasted request.
//
// An exhaustive `switch` rather than `if (parent) / else` (PR #51 review): the earlier `else`
// silently caught **Student** and mounted the Teacher roster, tripping exactly the denied-audit
// write this split exists to prevent — for the one role that was never considered. A switch forces
// any future role added to `ROLE_TABS.attendance` to be handled deliberately instead of inheriting
// whatever `else` happens to mean.
export default function AttendanceScreen() {
  useRoleGuard("attendance");
  const { activeRole } = useSession();

  switch (activeRole) {
    case "parent":
      return <ParentAttendanceScreen />;
    case "teacher":
      return <TeacherAttendanceScreen />;
    // Student's own attendance view is not built yet (doc 2 Student backlog). Explicit placeholder
    // rather than falling through to the Teacher roster, which would show a marking UI a Student
    // can neither use nor populate — and would audit-log a denial on every visit.
    case "student":
      return <AttendancePlaceholder />;
    default:
      // Unreachable in practice — useRoleGuard redirects every other role off this tab — but the
      // roster hook must not run for an unexpected role, so default to the inert screen.
      return <AttendancePlaceholder />;
  }
}

function AttendancePlaceholder() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderText}>Attendance isn&apos;t available for your role yet.</Text>
    </View>
  );
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
  placeholder: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: theme.space["4"],
  },
  placeholderText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink3,
    textAlign: "center" as const,
  },
}));

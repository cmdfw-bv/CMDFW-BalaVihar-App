import { View, Text } from "react-native";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
import { useSession } from "../../lib/auth/SessionProvider";
import { ParentAttendanceScreen } from "../../lib/attendance/parent/ParentAttendanceScreen";

export default function AttendanceScreen() {
  useRoleGuard("attendance");
  const { activeRole } = useSession();

  if (activeRole === "parent") {
    return <ParentAttendanceScreen />;
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Attendance — placeholder</Text>
    </View>
  );
}

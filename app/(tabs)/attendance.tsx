import { View, Text } from "react-native";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
export default function AttendanceScreen() {
  useRoleGuard("attendance");
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Attendance — placeholder</Text>
    </View>
  );
}

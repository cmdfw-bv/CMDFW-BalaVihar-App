import { View, Text } from "react-native";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
export default function DashboardScreen() {
  useRoleGuard("dashboard");
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Dashboard — placeholder</Text>
    </View>
  );
}

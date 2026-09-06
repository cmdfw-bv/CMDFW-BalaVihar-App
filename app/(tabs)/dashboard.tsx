import { View, Text } from "react-native";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
import { useSession } from "../../lib/auth/SessionProvider";
import ComplianceDashboardScreen from "../../features/coordinator/compliance-dashboard/ComplianceDashboardScreen";

export default function DashboardScreen() {
  useRoleGuard("dashboard");
  const { activeRole, scopeId } = useSession();

  if (activeRole === "coordinator") {
    return <ComplianceDashboardScreen sessionId={scopeId} />;
  }
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Dashboard — placeholder</Text>
    </View>
  );
}

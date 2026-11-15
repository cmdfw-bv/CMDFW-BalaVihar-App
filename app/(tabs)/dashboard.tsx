import "../../lib/unistyles";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
import { useSession } from "../../lib/auth/SessionProvider";
import ComplianceDashboardScreen from "../../features/coordinator/compliance-dashboard/ComplianceDashboardScreen";
import RemovedMessagesCard from "../../features/teacher/chat-message-removal/RemovedMessagesCard";

// Every role this tab admits (coordinator, bv_coordinator, admin) gets the Removed messages card.
// Coordinators also get their session's compliance dashboard below it.
export default function DashboardScreen() {
  useRoleGuard("dashboard");
  const { activeRole, scopeId } = useSession();

  return (
    <View style={styles.wrap}>
      <RemovedMessagesCard />
      {activeRole === "coordinator" ? <ComplianceDashboardScreen sessionId={scopeId} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.space["6"],
  },
}));

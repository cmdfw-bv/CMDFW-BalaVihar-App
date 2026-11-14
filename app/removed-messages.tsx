import "../lib/unistyles";
import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { useRoleGuard } from "../lib/auth/useRoleGuard";
import RemovedMessagesScreen from "../features/teacher/chat-message-removal/RemovedMessagesScreen";

// Reached from the Dashboard's "Removed messages" card. Guarded like the Dashboard tab itself:
// navMap limits "dashboard" to coordinator/bv_coordinator/admin and everyone else is sent to
// /feed (ADR-0014). The database function is the real gate; this only keeps the route tidy.
// Header options are plain objects from the live theme, not StyleSheet.create() values (see
// app/class-update/_layout.tsx for why).
export default function RemovedMessagesRoute() {
  useRoleGuard("dashboard");
  const { theme } = useUnistyles();

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Removed messages",
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.ink,
          headerTitleStyle: { fontFamily: theme.fonts.semibold },
        }}
      />
      <RemovedMessagesScreen />
    </>
  );
}

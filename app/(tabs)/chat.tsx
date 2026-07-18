import { View, Text } from "react-native";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
export default function ChatScreen() {
  useRoleGuard("chat");
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Chat — placeholder</Text>
    </View>
  );
}

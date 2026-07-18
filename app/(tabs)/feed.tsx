import { View, Text } from "react-native";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
export default function FeedScreen() {
  useRoleGuard("feed");
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Feed — placeholder</Text>
    </View>
  );
}

import { View, Text } from "react-native";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";
export default function ClassesScreen() {
  useRoleGuard("classes");
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Classes — placeholder</Text>
    </View>
  );
}

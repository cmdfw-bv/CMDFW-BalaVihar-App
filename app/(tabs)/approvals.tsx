import "../../lib/unistyles";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useRoleGuard } from "../../lib/auth/useRoleGuard";

export default function Approvals() {
  useRoleGuard("approvals");
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Coming soon</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.space.lg },
  text: { fontFamily: theme.fonts.body, fontSize: theme.type.body },
}));

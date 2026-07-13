import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function NoRole() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Your account is set up but no role has been assigned yet — contact your Bala Vihar coordinator.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.space.lg,
  },
  text: {
    width: "100%",
    maxWidth: theme.chrome.maxw,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
    textAlign: "center",
  },
}));

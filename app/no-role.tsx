import "../lib/unistyles";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useAutoRefreshOnRegain } from "../lib/auth/useAutoRefreshOnRegain";
import { useSession } from "../lib/auth/SessionProvider";
import Button from "../components/core/Button";

export default function NoRole() {
  useAutoRefreshOnRegain(60_000);
  const { signOut } = useSession();

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Your account is set up but no role has been assigned yet — contact your Bala Vihar coordinator.
      </Text>
      <Button variant="primary" size="lg" onClick={() => { void signOut(); }}>
        Sign out
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.space.lg,
    gap: theme.space.lg,
  },
  text: {
    width: "100%",
    maxWidth: theme.chrome.maxw,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
    textAlign: "center",
  },
}));

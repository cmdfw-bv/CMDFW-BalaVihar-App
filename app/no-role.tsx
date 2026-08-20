import "../lib/unistyles";
import { useState } from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ROLE_POLL_MS, useAutoRefreshOnRegain } from "../lib/auth/useAutoRefreshOnRegain";
import { performSignOut } from "../lib/auth/performSignOut";
import { supabase } from "../lib/supabase";
import Button from "../components/core/Button";

export default function NoRole() {
  useAutoRefreshOnRegain(ROLE_POLL_MS);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Calls supabase directly rather than SessionProvider's `signOut`, which discards the error
  // (`await supabase.auth.signOut();`). Deliberately NOT routed through the provider: the design
  // spec's refine-stage decision is that this amendment changes no part of SessionProvider's
  // public surface (client-auth-session-and-nav.md:188, :224), and every other lib/auth module
  // already imports `supabase` directly for the same reason (decision #4). Widening the provider
  // would also touch RoleSwitcher, which shares the silent-failure shape — tracked in #64
  // (PR #54 review, @ssrinivas90).
  const onSignOut = () => {
    setBusy(true);
    setFailed(false);
    void performSignOut(() => supabase.auth.signOut()).then((ok) => {
      // On success `Stack.Protected` unmounts this screen, so only the failure path is ever seen.
      if (!ok) setFailed(true);
      setBusy(false);
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Your account is set up but no role has been assigned yet — contact your Bala Vihar coordinator.
      </Text>
      <Button variant="primary" size="lg" disabled={busy} onClick={onSignOut}>
        {busy ? "Signing out…" : "Sign out"}
      </Button>
      {failed ? (
        <Text style={styles.error} accessibilityRole="alert">
          Couldn&apos;t sign out — check your connection and try again.
        </Text>
      ) : null}
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
  error: {
    width: "100%",
    maxWidth: theme.chrome.maxw,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
    textAlign: "center",
    color: theme.colors.status.absent,
  },
}));

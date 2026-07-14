import "../../lib/unistyles";
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";
import Logo from "../../components/brand/Logo";

type ScreenState = "form" | "loading" | "error" | "sent";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ScreenState>("form");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit() {
    setState("loading");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: Linking.createURL("/auth/callback") },
    });
    if (error) {
      // error-preserving: email is not cleared, retry re-submits the same call (AC#11, edge case).
      setErrorMessage(error.message);
      setState("error");
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <View style={styles.container}>
        <View style={styles.form}>
          <View style={styles.logoRow}>
            <Logo size={40} />
          </View>
          <Text style={styles.bodyText}>Check your email for a sign-in link.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <View style={styles.logoRow}>
          <Logo size={40} />
        </View>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
        />
        {state === "error" && <Text style={styles.errorText}>{errorMessage}</Text>}
        {/* One primary action per view (theme.colors.accent) — the DoD gate this whole screen exists to satisfy. */}
        <Pressable
          style={[styles.button, state === "loading" && styles.buttonDisabled]}
          onPress={submit}
          disabled={state === "loading"}
        >
          <Text style={styles.buttonText}>{state === "loading" ? "Sending…" : "Send sign-in link"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space.lg,
  },
  form: {
    width: "100%",
    maxWidth: theme.chrome.maxw,
    gap: theme.space.md,
  },
  logoRow: {
    alignItems: "center",
    marginBottom: theme.space.sm,
  },
  bodyText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
  },
  input: {
    minHeight: theme.chrome.hitMin,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.sm,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
  },
  errorText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.body,
    color: theme.colors.status.absent,
  },
  button: {
    minHeight: theme.chrome.hitMin,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.body,
    color: theme.colors.onAction,
  },
}));

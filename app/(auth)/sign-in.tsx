import "../../lib/unistyles";
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import * as Linking from "expo-linking";
import { useLocalSearchParams } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { supabase } from "../../lib/supabase";
import Logo from "../../components/brand/Logo";

type ScreenState = "form" | "loading" | "error" | "sent";

export default function SignIn() {
  const { theme } = useUnistyles();
  // Set by /auth/callback when a magic link is rejected (expired/already-used/malformed,
  // issue #44) — surfaced here instead of silently landing back on a blank form.
  const { authError } = useLocalSearchParams<{ authError?: string }>();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<ScreenState>(authError ? "error" : "form");
  const [errorMessage, setErrorMessage] = useState(authError ?? "");

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
            <Logo size={44} title="Bala Vihar App" tagline="CMDFW · Dallas–Fort Worth" />
          </View>
          <View style={styles.checkCircle}>
            <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={theme.colors.statusRamp.present} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12l4 4L19 6" />
            </Svg>
          </View>
          <Text style={styles.heading}>Check your email</Text>
          <Text style={styles.bodyText}>
            We sent a sign-in link to <Text style={styles.bodyTextStrong}>{email || "your inbox"}</Text>. It expires in 15 minutes.
          </Text>
          <Pressable style={styles.resendButton} onPress={submit}>
            <Text style={styles.resendText}>Resend link</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <View style={styles.logoRow}>
          <Logo size={44} title="Bala Vihar App" tagline="CMDFW · Dallas–Fort Worth" />
        </View>
        <Text style={styles.heading}>Sign in</Text>
        <Text style={styles.bodyText}>
          Enter the email your coordinator has on file. We&rsquo;ll send a secure sign-in link — no password needed.
        </Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
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
          <Text style={styles.buttonText}>{state === "loading" ? "Sending…" : "Send magic link"}</Text>
        </Pressable>
        <Text style={styles.footerText}>
          Accounts are set up by your center. There&rsquo;s no public sign-up — students never self-register.
        </Text>
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
  heading: {
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.h3,
    color: theme.colors.ink,
  },
  bodyText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    lineHeight: theme.type.scale.sm * theme.type.leading.body,
    color: theme.colors.ink3,
  },
  bodyTextStrong: {
    fontFamily: theme.fonts.semibold,
    color: theme.colors.ink,
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
  footerText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink4,
  },
  checkCircle: {
    alignSelf: "center",
    width: theme.space["12"],
    height: theme.space["12"],
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.statusRamp.presentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  resendButton: {
    minHeight: theme.chrome.hitMin,
    alignItems: "center",
    justifyContent: "center",
  },
  resendText: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    color: theme.colors.accent,
  },
}));

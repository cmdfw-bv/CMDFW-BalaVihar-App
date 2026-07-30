import "../lib/unistyles";
import { useEffect } from "react";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SessionProvider, useSession } from "../lib/auth/SessionProvider";

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { status } = useSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Always declared (not Protected) — "/" needs a route to land on regardless of guard
          state; it immediately redirects via the status-aware logic in app/index.tsx. Once any
          explicit Stack.Screen children exist, Expo Router only navigates screens declared here
          — leaving "index" out (as design decision #4's first sketch did) makes "/" unreachable. */}
      <Stack.Screen name="index" />
      {/* Web's magic-link emailRedirectTo target (see app/auth/callback.tsx) — same reasoning
          as "index" above, must be always-declared or Expo Router 404s the redirect URL. */}
      <Stack.Screen name="auth/callback" />
      {/* Dev-only kit gallery (issue #18) — not reachable from any persona nav map, exists solely
          as a visual/manual verification target for /test. Always-declared for the same reason
          as index/auth/callback above: Stack.Protected groups don't apply here since there's no
          session-gated concern — this route never touches auth state. */}
      <Stack.Screen name="(dev)" />
      <Stack.Protected guard={status === "signed-out"}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={status === "zero-role"}>
        <Stack.Screen name="no-role" />
      </Stack.Protected>
      <Stack.Protected guard={status === "ready"}>
        <Stack.Screen name="(tabs)" />
        {/* Compose/detail live outside (tabs) for their own header+back chrome, but they are
            session-gated exactly like it — undeclared, a signed-out deep link to
            /class-update/new would render the live compose form instead of routing to sign-in. */}
        <Stack.Screen name="class-update" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Sankalp fonts (design/sankalp/assets/fonts/README.md's documented registration pattern) —
  // held behind the splash screen so no screen ever renders in the system-default fallback font.
  const [fontsLoaded] = useFonts({
    "Marcellus-Regular": require("../design/sankalp/assets/fonts/Marcellus-Regular.ttf"),
    "Mukta-Regular": require("../design/sankalp/assets/fonts/Mukta-Regular.ttf"),
    "Mukta-Medium": require("../design/sankalp/assets/fonts/Mukta-Medium.ttf"),
    "Mukta-SemiBold": require("../design/sankalp/assets/fonts/Mukta-SemiBold.ttf"),
    "Mukta-Bold": require("../design/sankalp/assets/fonts/Mukta-Bold.ttf"),
    "JetBrainsMono-Regular": require("../design/sankalp/assets/fonts/JetBrainsMono-Regular.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}

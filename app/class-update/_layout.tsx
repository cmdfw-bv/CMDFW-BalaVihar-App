import "../../lib/unistyles";
import { Stack } from "expo-router";
import { useUnistyles } from "react-native-unistyles";
import { useIsDesktop } from "../../lib/useIsDesktop";

// Compose/Detail are push screens navigated into from the Feed tab, not tab roots — they don't
// get (tabs)/_layout.tsx's AppHeader/DesktopSidebar/MobileTabBar chrome (a bottom-of-stack tab
// bar or a duplicate brand header would be wrong here; a back button is what's needed). Found
// missing entirely during /test's design-parity gate (issue #21): both screens rendered with
// zero header/back-nav at every breakpoint, full-bleed edge-to-edge at 1024/1440 specifically
// since narrower widths don't expose the missing width cap. Stack's own default header (title +
// back button, same as any push screen) plus a plain-object contentStyle width cap fixes both —
// contentStyle is a screenOptions key (not a style={} prop), so — same caution as (tabs)/
// _layout.tsx's desktopScene — it must be a plain object read from the live theme, not a
// StyleSheet.create() value, or Unistyles' compile-time transform makes it resolve to nothing.
export default function ClassUpdateLayout() {
  const isDesktop = useIsDesktop();
  const { theme } = useUnistyles();

  const contentStyle = {
    flex: 1,
    width: "100%" as const,
    maxWidth: isDesktop ? theme.chrome.deskw : undefined,
    alignSelf: "center" as const,
    backgroundColor: theme.colors.canvas,
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.ink,
        headerTitleStyle: { fontFamily: theme.fonts.semibold },
        contentStyle,
      }}
    >
      <Stack.Screen name="new" options={{ title: "Post class update" }} />
      <Stack.Screen name="[id]" options={{ title: "Class update" }} />
    </Stack>
  );
}

import { Stack } from "expo-router";
// Theme registration (Task 4) will be wired here once lib/theme is ready.

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

// Custom entry (replaces "expo-router/entry" as package.json's "main") — guarantees
// StyleSheet.configure() runs before Expo Router's route-tree discovery evaluates any
// screen module. Without this, SSR/static-export route discovery can require a screen's
// StyleSheet.create() before lib/unistyles.ts's side-effect import (in app/_layout.tsx) has
// registered a theme, throwing "no theme has been selected yet".
import "./lib/unistyles";
import "expo-router/entry";

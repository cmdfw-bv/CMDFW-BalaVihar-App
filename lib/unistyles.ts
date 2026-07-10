import { StyleSheet } from "react-native-unistyles";
import { lightTheme, breakpoints } from "./theme";

type AppBreakpoints = typeof breakpoints;
type AppThemes = { light: typeof lightTheme };

declare module "react-native-unistyles" {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes: { light: lightTheme },
  breakpoints,
  settings: { initialTheme: "light" },
});

import "../../lib/unistyles";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ReactNode } from "react";
import { shouldShowRetry, type ViewState } from "./StateView.logic";

export type StateViewProps = {
  state: ViewState;
  emptyText?: string;
  errorText?: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export default function StateView({ state, emptyText, errorText, onRetry, children }: StateViewProps) {
  if (state === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#b8531a" /* theme.colors.primary literal — ActivityIndicator's color prop can't consume a theme token directly */ />
      </View>
    );
  }
  if (state === "empty") {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>{emptyText}</Text>
      </View>
    );
  }
  if (state === "error") {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>{errorText}</Text>
        {shouldShowRetry(state, onRetry) ? (
          <Pressable onPress={onRetry} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return <>{children}</>;
}

const styles = StyleSheet.create((theme) => ({
  center: { alignItems: "center", justifyContent: "center", padding: theme.space["6"], gap: theme.space["3"] },
  copy: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.sm, color: theme.colors.ink3, textAlign: "center" },
  retry: { minHeight: theme.chrome.hitMin, paddingHorizontal: theme.space["4"], borderRadius: theme.radius.pill, backgroundColor: theme.colors.primary, alignItems: "center", justifyContent: "center" },
  retryText: { fontFamily: theme.fonts.semibold, fontSize: theme.type.scale.sm, color: theme.colors.onAction },
}));

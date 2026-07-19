import "../../lib/unistyles";
import { View, Text, Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { ReactNode } from "react";

export type ListRowProps = {
  leading: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
};

export default function ListRow({ leading, title, subtitle, trailing, onPress }: ListRowProps) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper style={styles.row} onPress={onPress} accessibilityRole={onPress ? "button" : undefined}>
      <View style={styles.leading}>{leading}</View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["3"],
    minHeight: theme.chrome.hitMin,
    paddingVertical: theme.space["2"],
    paddingHorizontal: theme.space["3"],
  },
  // Deliberately no fixed width here (edge case: ListRow must accept the leading slot's
  // natural size, not hardcode a dimension — see spec edge cases) — callers size their own
  // avatar/icon/bar content; this wrapper only centers it.
  leading: { flexShrink: 0, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: theme.fonts.semibold, fontSize: theme.type.scale.sm, color: theme.colors.ink },
  subtitle: { fontFamily: theme.fonts.body, fontSize: theme.type.scale.xs, color: theme.colors.ink3, marginTop: 2 }, // no matching token — small vertical nudge
  trailing: { flexShrink: 0, alignItems: "flex-end", justifyContent: "center" },
}));

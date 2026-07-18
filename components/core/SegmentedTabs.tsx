import "../../lib/unistyles";
import * as React from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { normalizeTab, type TabItem } from "./SegmentedTabs.logic";

// Matches design/sankalp/components/core/SegmentedTabs.jsx — capsule tab group with an
// ink-filled active tab.
export interface SegmentedTabsProps {
  /** Tabs as strings, or {id,label,count} objects for count badges. */
  tabs: (string | TabItem)[];
  /** Active tab id. */
  value: string;
  onChange: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

export default function SegmentedTabs({ tabs, value, onChange, style }: SegmentedTabsProps) {
  return (
    <View style={[styles.rail, style]}>
      {tabs.map((t) => {
        const tab = normalizeTab(t);
        const on = tab.id === value;
        return (
          <Pressable key={tab.id} onPress={() => onChange(tab.id)} style={styles.segment(on)}>
            <Text style={styles.label(on)}>{tab.label}</Text>
            {tab.count != null ? <Text style={styles.count(on)}>{tab.count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  rail: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: theme.space["1"],
    padding: theme.space["1"],
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.pill,
  },
  segment: (on: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "center" as const,
    minHeight: theme.chrome.hitMin,
    paddingHorizontal: theme.space["4"] + 2, // 18px
    paddingVertical: theme.space["2"] + 2, // 10px
    borderRadius: theme.radius.pill,
    backgroundColor: on ? theme.colors.ink : "transparent",
  }),
  label: (on: boolean) => ({
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.xs,
    letterSpacing: 0.04,
    color: on ? theme.colors.onDark : theme.colors.ink3,
  }),
  count: (on: boolean) => ({
    marginLeft: theme.space["1"] + 2, // 6px
    fontSize: theme.type.scale.eyebrow,
    fontFamily: theme.fonts.mono,
    opacity: 0.65,
    fontVariant: ["tabular-nums" as const],
    color: on ? theme.colors.onDark : theme.colors.ink3,
  }),
}));

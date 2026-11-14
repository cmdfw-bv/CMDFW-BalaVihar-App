import "../../../lib/unistyles";
import * as React from "react";
import { Pressable, Text } from "react-native";
import { router } from "expo-router";
import { StyleSheet } from "react-native-unistyles";
import Card from "../../../components/core/Card";

// The Dashboard's entry to the Removed messages review. Shaped like a dash.jsx card header
// (design/sankalp/bv-connect/screens/desktop/dash.jsx `.card__h`). The Dashboard renders it only
// for the roles its tab is limited to; the review function is what actually decides access.
// The press target sits INSIDE the Card: Card is itself a Pressable, so wrapping it in another
// one leaves the outer never receiving the press on web (see Card.tsx's nesting invariant).
export default function RemovedMessagesCard() {
  return (
    <Card interactive padding={0}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Removed messages"
        onPress={() => router.push("/removed-messages")}
        style={styles.target}
      >
        <Text style={styles.title}>Removed messages</Text>
        <Text style={styles.chevron} aria-hidden>
          ›
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  target: {
    minHeight: theme.chrome.hitMin,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.space["4"],
  },
  title: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.lead,
    color: theme.colors.ink,
  },
  chevron: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.h3,
    color: theme.colors.ink4,
  },
}));

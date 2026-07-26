import "../unistyles";
import * as React from "react";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import Button from "../../components/core/Button";
import type { DateBounds } from "./dateBounds";

export interface DateNavProps {
  selectedDate: string;
  dateBounds: DateBounds | null;
  onPrevious: () => void;
  onNext: () => void;
}

// Design spec §UI "Date nav": ghost prev/next Button pair flanking a tabular-numerics date label.
// ADR-0031: each tap steps ±7 days (the session's weekly cadence), handled by the hook's
// goToPrevious/goToNext — this component only reflects dateBounds' canGoPrev/canGoNext, never
// writes an arbitrary date itself.
export default function DateNav({ selectedDate, dateBounds, onPrevious, onNext }: DateNavProps) {
  return (
    <View style={styles.row}>
      <Button variant="ghost" size="sm" disabled={!dateBounds?.canGoPrev} onClick={onPrevious}>
        {"‹"}
      </Button>
      <Text style={styles.date}>{selectedDate}</Text>
      <Button variant="ghost" size="sm" disabled={!dateBounds?.canGoNext} onClick={onNext}>
        {"›"}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space["4"],
  },
  date: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.body,
    color: theme.colors.ink,
    fontVariant: ["tabular-nums"],
  },
}));

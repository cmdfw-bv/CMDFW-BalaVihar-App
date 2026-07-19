import "../../lib/unistyles";
import { View, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { eventDateFontSize, type EventDateSize } from "./EventDateBlock.logic";

// Matches design/sankalp/components/brand/EventDateBlock.jsx — editorial date block.
// no app consumer yet — ported for full-library completeness per ADR-0028
export interface EventDateBlockProps {
  day: React.ReactNode;
  month: React.ReactNode;
  year?: React.ReactNode;
  size?: EventDateSize;
}

export default function EventDateBlock({
  day,
  month,
  year,
  size = "lg",
}: EventDateBlockProps) {
  const dayFontSize = eventDateFontSize(size);

  return (
    <View style={styles.container}>
      <Text style={[styles.day, { fontSize: dayFontSize, lineHeight: dayFontSize * 1.05 }]}>
        {day}
      </Text>
      <Text style={styles.month}>
        {month}
      </Text>
      {year && (
        <Text style={styles.year}>
          {year}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "column",
  },
  day: {
    fontFamily: theme.fonts.display,
    letterSpacing: -0.02, // no matching token — tight tracking to match the design reference
    color: theme.colors.primary,
    fontVariant: ["tabular-nums"] as const,
  },
  month: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    fontWeight: "600",
    letterSpacing: theme.type.tracking.eyebrow,
    lineHeight: theme.type.scale.eyebrow * 1.05,
    textTransform: "uppercase" as const,
    color: theme.colors.ink3,
    marginTop: theme.space["1"],
  },
  year: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    letterSpacing: 0.14, // no matching token — tight tracking to match the design reference
    lineHeight: theme.type.scale.eyebrow * 1.05,
    color: theme.colors.ink4,
    marginTop: 3, // no matching token — deliberate spacing value
  },
}));

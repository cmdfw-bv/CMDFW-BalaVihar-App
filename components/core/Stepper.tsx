import "../../lib/unistyles";
import * as React from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { clampStep } from "./Stepper.logic";

// Matches design/sankalp/components/core/Stepper.jsx — labelled +/- number control.
// Divergence from the reference (Task 1.7): the reference's buttons are 40px; this port uses
// theme.chrome.hitMin (44px) squares per the global ≥44px touch-target constraint (AC).
export interface StepperProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  style?: StyleProp<ViewStyle>;
}

export default function Stepper({ label, hint, value, onChange, min = 0, max = 20, style }: StepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;

  return (
    <View style={[styles.row, style]}>
      {label ? (
        <View style={styles.labelCol}>
          <Text style={styles.label}>{label}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      ) : null}
      <View style={styles.controls}>
        <Pressable
          disabled={atMin}
          onPress={() => onChange(clampStep(value, -1, min, max))}
          accessibilityLabel="Decrease"
          style={styles.btn(atMin)}
        >
          <Text style={styles.btnGlyph}>−</Text>
        </Pressable>
        <Text style={styles.value}>{value}</Text>
        <Pressable
          disabled={atMax}
          onPress={() => onChange(clampStep(value, 1, min, max))}
          accessibilityLabel="Increase"
          style={styles.btn(atMax)}
        >
          <Text style={styles.btnGlyph}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.space["4"],
    paddingVertical: theme.space["4"] + 2, // 18px
  },
  labelCol: {
    flexDirection: "column",
    gap: 2,
  },
  label: {
    fontFamily: theme.fonts.display,
    fontSize: 19,
    color: theme.colors.ink,
  },
  hint: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink3,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space["2"],
  },
  btn: (disabled: boolean) => ({
    width: theme.chrome.hitMin,
    height: theme.chrome.hitMin,
    borderRadius: theme.chrome.hitMin / 2,
    borderWidth: 1,
    borderColor: theme.colors.line2,
    backgroundColor: theme.colors.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    opacity: disabled ? 0.35 : 1,
  }),
  btnGlyph: {
    fontFamily: theme.fonts.semibold,
    fontSize: 20,
    lineHeight: 20,
    color: theme.colors.ink2,
  },
  value: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    minWidth: 36,
    textAlign: "center",
    color: theme.colors.ink,
    fontVariant: ["tabular-nums" as const],
  },
}));

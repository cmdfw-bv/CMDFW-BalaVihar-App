import "../../lib/unistyles";
import * as React from "react";
import { View, Text, TextInput, type StyleProp, type ViewStyle, type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { fieldControlMeta, type FieldAs } from "./Field.logic";

// Matches design/sankalp/components/core/Field.jsx — label + input with a reserved validation slot.
// Divergence from the reference (Task 1.3): `as="select"` has no native RN equivalent to an HTML
// <select> (the reference passes <option> children). This port renders `as="select"` as a
// read-only-styled View wrapping `children` instead. A real native picker (e.g. a bottom-sheet
// or platform ActionSheet) is a *future* concern — out of scope for this presentational port.
export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  /** Error message; presence switches the field into the invalid state. */
  error?: React.ReactNode;
  as?: FieldAs;
  /** Uppercase eyebrow label styling (default) vs. plain sentence label. */
  uppercase?: boolean;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export default function Field({
  label,
  hint,
  required = false,
  error,
  as = "input",
  uppercase = true,
  placeholder,
  value,
  onChangeText,
  children,
  style,
  inputStyle,
}: FieldProps) {
  const [focused, setFocused] = React.useState(false);
  const invalid = Boolean(error);
  const meta = fieldControlMeta(as, invalid);

  return (
    <View style={[styles.wrap, style]}>
      {label ? (
        <Text style={styles.label(uppercase)}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}

      {as === "select" ? (
        // Read-only-styled well — see divergence note above.
        <View style={[styles.control(meta, focused, invalid), inputStyle as StyleProp<ViewStyle>]}>{children}</View>
      ) : (
        <TextInput
          value={value}
          placeholder={placeholder}
          multiline={meta.multiline}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.control(meta, focused, invalid), styles.controlText, inputStyle]}
        />
      )}

      {/* validation slot — always reserved so layout never jumps */}
      <Text style={styles.hint(invalid)}>{error || hint || ""}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flexDirection: "column",
    gap: theme.space["2"],
  },
  label: (uppercase: boolean) => ({
    fontFamily: theme.fonts.semibold,
    fontSize: uppercase ? theme.type.scale.eyebrow : theme.type.scale.xs,
    letterSpacing: uppercase ? theme.type.tracking.eyebrow : 0.01,
    textTransform: uppercase ? ("uppercase" as const) : ("none" as const),
    color: theme.colors.ink2,
  }),
  required: {
    color: theme.colors.primary,
  },
  control: (meta: { minHeight: number; borderTokenKey: string }, focused: boolean, invalid: boolean) => ({
    width: "100%" as const,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: invalid
      ? theme.colors.status.absent
      : focused
        ? theme.colors.primary
        : theme.colors.line2,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.space["4"],
    paddingVertical: theme.space["3"],
    minHeight: meta.minHeight,
    textAlignVertical: meta.minHeight === 96 ? ("top" as const) : ("center" as const),
  }),
  controlText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.body,
    color: theme.colors.ink,
  },
  hint: (invalid: boolean) => ({
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    minHeight: theme.type.scale.xs * theme.type.leading.body,
    color: invalid ? theme.colors.status.absent : theme.colors.ink3,
  }),
}));

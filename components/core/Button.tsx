import "../../lib/unistyles";
import * as React from "react";
import { Pressable, Text, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { BUTTON_VARIANTS, BUTTON_SIZES, resolveButtonMode, type ButtonVariant, type ButtonSize } from "./Button.logic";
import { colorAtPath } from "./tokenPath";

// react-native-web's Pressable forwards unrecognized props straight to the underlying View,
// which *does* support `href`/`hrefAttrs` (renders a real anchor) — `@types/react-native`'s
// PressableProps just doesn't declare it. Widen the type locally rather than `any`-cast per use.
const WebPressable = Pressable as React.ComponentType<
  React.ComponentProps<typeof Pressable> & { href?: string }
>;

// Matches design/sankalp/components/core/Button.jsx — capsule action control.
// One PRIMARY (terracotta) action per view; everything else is secondary / ghost / outline / gold / danger.
export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  /** Render as a link (RN-Web `Pressable` supports `href`/`hrefAttrs`; native ignores it). */
  href?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: (e: GestureResponderEvent) => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Button({
  variant = "primary",
  size = "md",
  href,
  icon,
  iconRight,
  disabled = false,
  fullWidth = false,
  onClick,
  children,
  style,
}: ButtonProps) {
  const mode = resolveButtonMode(href, disabled);

  return (
    <WebPressable
      // RN-Web forwards `href` straight to a real anchor's semantics when supported — no
      // separate <a> branch needed the way the web reference has (Button.jsx:70-76).
      href={mode === "link" ? href : undefined}
      disabled={disabled}
      onPress={onClick}
      style={({ pressed }) => [
        styles.base(variant, size, fullWidth, disabled),
        pressed && !disabled ? styles.pressed : null,
        style,
      ]}
    >
      {icon}
      {children != null ? <Text style={styles.label(variant, size)}>{children}</Text> : null}
      {iconRight}
    </WebPressable>
  );
}

const styles = StyleSheet.create((theme) => {
  const fontForScale = (scale: "xs" | "sm" | "body") => theme.type.scale[scale];

  return {
    base: (variant: ButtonVariant, size: ButtonSize, fullWidth: boolean, disabled: boolean) => {
      const v = BUTTON_VARIANTS[variant];
      const s = BUTTON_SIZES[size];
      return {
        flexDirection: "row" as const,
        alignItems: "center" as const,
        justifyContent: "center" as const,
        gap: theme.space["2"],
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: colorAtPath(theme.colors, v.border),
        backgroundColor: colorAtPath(theme.colors, v.bg),
        paddingHorizontal: s.paddingX,
        paddingVertical: s.paddingY,
        minHeight: theme.chrome.hitMin,
        width: fullWidth ? ("100%" as const) : undefined,
        opacity: disabled ? 0.5 : 1,
      };
    },
    pressed: {
      opacity: 0.85,
    },
    label: (variant: ButtonVariant, size: ButtonSize) => {
      const v = BUTTON_VARIANTS[variant];
      const s = BUTTON_SIZES[size];
      return {
        fontFamily: theme.fonts.semibold,
        fontSize: fontForScale(s.fontSize),
        letterSpacing: 0.01,
        color: colorAtPath(theme.colors, v.fg),
      };
    },
  };
});

import "../../lib/unistyles";
import * as React from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { cardToneStyle, type CardTone } from "./Card.logic";
import { colorAtPath } from "./tokenPath";

// Matches design/sankalp/components/core/Card.jsx — warm-paper surface container.
// Divergence from the reference (Task 1.2): RN has no polymorphic `as` tag the way the web
// reference does (`as="div"|"section"|...`), so that prop is dropped — this always renders the
// same element. It's a `Pressable` rather than a plain `View` because the `interactive`
// hover-lift needs `onHoverIn`/`onHoverOut`, which RN-Web implements on `Pressable`, not `View`;
// with no `onPress` it behaves as an inert container, so this is a no-op divergence otherwise.
//
// INVARIANT (do not break without checking callers): this `Pressable` has no `onPress` and no
// `accessibilityRole`, so RN-Web renders it as a plain `<div>`, not a `<button>`. At least one
// consumer (`components/feed/FeedCard.tsx`) relies on that: it nests its own interactive
// `Pressable`s (which DO render as `<button>` on web) inside `Card`, and two `<button>`s cannot
// legally nest inside each other in HTML. If `Card` ever gains its own `onPress`/
// `accessibilityRole="button"`, re-check every consumer that nests a `Pressable` inside it.
export interface CardProps {
  tone?: CardTone;
  /** Lift + terracotta border on hover (web only; native ignores hover events, not a bug). */
  interactive?: boolean;
  /** Inner padding in px. */
  padding?: number;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function Card({ tone = "surface", interactive = false, padding = 24, children, style }: CardProps) {
  const [hover, setHover] = React.useState(false);

  return (
    <Pressable
      onHoverIn={interactive ? () => setHover(true) : undefined}
      onHoverOut={interactive ? () => setHover(false) : undefined}
      style={[styles.base(tone, padding), interactive && hover ? styles.hovered : null, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => {
  return {
    base: (tone: CardTone, padding: number) => {
      const t = cardToneStyle(tone);
      return {
        borderRadius: theme.radius.lg,
        borderWidth: 1,
        borderColor: colorAtPath(theme.colors, t.border),
        backgroundColor: colorAtPath(theme.colors, t.bg),
        // Note: `t.fg` (text color) isn't applied here — CSS color inheritance from a
        // container onto child <Text> has no RN equivalent; consumers must color their own
        // Text children (e.g. via `cardToneStyle(tone).fg` + `colorAtPath`) for indigo tone.
        padding,
        // --shadow-sm (token-mapping table: no token exists — platform shadow props).
        shadowColor: theme.colors.ink,
        shadowOpacity: 0.08,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 6,
        elevation: 2,
      };
    },
    hovered: {
      transform: [{ translateY: -3 }],
      borderColor: theme.colors.primary,
      // --shadow-lg on hover.
      shadowOpacity: 0.16,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      elevation: 6,
    },
  };
});

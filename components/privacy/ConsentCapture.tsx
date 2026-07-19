import "../../lib/unistyles";
import * as React from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { consentItemState } from "./ConsentCapture.logic";

// Matches design/sankalp/bv-connect/components/privacy/ConsentCapture.jsx — timestamped
// parental + media consent. Each item is an explicit opt-in checkbox; the captured timestamp is
// shown once checked, because consent must be auditable for a minors' platform.
//
// Privacy/scope: props-in, callback-out only — `onToggle?.(id)` is the only side effect this
// component performs. It never writes a `consents` row and never calls Supabase (persisting a
// real consent record is future feature-owner wiring, out of scope here). It also performs ZERO
// logging — `id`/`values`/`timestamps` are never passed to `console.*`, analytics, or any other
// side channel; they only flow into rendered <Text>/accessibility props.
export interface ConsentItem {
  id: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  required?: boolean;
}

export interface ConsentCaptureProps {
  items?: ConsentItem[];
  /** id → boolean opt-in state. */
  values?: Record<string, boolean>;
  /** id → captured timestamp (shown once checked). */
  timestamps?: Record<string, React.ReactNode>;
  onToggle?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

export default function ConsentCapture({ items = [], values = {}, timestamps = {}, onToggle, style }: ConsentCaptureProps) {
  const { theme } = useUnistyles();

  return (
    <View style={[styles.wrap, style]}>
      {items.map((it) => {
        const state = consentItemState(it.id, values, timestamps);
        return (
          <Pressable
            key={it.id}
            onPress={() => onToggle?.(it.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state.checked }}
            style={styles.row(state.checked)}
          >
            <View style={styles.box(state.checked)}>
              {state.checked ? (
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={theme.colors.onAction} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M5 12l4 4L19 6" />
                </Svg>
              ) : null}
            </View>
            <View style={styles.content}>
              <Text style={styles.label}>
                {it.label}
                {it.required ? <Text style={styles.required}> *</Text> : null}
              </Text>
              {it.help ? <Text style={styles.help}>{it.help}</Text> : null}
              {state.timestamp != null ? (
                <View style={styles.timestampRow}>
                  <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.present} strokeWidth={2}>
                    <Circle cx={12} cy={12} r={9} />
                    <Path d="M12 7v5l3 2" />
                  </Svg>
                  <Text style={styles.timestamp}>Recorded {state.timestamp}</Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flexDirection: "column" as const,
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, neither is a
    // closer fit, so this is disclosed rather than silently rounded (same treatment as
    // StatusChip.tsx/CommentComposer.tsx's precedent).
    gap: 10,
  },
  row: (checked: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: theme.space["3"], // 12px, exact match to the reference's gap: 12
    // Deliberate literal — 14px sits exactly between space.3=12 and space.4=16, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    padding: 14,
    borderRadius: theme.radius.control,
    backgroundColor: checked ? theme.colors.statusRamp.presentSoft : theme.colors.appSurface,
    borderWidth: 1,
    borderColor: checked ? theme.colors.statusRamp.presentLine : theme.colors.line,
    // Enforces the global >=44px touch-target constraint on the whole tappable row (the
    // reference has no explicit height — its stacked label+help content happens to clear 44px,
    // but this pins it explicitly per the ConsentCapture task's ≥theme.chrome.hitMin requirement).
    minHeight: theme.chrome.hitMin,
  }),
  box: (checked: boolean) => ({
    // Deliberate literal — 22px checkbox glyph sits exactly between space.5=20 and space.6=24,
    // neither is a closer fit, so this is disclosed rather than silently rounded (same treatment
    // as Comment.tsx's 30px avatar precedent for component-specific glyph sizes).
    width: 22,
    height: 22,
    flexShrink: 0,
    // Deliberate literal — 1px top nudge to optically align the glyph with the first line of
    // label text; no space token (nearest is space.1=4) is close enough.
    marginTop: 1,
    borderRadius: theme.radius.sm,
    borderWidth: 1.5,
    borderColor: checked ? theme.colors.status.present : theme.colors.line2,
    backgroundColor: checked ? theme.colors.status.present : "transparent",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  }),
  content: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm, // 14, exact match to the reference's fontSize: 14
    color: theme.colors.ink,
  },
  required: {
    color: theme.colors.primary,
  },
  help: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs, // 13 — nearest token to the reference's 12.5px
    lineHeight: theme.type.scale.xs * theme.type.leading.body,
    color: theme.colors.ink3,
    marginTop: theme.space["1"], // 4px — nearest token to the reference's 3px
  },
  timestampRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["1"], // 4px — nearest token to the reference's gap: 5
    // Deliberate literal — 6px sits exactly between space.1=4 and space.2=8, neither is a
    // closer fit, so this is disclosed rather than silently rounded.
    marginTop: 6,
  },
  timestamp: {
    fontFamily: theme.fonts.mono,
    fontSize: theme.type.scale.eyebrow, // 11, exact match to the reference's fontSize: 11
    color: theme.colors.status.present,
  },
}));

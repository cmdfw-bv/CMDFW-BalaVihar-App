import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Card from "../core/Card";
import Button from "../core/Button";

// Matches design/sankalp/bv-connect/components/notifications/PushPermissionPrompt.jsx — the
// in-app card that asks to enable Web Push (VAPID) for the installed PWA. Honest about what's
// sent and always offers a clear "Not now". Used once, near first meaningful action.
//
// No `.logic.ts`/test here — same "no fabricated logic" call as `core/ListRow` and
// `chat/MessageComposer.tsx`; there's nothing to unit-test beyond static copy + two callbacks.
//
// iOS 16.4+ caveat (comment only, no branching added — deferred to future notifications-infra
// wiring): Web Push on iOS only works from a PWA that has been "Added to Home Screen"; Safari
// tabs and pre-16.4 iOS silently can't grant permission. This component doesn't attempt
// `display-mode`/`Platform` detection to special-case that — the caller decides when/whether to
// show this prompt at all.
export interface PushPermissionPromptProps {
  title?: React.ReactNode;
  body?: React.ReactNode;
  onEnable?: () => void;
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}

function BellIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
      <Path d="M10 21a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export default function PushPermissionPrompt({
  title = "Stay in the loop",
  body = "Turn on notifications to hear about new class updates, announcements, and absences — even when the app is closed.",
  onEnable,
  onDismiss,
  style,
}: PushPermissionPromptProps) {
  const { theme } = useUnistyles();

  return (
    <Card tone="surface" padding={theme.space["4"]} style={style}>
      <View style={styles.row}>
        <View style={styles.iconWell}>
          {/* --primary-2 (hover/pressed/accent text) === theme.colors.primaryPressed —
              confirmed in design/sankalp/tokens.css:42 / lib/theme.ts:41. */}
          <BellIcon color={theme.colors.primaryPressed} size={22} />
        </View>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <Button variant="primary" size="sm" onClick={onEnable}>Enable notifications</Button>
            {/* Always rendered, never conditional — spec requires the prompt to always offer
                an explicit "Not now" out. */}
            <Button variant="ghost" size="sm" onClick={onDismiss}>Not now</Button>
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    // Deliberate literal — reference's 14px gap sits between space.3=12 and space.4=16, neither
    // is an exact fit (StatTile.tsx/CsvImport.tsx precedent for disclosed literals).
    gap: 14,
  },
  iconWell: {
    // Deliberate literal — reference's 42px well is 2px off the nearest token (space.10=40),
    // so this is disclosed rather than silently rounded (StatTile.tsx precedent).
    width: 42,
    height: 42,
    flexShrink: 0,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    // Marcellus is single-weight — no fontWeight paired here (StatTile.tsx/Comment.tsx precedent).
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.lead, // 18, exact match to the reference's 18px
    color: theme.colors.ink,
    marginBottom: theme.space["1"],
  },
  body: {
    fontFamily: theme.fonts.body,
    // Deliberate literal — reference's 13.5px sits between scale.xs=13 and scale.sm=14, neither
    // is an exact fit (StatTile.tsx precedent for disclosed literals).
    fontSize: 13.5,
    lineHeight: 13.5 * theme.type.leading.body,
    color: theme.colors.ink3,
    marginBottom: theme.space["3"],
  },
  actions: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: theme.space["2"],
  },
}));

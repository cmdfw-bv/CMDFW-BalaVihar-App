import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import ListRow from "../core/ListRow";
import { notificationTypeMeta, type NotificationType } from "./NotificationItem.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/notifications/NotificationItem.jsx — a row in
// the notifications center: a type-hued icon, a title + timestamp, an optional body, and an
// unread dot. Built on top of core/ListRow (leading/title/subtitle/trailing slots), per the
// Stage 11 brief. Divergence from the reference: the web version puts title + time on one
// baseline row (via `marginLeft: auto` flex) with body on the next line — ListRow's title slot
// is a single non-flex <Text>, so there's no room to right-push time there. Same trailing-column
// treatment as `chat/ConversationRow.tsx` (time stacked above its trailing badge) is reused here:
// time moves into the trailing slot, stacked above the unread dot.
export interface NotificationItemProps {
  /** Event type — selects icon glyph + hue. */
  type?: NotificationType;
  title?: React.ReactNode;
  body?: React.ReactNode;
  time?: React.ReactNode;
  unread?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

type IconProps = { color: string; size: number };

function UpdateIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function AnnounceIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 11l18-5v12L3 14v-3z" />
      <Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </Svg>
  );
}

function AbsenceIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <Path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}

function ApprovalIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Svg>
  );
}

function ChatIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Svg>
  );
}

const ICONS: Record<NotificationType, (props: IconProps) => React.ReactElement> = {
  update: UpdateIcon,
  announce: AnnounceIcon,
  absence: AbsenceIcon,
  approval: ApprovalIcon,
  chat: ChatIcon,
};

export default function NotificationItem({
  type = "update",
  title,
  body,
  time,
  unread = false,
  onPress,
  style,
}: NotificationItemProps) {
  const { theme } = useUnistyles();
  const meta = notificationTypeMeta(type);
  const hue = colorAtPath(theme.colors, meta.colorTokenKey);
  const Icon = ICONS[type] ?? ICONS.update;

  return (
    <View style={[styles.wrap(unread), style]}>
      <ListRow
        onPress={onPress}
        leading={
          <View style={styles.iconCircle(hue)}>
            {/* White-on-hue icon glyph — same token substitution as Comment.tsx's avatarLabel
                (theme.colors.onAction for the reference's literal "#fff"). */}
            <Icon color={theme.colors.onAction} size={17} />
          </View>
        }
        title={<Text style={styles.title} numberOfLines={1}>{title}</Text>}
        subtitle={body != null ? <Text style={styles.body} numberOfLines={1}>{body}</Text> : undefined}
        trailing={
          <View style={styles.trailingWrap}>
            {time != null ? <Text style={styles.time}>{time}</Text> : null}
            {unread ? <View style={styles.unreadDot} /> : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (unread: boolean) => ({
    // Reference: `background: unread ? var(--app-surface) : "transparent"` — same
    // outer-View-wraps-ListRow treatment as chat/ConversationRow.tsx's `wrap(active)`.
    backgroundColor: unread ? theme.colors.appSurface : "transparent",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  }),
  iconCircle: (hue: string) => ({
    // Deliberate literal — reference's 36px sits between space.8=32 and space.10=40, neither is
    // an exact fit (StatTile.tsx/CsvImport.tsx precedent for disclosed literals).
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: hue,
  }),
  title: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink,
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: theme.colors.ink3,
    lineHeight: theme.type.scale.xs * theme.type.leading.snug,
  },
  trailingWrap: {
    flexDirection: "column" as const,
    alignItems: "flex-end" as const,
    gap: theme.space["1"],
  },
  time: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.ink4,
    fontVariant: ["tabular-nums" as const],
  },
  unreadDot: {
    // Deliberate literal — no matching token, exact match to the reference's 9px unread dot
    // (same disclosure treatment as ConversationRow.tsx's badge precedent).
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: theme.colors.primary,
  },
}));

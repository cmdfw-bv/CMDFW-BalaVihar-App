import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import ListRow from "../core/ListRow";
import { conversationRowMeta, type RoleKey } from "./ConversationRow.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/chat/ConversationRow.jsx — a messages-list row
// for a class group chat or a 1:1 student DM. Built on top of core/ListRow (leading/title/
// subtitle/trailing slots), per the Stage 6 brief.
export interface ConversationRowProps {
  /** Display name (also sourced for the DM avatar initial). */
  name?: React.ReactNode;
  /** Last-message preview (truncates). */
  preview?: React.ReactNode;
  time?: React.ReactNode;
  /** Unread count; 0 hides the badge. */
  unread?: number;
  /** Group class-chat vs 1:1 DM. */
  kind?: "group" | "dm";
  /** Role hue for DM avatars. */
  role?: RoleKey;
  /** Optional mono scope label (e.g. "JR·A"). */
  scope?: React.ReactNode;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function ConversationRow({
  name,
  preview,
  time = "",
  unread = 0,
  kind = "dm",
  role = "student",
  scope,
  active = false,
  onPress,
  style,
}: ConversationRowProps) {
  const { theme } = useUnistyles();
  const meta = conversationRowMeta(kind, role, unread);
  const hue = colorAtPath(theme.colors, meta.hueTokenKey);
  // Reference: `(name || "?").trim().charAt(0)` — guard for string type since `name` is now
  // `React.ReactNode` to match the design mirror's `.d.ts`.
  const initial = typeof name === "string" ? (name.trim() || "?").charAt(0) : "?";

  return (
    <View style={[styles.wrap(active), style]}>
      <ListRow
        onPress={onPress}
        leading={
          <View style={styles.avatar(hue)}>
            {kind === "group" ? (
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={theme.colors.goldLight} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <Circle cx={9} cy={7} r={4} />
                <Path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </Svg>
            ) : (
              // White-on-hue avatar initial — same token substitution as Comment.tsx's
              // avatarLabel (theme.colors.onAction for the reference's literal "#fff").
              <Text style={styles.avatarLabel}>{initial}</Text>
            )}
          </View>
        }
        title={
          <>
            {name}
            {scope ? <Text style={styles.scope}> {scope}</Text> : null}
          </>
        }
        subtitle={preview != null ? <Text style={styles.preview(unread > 0)}>{preview}</Text> : undefined}
        trailing={
          <View style={styles.trailingWrap}>
            <Text style={styles.time}>{time}</Text>
            {meta.unreadLabel ? (
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>{meta.unreadLabel}</Text>
              </View>
            ) : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (active: boolean) => ({
    borderRadius: theme.radius.control,
    backgroundColor: active ? theme.colors.appSurface2 : "transparent",
  }),
  avatar: (hue: string) => ({
    // theme.chrome.hitMin (44) doubles as the reference's 44px avatar diameter — a real token,
    // not a literal, and it happens to match exactly.
    width: theme.chrome.hitMin,
    height: theme.chrome.hitMin,
    borderRadius: theme.chrome.hitMin / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: hue,
  }),
  avatarLabel: {
    // Marcellus is single-weight — no fontWeight paired here.
    fontFamily: theme.fonts.display,
    // Nearest scale token to the reference's 17px (sm=14 is farther, lead=18 is 1px off).
    fontSize: theme.type.scale.lead,
    color: theme.colors.onAction,
  },
  scope: {
    fontFamily: theme.fonts.mono,
    // Deliberate literal — 10px sits below scale.eyebrow=11, no closer token exists (matches
    // reference's fontSize: 10; same disclosure treatment as StatusChip.tsx's precedent).
    fontSize: 10,
    color: theme.colors.ink4,
  },
  preview: (unread: boolean) => ({
    fontFamily: unread ? theme.fonts.semibold : theme.fonts.body,
    fontSize: theme.type.scale.xs,
    color: unread ? theme.colors.ink2 : theme.colors.ink3,
  }),
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
  badge: {
    // Space token 5 (20) matches the reference's minWidth/height: 20 exactly.
    minWidth: theme.space["5"],
    height: theme.space["5"],
    // Deliberate literal — 6px horizontal padding sits between space.1=4 and space.2=8, neither
    // is a closer fit, so this is disclosed rather than silently rounded (StatusChip.tsx precedent).
    paddingHorizontal: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.chatUnread,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  badgeLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.onAction,
    fontVariant: ["tabular-nums" as const],
  },
}));

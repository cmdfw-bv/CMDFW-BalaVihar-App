import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { chatBubbleMeta } from "./ChatBubble.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/chat/ChatBubble.jsx — one message in a class
// group chat or a student DM. Outgoing (own) bubbles fill terracotta and align right; incoming
// align left with the sender name above (group chats). A read tick is optional.
export interface ChatBubbleProps {
  /** Own (outgoing) message: terracotta fill, right-aligned. */
  own?: boolean;
  /** Sender name (shown above incoming group-chat bubbles). */
  author?: React.ReactNode;
  time?: React.ReactNode;
  /** Read state for own messages: undefined hides the tick; false=sent, true=read. */
  read?: boolean;
  /** Force the name label on/off (defaults to on for incoming). */
  showName?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function ChatBubble({ own = false, author, time = "", read, showName, children, style }: ChatBubbleProps) {
  const { theme } = useUnistyles();
  const meta = chatBubbleMeta(own, read, showName);
  const fill = colorAtPath(theme.colors, meta.fillTokenKey);
  const ink = colorAtPath(theme.colors, meta.inkTokenKey);

  return (
    <View style={[styles.wrap(meta.align), style]}>
      {meta.showName && author ? <Text style={styles.author}>{author}</Text> : null}
      <View style={styles.bubble(own, fill)}>
        <Text style={styles.bodyText(ink)}>{children}</Text>
      </View>
      <View style={styles.footer}>
        <Text style={styles.time}>{time}</Text>
        {meta.tick !== "none" ? (
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={meta.tick === "read" ? theme.colors.status.info : theme.colors.ink4} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M1 13l4 4L13 7" />
            <Path d="M11 13l4 4L23 7" />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: (align: "flex-end" | "flex-start") => ({
    flexDirection: "column" as const,
    alignItems: align,
    alignSelf: align,
    gap: 3, // Deliberate literal — 3px sits below space.1=4, no closer token (matches reference gap: 3).
  }),
  author: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.eyebrow, // nearest scale token to the reference's 11px (exact match)
    color: theme.colors.ink3,
    paddingHorizontal: theme.space["1"], // 4px, exact match to the reference's "0 4px" padding
  },
  bubble: (own: boolean, fill: string) => ({
    maxWidth: "78%" as const,
    backgroundColor: fill,
    borderWidth: own ? 0 : 1,
    borderColor: theme.colors.chatInLine,
    borderRadius: theme.radius.bubble,
    // Deliberate literal — 5 is the design reference's own asymmetric-corner value (the "tail"
    // corner nearest the sender), not a rounded-off token; disclosed per Stage 6 brief.
    borderBottomRightRadius: own ? 5 : theme.radius.bubble,
    borderBottomLeftRadius: own ? theme.radius.bubble : 5,
    paddingHorizontal: theme.space["3"], // 12px, nearest to the reference's 13px
    paddingVertical: theme.space["2"], // 8px, nearest to the reference's 9px
    // RN has no CSS box-shadow (`--app-shadow-row`) — platform shadow props per the plan's
    // token-mapping reference; only incoming bubbles carry the reference's shadow.
    shadowColor: own ? "transparent" : theme.colors.ink,
    shadowOpacity: own ? 0 : 0.08,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: own ? 0 : 2,
  }),
  bodyText: (ink: string) => ({
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm, // nearest scale token to the reference's 14.5px
    lineHeight: theme.type.scale.sm * theme.type.leading.snug,
    color: ink,
  }),
  footer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["1"], // 4px, exact match to the reference's gap: 4
    paddingHorizontal: theme.space["1"],
  },
  time: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow, // nearest scale token to the reference's 10.5px
    color: theme.colors.ink4,
    fontVariant: ["tabular-nums" as const],
  },
}));

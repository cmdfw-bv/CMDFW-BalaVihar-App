import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Rect, Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { commentStyleMeta, type RoleKey } from "./Comment.logic";
import { colorAtPath } from "../core/tokenPath";

// Matches design/sankalp/bv-connect/components/comments/Comment.jsx — a single comment in a
// thread. Public by default; a `private` comment (teacher <-> one parent) is tinted and carries
// a lock so the visibility is never ambiguous. Pure render only — never logs the body/author.
export interface CommentAuthor {
  name?: string;
  role?: RoleKey;
}

export interface CommentProps {
  author?: CommentAuthor;
  time?: React.ReactNode;
  body?: React.ReactNode;
  /** Private (teacher <-> one parent): tinted card + lock. */
  isPrivate?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function Comment({
  author = { name: "", role: "parent" },
  time = "",
  body,
  isPrivate = false,
  style,
}: CommentProps) {
  const { theme } = useUnistyles();
  const role = author.role ?? "parent";
  const meta = commentStyleMeta(role, isPrivate);
  const hue = colorAtPath(theme.colors, meta.hueTokenKey);
  const initial = (author.name || "?").trim().charAt(0) || "?";

  return (
    <View style={[styles.row(meta), style]}>
      <View style={styles.avatar(hue)}>
        <Text style={styles.avatarLabel}>{initial}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.metaRow}>
          <Text style={styles.name}>{author.name}</Text>
          <Text style={styles.role}>{role}</Text>
          {isPrivate ? (
            <View style={styles.privateBadge}>
              <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={theme.colors.private} strokeWidth={2}>
                <Rect x={4} y={11} width={16} height={9} rx={2} />
                <Path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </Svg>
              <Text style={styles.privateLabel}>PRIVATE</Text>
            </View>
          ) : null}
          <Text style={styles.time}>{time}</Text>
        </View>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: (meta: ReturnType<typeof commentStyleMeta>) => ({
    flexDirection: "row" as const,
    // Deliberate literal — 11px (matches Comment.jsx's gap: 11) sits between space.2=8 and
    // space.3=12; neither is a closer fit for the avatar-to-body relationship the reference
    // relies on, so this is disclosed rather than silently rounded (see StatusChip.tsx precedent).
    gap: 11,
    paddingVertical: theme.space["3"],
    // Deliberate literal — 2px hug against the list edge for public (borderless) comments,
    // matching Comment.jsx's "11px 2px"; no space token is close to 2px.
    paddingHorizontal: meta.bgTokenKey === "transparent" ? 2 : theme.space["3"],
    borderRadius: meta.bgTokenKey === "transparent" ? 0 : theme.radius.control,
    backgroundColor: colorAtPath(theme.colors, meta.bgTokenKey),
    borderWidth: meta.borderTokenKey ? 1 : 0,
    borderColor: meta.borderTokenKey ? colorAtPath(theme.colors, meta.borderTokenKey) : "transparent",
  }),
  avatar: (hue: string) => ({
    // Deliberate literal — 30px avatar diameter matches Comment.jsx; no space token (24/32) is
    // close enough to prefer over the visual reference.
    width: 30,
    height: 30,
    borderRadius: 15,
    flexShrink: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: hue,
  }),
  avatarLabel: {
    // Marcellus is single-weight — no fontWeight paired here.
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.xs,
    color: theme.colors.onAction,
  },
  content: {
    flex: 1,
    minWidth: 0,
    flexDirection: "column",
    gap: 2,
  },
  metaRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flexWrap: "wrap" as const,
    gap: theme.space["2"],
  },
  name: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink,
  },
  role: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.ink4,
    textTransform: "capitalize" as const,
  },
  privateBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },
  privateLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: theme.type.scale.eyebrow,
    letterSpacing: theme.type.tracking.eyebrow,
    textTransform: "uppercase" as const,
    color: theme.colors.private,
  },
  time: {
    marginLeft: "auto" as const,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.ink4,
    fontVariant: ["tabular-nums" as const],
  },
  bodyText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    lineHeight: theme.type.scale.sm * theme.type.leading.body,
    color: theme.colors.ink2,
  },
}));

import "../../lib/unistyles";
import * as React from "react";
import { View, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { commentThreadCount } from "./CommentThread.logic";
import Comment, { type CommentProps } from "./Comment";

// Matches design/sankalp/bv-connect/components/comments/CommentThread.jsx — a count header, a
// list of Comments, and an optional composer slot rendered as `children` at the bottom.
export interface CommentThreadProps {
  /** Override the count shown in the header (defaults to comments.length). */
  count?: number;
  /** Comments to render (each is a CommentProps object). */
  comments?: CommentProps[];
  /** Composer slot, rendered after the list. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function CommentThread({ count, comments = [], children, style }: CommentThreadProps) {
  const { theme } = useUnistyles();
  const n = commentThreadCount(count, comments);

  return (
    <View style={style}>
      <View style={styles.header}>
        <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={theme.colors.ink3} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </Svg>
        <Text style={styles.headerLabel}>
          <Text style={styles.headerCount}>{n}</Text> {n === 1 ? "comment" : "comments"}
        </Text>
      </View>
      <View style={styles.list}>
        {comments.map((c, i) => (
          <Comment key={i} {...c} />
        ))}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["2"],
    paddingBottom: theme.space["2"],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  headerLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink2,
  },
  headerCount: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.sm,
    color: theme.colors.ink2,
    fontVariant: ["tabular-nums" as const],
  },
  list: {
    flexDirection: "column" as const,
    gap: theme.space["1"],
    paddingVertical: theme.space["2"],
  },
}));

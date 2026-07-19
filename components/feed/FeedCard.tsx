import "../../lib/unistyles";
import * as React from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import Card from "../core/Card";
import RoleBadge from "../core/RoleBadge";
import { type RoleKey } from "../core/RoleBadge.logic";
import { colorAtPath } from "../core/tokenPath";
import { feedScopeMeta, feedCardMeta, feedTagToneTokenKeys, type FeedScope } from "./FeedCard.logic";

// Matches design/sankalp/bv-connect/components/feed/FeedCard.jsx — one item in the home feed:
// an announcement or a class update, built on top of core/Card. Divergence from the reference
// (Card.tsx precedent): the web version puts a single onClick on the whole <article>, which the
// footer's time/reach text inherits by bubbling for free. RN has no bubbling-onClick equivalent
// via Card (CardProps has no onPress — Task-1.2 divergence), so this gives the card body its own
// Pressable and the comment count its own Pressable per the Stage 10 brief ("only the card body
// and the comment count are tap targets, both firing onOpen") — footer time/reach stay inert,
// matching intent rather than literal DOM bubbling. `...rest` (arbitrary DOM attribute
// passthrough) is dropped — same divergence as Card.tsx's dropped `as` prop; RN has no
// equivalent spread-onto-host-element concept.
//
// RN-Web-specific structural note (post-Stage-10 fix): the two Pressables above must be DOM
// *siblings*, never nested — a Pressable with accessibilityRole="button" renders as a real HTML
// <button> on RN Web, and a <button> cannot legally contain a nested <button> (hydration-validity
// error). The reference's single <article onClick> + nested <button> is valid HTML because an
// <article> isn't a button; RN's Pressable-as-<button> behavior forces this divergence. So the
// outermost element here is a plain View (not Pressable), the "main card body" (header, title,
// body, homework) is wrapped in one Pressable that fires onOpen, and the comment-count action is
// its own separate, sibling Pressable in the footer — not a descendant of the body Pressable.
export interface FeedAuthor {
  name?: string;
  role?: RoleKey;
  scope?: string;
}

export interface FeedCardProps {
  author?: FeedAuthor;
  /** Audience scope; sets the scope pill. */
  scope?: FeedScope;
  /** Announcement (serif title, org tone) vs class update (sans title). */
  kind?: "announcement" | "update";
  /** Small uppercase tag, e.g. "Homework" / "Reminder". */
  tag?: React.ReactNode;
  title?: React.ReactNode;
  body?: React.ReactNode;
  /** Optional homework callout strip. */
  homework?: React.ReactNode;
  pinned?: boolean;
  time?: React.ReactNode;
  /** Reach count (families/students). */
  reach?: React.ReactNode;
  /** Comment count; rendered as the right-aligned action. */
  comments?: number;
  onOpen?: () => void;
  style?: StyleProp<ViewStyle>;
}

type IconProps = { color: string; size: number };

function PinIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 17v5" />
      <Path d="M5 9V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4l-3 3v2H8v-2L5 9z" />
    </Svg>
  );
}

function ClockIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 7v5l3 2" />
    </Svg>
  );
}

function ReachIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <Circle cx={9} cy={7} r={4} />
      <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </Svg>
  );
}

function CommentIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function HomeworkIcon({ color, size }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Svg>
  );
}

export default function FeedCard({
  author = { name: "", role: "teacher", scope: "" },
  scope = "class",
  kind = "update",
  tag,
  title,
  body,
  homework,
  pinned = false,
  time = "",
  reach,
  comments,
  onOpen,
  style,
}: FeedCardProps) {
  const { theme } = useUnistyles();
  const sc = feedScopeMeta(scope);
  const scopeColor = colorAtPath(theme.colors, sc.colorTokenKey);
  const meta = feedCardMeta(kind, pinned);
  const tagTone = feedTagToneTokenKeys(kind);

  return (
    <View style={style}>
      <Card padding={theme.space["4"]}>
        <Pressable onPress={onOpen} accessibilityRole={onOpen ? "button" : undefined}>
          <View style={styles.headerRow}>
            <RoleBadge role={author.role} label={author.name || undefined} scope={author.scope || undefined} />
            <View style={styles.scopePill}>
              <View style={styles.scopeDot(scopeColor)} />
              <Text style={styles.scopeLabel}>{sc.label}</Text>
            </View>
            {tag ? (
              <View style={styles.tagPill(tagTone)}>
                <Text style={styles.tagLabel(tagTone)}>{tag}</Text>
              </View>
            ) : null}
            {meta.showPin ? (
              <View style={styles.pinnedRow}>
                <PinIcon color={theme.colors.gold2} size={13} />
                <Text style={styles.pinnedLabel}>Pinned</Text>
              </View>
            ) : null}
          </View>

          {title ? (
            <Text style={meta.titleFont === "display" ? styles.titleDisplay : styles.titleBody}>{title}</Text>
          ) : null}
          {body ? <Text style={styles.body}>{body}</Text> : null}

          {homework ? (
            <View style={styles.homework}>
              <HomeworkIcon color={theme.colors.status.present} size={15} />
              <Text style={styles.homeworkText}>
                <Text style={styles.homeworkStrong}>Homework:</Text> {homework}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <View style={styles.footer}>
          {time ? (
            <View style={styles.footerItem}>
              <ClockIcon color={theme.colors.ink3} size={13} />
              <Text style={styles.footerText}>{time}</Text>
            </View>
          ) : null}
          {reach != null ? (
            <View style={styles.footerItem}>
              <ReachIcon color={theme.colors.ink3} size={13} />
              <Text style={styles.footerNumber(theme.colors.ink3)}>{reach}</Text>
            </View>
          ) : null}
          {comments != null ? (
            <Pressable onPress={onOpen} style={styles.commentsAction} accessibilityRole="button">
              <CommentIcon color={theme.colors.primaryPressed} size={13} />
              <Text style={styles.footerNumber(theme.colors.primaryPressed)}>{comments}</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  headerRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    flexWrap: "wrap" as const,
    gap: theme.space["2"], // 8px — exact match to FeedCard.jsx's header gap
    // Deliberate literal — 11px (matches FeedCard.jsx's marginBottom: 11) sits between
    // space.2=8 and space.3=12; neither is a closer fit, so this is disclosed rather than
    // silently rounded (Comment.tsx precedent).
    marginBottom: 11,
  },
  scopePill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    // Deliberate literal — 6px (matches FeedCard.jsx's gap: 6) sits exactly between
    // space.1=4 and space.2=8, neither is a closer fit (StatusChip.tsx precedent).
    gap: 6,
    paddingVertical: theme.space["1"], // 4px — nearest token to the reference's 3px
    paddingHorizontal: theme.space["2"], // 8px — nearest token to the reference's 9px
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.appSurface2,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  scopeDot: (color: string) => ({
    // Tiny decorative dot diameter — same undisclosed-literal treatment as RoleBadge.tsx's
    // own 9px dot; not a spacing/radius value, just a fixed glyph size.
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: color,
  }),
  scopeLabel: {
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.eyebrow, // 11 — exact match to the reference's 11px
    color: theme.colors.ink2,
  },
  tagPill: (tone: { bg: string; fg: string }) => ({
    paddingVertical: theme.space["1"],
    paddingHorizontal: theme.space["2"],
    borderRadius: theme.radius.pill,
    backgroundColor: colorAtPath(theme.colors, tone.bg),
  }),
  tagLabel: (tone: { bg: string; fg: string }) => ({
    fontFamily: theme.fonts.bold,
    fontSize: theme.type.scale.eyebrow, // nearest token to the reference's 10px
    letterSpacing: theme.type.tracking.eyebrow, // nearest token to the reference's .1em
    textTransform: "uppercase" as const,
    color: colorAtPath(theme.colors, tone.fg),
  }),
  pinnedRow: {
    marginLeft: "auto" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["1"], // nearest token to the reference's 5px
  },
  pinnedLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: theme.type.scale.eyebrow, // nearest token to the reference's 10px
    letterSpacing: theme.type.tracking.eyebrow, // nearest token to the reference's .12em
    textTransform: "uppercase" as const,
    color: theme.colors.gold2,
  },
  titleDisplay: {
    // Marcellus is single-weight — no fontWeight paired here.
    fontFamily: theme.fonts.display,
    // Deliberate literal — 20px (matches FeedCard.jsx's announcement title) sits exactly
    // between scale.lead=18 and scale.h3=22, neither a closer fit, so this is disclosed
    // rather than silently rounded.
    fontSize: 20,
    lineHeight: 20 * theme.type.leading.snug, // nearest leading token to the reference's 1.2
    letterSpacing: theme.type.tracking.display, // exact match to the reference's .005em
    color: theme.colors.ink,
    marginBottom: theme.space["1"], // nearest token to the reference's 5px
  },
  titleBody: {
    fontFamily: theme.fonts.semibold, // fontWeight 600 in the reference — represented via family swap (RoleBadge/ListRow precedent)
    fontSize: theme.type.scale.body, // nearest token to the reference's 16.5px
    lineHeight: theme.type.scale.body * theme.type.leading.snug, // nearest leading token to the reference's 1.2
    color: theme.colors.ink,
    marginBottom: theme.space["1"], // nearest token to the reference's 5px
  },
  body: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm, // exact match to the reference's 14px
    lineHeight: theme.type.scale.sm * theme.type.leading.body, // nearest leading token to the reference's 1.55
    color: theme.colors.ink2,
  },
  homework: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["2"], // exact match to the reference's 8px
    marginTop: theme.space["3"], // exact match to the reference's 12px
    paddingVertical: theme.space["2"], // nearest token to the reference's 9px
    paddingHorizontal: theme.space["3"], // exact match to the reference's 12px
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.statusRamp.presentSoft,
    borderWidth: 1,
    borderColor: theme.colors.statusRamp.presentLine,
  },
  homeworkText: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.xs, // exact match to the reference's 13px
    color: theme.colors.status.present,
  },
  homeworkStrong: {
    fontFamily: theme.fonts.semibold,
  },
  footer: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["4"], // exact match to the reference's 16px
    marginTop: theme.space["3"], // nearest token to the reference's 13px
  },
  footerItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["1"], // nearest token to the reference's 5px
  },
  footerText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow, // nearest token to the reference's 12px
    color: theme.colors.ink3,
  },
  footerNumber: (color: string) => ({
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow, // nearest token to the reference's 12px
    fontVariant: ["tabular-nums" as const], // compared/counted number — global constraint
    color,
  }),
  commentsAction: {
    marginLeft: "auto" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: theme.space["1"], // nearest token to the reference's 5px
    minHeight: theme.chrome.hitMin, // >=44px touch target — global constraint
    minWidth: theme.chrome.hitMin, // >=44px touch target width — icon+gap+digits alone is well under 44px (ConversationRow.tsx/UserRoleRow.tsx squared-target precedent)
  },
}));

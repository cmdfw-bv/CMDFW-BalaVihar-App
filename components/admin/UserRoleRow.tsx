import "../../lib/unistyles";
import * as React from "react";
import { View, Text, Pressable, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import ListRow from "../core/ListRow";
import RoleBadge from "../core/RoleBadge";
import type { RoleKey } from "../core/RoleBadge.logic";
import { userRoleRowInitial, actionsForStatus } from "./UserRoleRow.logic";

// Matches design/sankalp/bv-connect/components/admin/UserRoleRow.jsx — admin row for a person:
// avatar, name, scope, their role badges (multi-persona supported), and approve/reject actions
// for pending accounts. Built on top of core/ListRow (leading/title/subtitle/trailing slots),
// per the Stage 7 brief — role badges + action button(s) both live in the trailing slot.
//
// PII: `name`/`email`/`scope` are opaque ReactNode props rendered as-is — never logged
// (`console.*`) or sent to any side channel.
export type RoleId = RoleKey;

export interface UserRoleAssignment {
  role: RoleId;
  scope?: string;
}

export interface UserRoleRowProps {
  name?: React.ReactNode;
  email?: React.ReactNode;
  /** Mono scope label (center/session). */
  scope?: React.ReactNode;
  /** One or more roles (strings or {role,scope}) — multi-persona supported. */
  roles?: (RoleId | UserRoleAssignment)[];
  /** active rows show a manage button; pending rows show approve/reject. */
  status?: "active" | "pending";
  onApprove?: () => void;
  onReject?: () => void;
  onManage?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function UserRoleRow({
  name,
  email,
  scope,
  roles = [],
  status = "active",
  onApprove,
  onReject,
  onManage,
  style,
}: UserRoleRowProps) {
  const { theme } = useUnistyles();
  const pending = status === "pending";
  const action = actionsForStatus(status);
  // Reference: `(name || "?").trim().charAt(0)` — guard for string type since `name` is
  // `React.ReactNode` here (same treatment as ConversationRow.tsx's `initial`).
  const initial = typeof name === "string" ? userRoleRowInitial(name) : "?";

  return (
    <View style={style}>
      <ListRow
        leading={
          <View style={styles.avatar}>
            <Text style={styles.avatarLabel}>{initial}</Text>
          </View>
        }
        title={
          <>
            {name}
            {pending ? (
              // The reference renders "Pending" as a bordered pill next to the name — RN's
              // <Text> (ListRow's title slot renders content inside a single <Text>) can't
              // nest a bordered <View>, so this is inline colored/tracked text instead.
              <Text style={styles.pendingLabel}> · PENDING</Text>
            ) : null}
          </>
        }
        subtitle={
          email != null || scope != null ? (
            <>
              {email}
              {email != null && scope != null ? " · " : null}
              {scope != null ? <Text style={styles.scope}>{scope}</Text> : null}
            </>
          ) : undefined
        }
        trailing={
          <View style={styles.trailingWrap}>
            {roles.length > 0 ? (
              <View style={styles.badgesWrap}>
                {roles.map((r, i) => {
                  const roleKey = typeof r === "string" ? r : r.role;
                  const roleScope = typeof r === "string" ? undefined : r.scope;
                  return <RoleBadge key={`${roleKey}-${i}`} role={roleKey} scope={roleScope} />;
                })}
              </View>
            ) : null}
            <View style={styles.actionsRow}>
              {action === "approve-reject" ? (
                <>
                  <Pressable onPress={onReject} accessibilityRole="button" accessibilityLabel="Reject" style={styles.iconBtn("danger")}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.absent} strokeWidth={2} strokeLinecap="round">
                      <Path d="M6 6l12 12M18 6 6 18" />
                    </Svg>
                  </Pressable>
                  <Pressable onPress={onApprove} accessibilityRole="button" accessibilityLabel="Approve" style={styles.iconBtn("success")}>
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.colors.status.present} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M5 12l4 4L19 6" />
                    </Svg>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={onManage} accessibilityRole="button" accessibilityLabel="Manage" style={styles.iconBtn("neutral")}>
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.colors.ink3} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
                    <Circle cx={12} cy={12} r={1.6} />
                    <Circle cx={19} cy={12} r={1.6} />
                    <Circle cx={5} cy={12} r={1.6} />
                  </Svg>
                </Pressable>
              )}
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  avatar: {
    // Space token 10 (40) matches the reference's width/height: 40 exactly.
    width: theme.space["10"],
    height: theme.space["10"],
    borderRadius: theme.space["10"] / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.colors.indigo,
  },
  avatarLabel: {
    // Marcellus is single-weight — no fontWeight paired here (StatTile.tsx/Comment.tsx precedent).
    fontFamily: theme.fonts.display,
    fontSize: theme.type.scale.body, // 16, exact match to the reference's 16px
    color: theme.colors.onAction,
  },
  // No distinct "warning" token in this theme — reusing the excused/amber family, same
  // substitution StatusChip.logic.ts makes for its warning-toned states.
  pendingLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 9.5, // no matching token, sits below the smallest scale.eyebrow=11 (ConversationRow.tsx's `scope` precedent)
    letterSpacing: theme.type.tracking.eyebrow, // nearest available tracking token to the reference's .12em
    textTransform: "uppercase" as const,
    color: theme.colors.status.excused,
  },
  scope: {
    fontFamily: theme.fonts.mono,
    color: theme.colors.ink4,
  },
  trailingWrap: {
    flexDirection: "column" as const,
    alignItems: "flex-end" as const,
    gap: theme.space["2"], // 8px
  },
  badgesWrap: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    justifyContent: "flex-end" as const,
    gap: theme.space["1"], // 4px — nearest token to the reference's 5px
  },
  actionsRow: {
    flexDirection: "row" as const,
    gap: theme.space["2"], // 8px, exact match to the reference's gap: 8
  },
  iconBtn: (variant: "danger" | "success" | "neutral") => {
    const tone =
      variant === "danger"
        ? { bg: theme.colors.statusRamp.absentSoft, border: theme.colors.statusRamp.absentLine }
        : variant === "success"
          ? { bg: theme.colors.statusRamp.presentSoft, border: theme.colors.statusRamp.presentLine }
          : { bg: theme.colors.appSurface, border: theme.colors.line2 };
    return {
      // theme.chrome.hitMin (44) — exact token match for the global >=44px touch-target rule
      // (CsvImport.tsx's confirmBtn precedent), not a disclosed literal like the reference's 36px.
      width: theme.chrome.hitMin,
      height: theme.chrome.hitMin,
      borderRadius: theme.chrome.hitMin / 2,
      borderWidth: 1,
      borderColor: tone.border,
      backgroundColor: tone.bg,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    };
  },
}));

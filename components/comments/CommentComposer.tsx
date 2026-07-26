import "../../lib/unistyles";
import * as React from "react";
import { View, Text, TextInput, Pressable, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { buildCommentPayload } from "./CommentComposer.logic";

// Matches design/sankalp/bv-connect/components/comments/CommentComposer.jsx — comment input
// row with an explicit public/private visibility toggle. This component never calls Supabase or
// writes anything itself; `onSend` is a prop callback only (client-privacy rule §11/§3).
export interface CommentComposerProps {
  /** Allow the public/private toggle (off for surfaces where all comments are public). */
  canPrivate?: boolean;
  placeholder?: string;
  /** Called with { body, isPrivate } on send. May reject/throw on failure (e.g. RLS denial,
   * network error) — the composer keeps the typed text and shows an error until it resolves. */
  onSend?: (payload: { body: string; isPrivate: boolean }) => void | Promise<void>;
  style?: StyleProp<ViewStyle>;
}

const TOGGLE_OPTIONS: { id: boolean; label: string }[] = [
  { id: false, label: "Public" },
  { id: true, label: "Private" },
];

export default function CommentComposer({ canPrivate = true, placeholder = "Add a comment…", onSend, style }: CommentComposerProps) {
  const { theme } = useUnistyles();
  const [value, setValue] = React.useState("");
  const [priv, setPriv] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState(false);
  const canSend = value.trim().length > 0 && !sending;

  const send = async () => {
    const payload = buildCommentPayload(value, priv);
    if (!payload) return;
    setSending(true);
    try {
      await onSend?.(payload);
      setValue("");
      setError(false);
    } catch {
      // Keep the typed text so nothing the user wrote is lost — they can retry.
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.inputRow(priv)}>
        <TextInput
          value={value}
          placeholder={placeholder}
          onChangeText={setValue}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityLabel="Send"
          style={styles.sendBtn(canSend)}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.colors.onAction} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M22 2 11 13" />
            <Path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </Svg>
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>Couldn&apos;t send. Try again.</Text> : null}
      {canPrivate ? (
        <View style={styles.toggle}>
          {TOGGLE_OPTIONS.map((o) => {
            const on = priv === o.id;
            return (
              <Pressable
                key={String(o.id)}
                onPress={() => setPriv(o.id)}
                accessibilityLabel={o.label}
                style={styles.toggleBtn(on, o.id)}
              >
                <Text style={styles.toggleLabel(on)}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flexDirection: "column" as const,
    gap: theme.space["2"],
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, neither is a
    // closer fit, so this is disclosed rather than silently rounded (matches CommentComposer.jsx's
    // paddingTop: 10; same treatment as StatusChip.tsx's precedent).
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  inputRow: (priv: boolean) => ({
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: theme.space["2"],
    backgroundColor: priv ? theme.colors.privateSoft : theme.colors.appSurface2,
    borderWidth: 1,
    borderColor: priv ? theme.colors.privateLine : theme.colors.line,
    borderRadius: theme.radius.control,
    // Deliberate literal — 6px sits exactly between space.1=4 and space.2=8, neither is a
    // closer fit, so this is disclosed rather than silently rounded (matches CommentComposer.jsx's
    // padding: 6; same treatment as StatusChip.tsx's precedent).
    padding: 6,
  }),
  input: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    lineHeight: theme.type.scale.sm * theme.type.leading.snug,
    color: theme.colors.ink,
    paddingHorizontal: theme.space["2"],
    paddingVertical: theme.space["2"],
    // Deliberate literal — 20px keeps a single empty line from collapsing thinner than the
    // reference's textarea (rows=1); no space token is close enough to this line-box minimum.
    minHeight: 20,
  },
  sendBtn: (canSend: boolean) => ({
    // Divergence from the reference's 36px circle (Task 1.7's Stepper set the same precedent):
    // this port uses theme.chrome.hitMin (44px) per the global >=44px touch-target constraint.
    width: theme.chrome.hitMin,
    height: theme.chrome.hitMin,
    borderRadius: theme.chrome.hitMin / 2,
    flexShrink: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: canSend ? theme.colors.primary : theme.colors.line2,
  }),
  toggle: {
    flexDirection: "row" as const,
    alignSelf: "flex-start" as const,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.pill,
    // Deliberate literal — 3px outer padding; no space token (nearest is space.1=4) is close
    // enough to prefer over the visual reference's padding: 3.
    padding: 3,
    // Deliberate literal — 2px gap between the two toggle segments; no space token is close
    // enough to prefer over the visual reference's gap: 2.
    gap: 2,
  },
  toggleBtn: (on: boolean, isPrivate: boolean) => ({
    // Divergence from the reference's compact pill (padding: "5px 12px", no explicit height):
    // this port enforces theme.chrome.hitMin (44px) per the global >=44px touch-target
    // constraint, same treatment as the send button above and Stepper.tsx's precedent.
    minHeight: theme.chrome.hitMin,
    paddingHorizontal: theme.space["3"],
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderRadius: theme.radius.pill,
    backgroundColor: on ? (isPrivate ? theme.colors.private : theme.colors.ink) : "transparent",
  }),
  toggleLabel: (on: boolean) => ({
    fontFamily: theme.fonts.semibold,
    fontSize: theme.type.scale.eyebrow,
    color: on ? theme.colors.onAction : theme.colors.ink3,
  }),
  errorText: {
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.eyebrow,
    color: theme.colors.status.absent,
  },
}));

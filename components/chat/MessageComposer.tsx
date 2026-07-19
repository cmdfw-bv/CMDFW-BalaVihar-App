import "../../lib/unistyles";
import * as React from "react";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Matches design/sankalp/bv-connect/components/chat/MessageComposer.jsx — the chat input bar:
// text field + send button, optional attach affordance. No derivable prop→variant contract (same
// "no fabricated logic module" call as core/ListRow) — this is controlled-input wiring only, and
// never calls Supabase or writes anything itself (client-privacy rule §11/§3); `onSend` is a
// props-only callback.
export interface MessageComposerProps {
  placeholder?: string;
  /** Called with the message text on send. */
  onSend?: (text: string) => void;
  /** Show the attach affordance. */
  allowAttach?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function MessageComposer({ placeholder = "Message…", onSend, allowAttach = false, style }: MessageComposerProps) {
  const { theme } = useUnistyles();
  const [value, setValue] = React.useState("");
  const canSend = value.trim().length > 0;

  const send = () => {
    if (value.trim()) {
      onSend?.(value);
    }
    setValue("");
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.wrap, style]}>
      {allowAttach ? (
        <Pressable accessibilityLabel="Attach" style={styles.attachBtn}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.colors.ink3} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24l-9.2 9.19a1 1 0 0 1-1.41-1.41l8.49-8.49" />
          </Svg>
        </Pressable>
      ) : null}
      <TextInput
        value={value}
        placeholder={placeholder}
        onChangeText={setValue}
        multiline
        style={styles.input}
      />
      <Pressable onPress={send} accessibilityLabel="Send" style={styles.sendBtn(canSend)}>
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={theme.colors.onAction} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M22 2 11 13" />
          <Path d="M22 2 15 22l-4-9-9-4 20-7z" />
        </Svg>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    gap: theme.space["2"],
    // Deliberate literal — 10px sits exactly between space.2=8 and space.3=12, neither is a
    // closer fit, so this is disclosed rather than silently rounded (matches the reference's
    // padding: 10; same treatment as CommentComposer.tsx's precedent).
    padding: 10,
    backgroundColor: theme.colors.appSurface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.line,
  },
  attachBtn: {
    // Divergence from the reference's 40px circle: this port enforces theme.chrome.hitMin (44px)
    // per the global >=44px touch-target constraint, same treatment as CommentComposer.tsx's
    // sendBtn precedent.
    width: theme.chrome.hitMin,
    height: theme.chrome.hitMin,
    borderRadius: theme.chrome.hitMin / 2,
    flexShrink: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: theme.colors.line2,
    backgroundColor: theme.colors.appSurface,
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.body,
    fontSize: theme.type.scale.sm,
    lineHeight: theme.type.scale.sm * theme.type.leading.snug,
    color: theme.colors.ink,
    backgroundColor: theme.colors.appSurface2,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.bubble,
    paddingHorizontal: theme.space["3"], // 12px, nearest to the reference's 14px
    paddingVertical: theme.space["2"], // 8px, nearest to the reference's 11px
    // Deliberate literals — the reference's textarea `minHeight: 22`/`maxHeight: 120` are
    // line-box sizing, not spacing-scale values; no space token models this axis (same
    // treatment as CommentComposer.tsx's `input.minHeight: 20` precedent).
    minHeight: 22,
    maxHeight: 120,
  },
  sendBtn: (canSend: boolean) => ({
    width: theme.chrome.hitMin,
    height: theme.chrome.hitMin,
    borderRadius: theme.chrome.hitMin / 2,
    flexShrink: 0,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: canSend ? theme.colors.primary : theme.colors.line2,
  }),
}));

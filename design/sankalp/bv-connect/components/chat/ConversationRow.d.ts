import * as React from "react";

export interface ConversationRowProps {
  name?: React.ReactNode;
  /** Last-message preview (truncates). */
  preview?: React.ReactNode;
  time?: React.ReactNode;
  /** Unread count; 0 hides the badge. */
  unread?: number;
  /** Group class-chat vs 1:1 DM. */
  kind?: "group" | "dm";
  /** Role hue for DM avatars. */
  role?: "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";
  /** Optional mono scope label (e.g. "JR·A"). */
  scope?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * ConversationRow — a messages-list row for a class group chat or a DM.
 */
export function ConversationRow(props: ConversationRowProps): JSX.Element;

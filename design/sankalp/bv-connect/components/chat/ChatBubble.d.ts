import * as React from "react";

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
  style?: React.CSSProperties;
}

/**
 * ChatBubble — a group-chat or DM message bubble with optional read tick.
 */
export function ChatBubble(props: ChatBubbleProps): JSX.Element;

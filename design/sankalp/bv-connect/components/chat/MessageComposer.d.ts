import * as React from "react";

export interface MessageComposerProps {
  placeholder?: string;
  /** Called with the message text on send. */
  onSend?: (text: string) => void;
  /** Show the attach affordance. */
  allowAttach?: boolean;
  style?: React.CSSProperties;
}

/**
 * MessageComposer — chat input bar (Enter to send, Shift+Enter newline).
 */
export function MessageComposer(props: MessageComposerProps): JSX.Element;

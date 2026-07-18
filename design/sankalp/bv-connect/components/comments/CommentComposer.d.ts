import * as React from "react";

export interface CommentComposerProps {
  /** Allow the public/private toggle (off for surfaces where all comments are public). */
  canPrivate?: boolean;
  placeholder?: string;
  /** Called with { body, isPrivate } on send. */
  onSend?: (payload: { body: string; isPrivate: boolean }) => void;
  style?: React.CSSProperties;
}

/**
 * CommentComposer — comment input with an explicit public/private toggle.
 */
export function CommentComposer(props: CommentComposerProps): JSX.Element;

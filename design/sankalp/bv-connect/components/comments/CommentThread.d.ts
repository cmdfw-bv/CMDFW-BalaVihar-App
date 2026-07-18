import * as React from "react";
import { CommentProps } from "./Comment";

export interface CommentThreadProps {
  /** Override the count shown in the header (defaults to comments.length). */
  count?: number;
  /** Comments to render (each is a CommentProps object). */
  comments?: CommentProps[];
  /** Composer slot, rendered after the list. */
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * CommentThread — count header + a list of Comments + an optional composer.
 */
export function CommentThread(props: CommentThreadProps): JSX.Element;

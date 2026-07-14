import * as React from "react";

export interface CommentAuthor {
  name?: string;
  role?: "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";
}

export interface CommentProps {
  author?: CommentAuthor;
  time?: React.ReactNode;
  body?: React.ReactNode;
  /** Private (teacher ↔ one parent): tinted card + lock. */
  isPrivate?: boolean;
  style?: React.CSSProperties;
}

/**
 * Comment — a single comment row; public, or tinted+locked when private.
 */
export function Comment(props: CommentProps): JSX.Element;

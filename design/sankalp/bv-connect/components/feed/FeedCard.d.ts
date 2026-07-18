import * as React from "react";

export interface FeedAuthor {
  name?: string;
  role?: "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";
  scope?: string;
}

export interface FeedCardProps {
  author?: FeedAuthor;
  /** Audience scope; sets the scope pill. */
  scope?: "org" | "center" | "class";
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
  style?: React.CSSProperties;
}

/**
 * FeedCard — an announcement or class update in the home feed.
 * @startingPoint section="BV Feed" subtitle="Announcement / class-update feed item" viewport="440x220"
 */
export function FeedCard(props: FeedCardProps): JSX.Element;

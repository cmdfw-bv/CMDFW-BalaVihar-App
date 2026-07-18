import * as React from "react";

export interface NotificationItemProps {
  /** Event type → icon + hue. */
  type?: "update" | "announce" | "absence" | "approval" | "chat";
  title?: React.ReactNode;
  body?: React.ReactNode;
  time?: React.ReactNode;
  unread?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * NotificationItem — a notifications-center row (push/email event).
 */
export function NotificationItem(props: NotificationItemProps): JSX.Element;

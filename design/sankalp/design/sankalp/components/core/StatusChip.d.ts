import * as React from "react";

export interface StatusChipProps {
  /** Status family. Marketing: open/soon/past/featured. App: present/absent/excused/info. */
  status?: "open" | "soon" | "past" | "featured" | "present" | "absent" | "excused" | "info" | "neutral";
  /** Force the leading dot on/off (defaults on for open & present). */
  dot?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * StatusChip — uppercase capsule status marker for events and attendance.
 */
export function StatusChip(props: StatusChipProps): JSX.Element;

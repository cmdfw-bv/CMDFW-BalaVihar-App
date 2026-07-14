import * as React from "react";

export interface AuditEntryProps {
  /** Timestamp (mono, tabular). */
  time?: React.ReactNode;
  /** Actor, e.g. "teacher:JR·A" or "coordinator". */
  actor?: React.ReactNode;
  /** Action verb → color. */
  action?: "view" | "edit" | "export" | "approve" | "delete";
  /** What was accessed, e.g. "student #3 record". */
  target?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * AuditEntry — one mono line in the minors'-access audit log.
 */
export function AuditEntry(props: AuditEntryProps): JSX.Element;

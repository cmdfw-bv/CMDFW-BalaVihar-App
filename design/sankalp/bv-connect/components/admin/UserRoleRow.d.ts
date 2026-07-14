import * as React from "react";

export type RoleId = "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";

export interface UserRoleAssignment {
  role: RoleId;
  scope?: string;
}

export interface UserRoleRowProps {
  name?: React.ReactNode;
  email?: React.ReactNode;
  /** Mono scope label (center/session). */
  scope?: React.ReactNode;
  /** One or more roles (strings or {role,scope}) — multi-persona supported. */
  roles?: (RoleId | UserRoleAssignment)[];
  /** active rows show a manage button; pending rows show approve/reject. */
  status?: "active" | "pending";
  onApprove?: () => void;
  onReject?: () => void;
  onManage?: () => void;
  style?: React.CSSProperties;
}

/**
 * UserRoleRow — admin person row with multi-persona badges + approve/reject.
 */
export function UserRoleRow(props: UserRoleRowProps): JSX.Element;

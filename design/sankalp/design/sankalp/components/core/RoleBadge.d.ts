import * as React from "react";

export interface RoleBadgeProps {
  /** One of the six personas; sets the leading hue. */
  role?: "student" | "parent" | "teacher" | "coordinator" | "bv" | "admin";
  /** Override the visible name (defaults to the role's label). */
  label?: React.ReactNode;
  /** Optional mono scope label (e.g. "JR·A", "BRAMPTON"). */
  scope?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * RoleBadge — role-hued capsule with optional mono scope, for the
 * multi-persona / access-scope model.
 * @startingPoint section="Core" subtitle="Six role badges + scope label" viewport="700x120"
 */
export function RoleBadge(props: RoleBadgeProps): JSX.Element;

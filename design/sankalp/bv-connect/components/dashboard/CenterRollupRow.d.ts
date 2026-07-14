import * as React from "react";

export interface CenterRollupRowProps {
  name?: React.ReactNode;
  region?: React.ReactNode;
  /** Attendance percent (0–100). */
  attendance?: number;
  marked?: number;
  enrolled?: number;
  /** No data yet — render an honest "—" instead of figures. */
  placeholder?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

/**
 * CenterRollupRow — a per-center row in the org-level attendance rollup.
 */
export function CenterRollupRow(props: CenterRollupRowProps): JSX.Element;

import * as React from "react";

export interface ComplianceBarProps {
  label?: React.ReactNode;
  /** 0–100. Tone auto-derives (≥85 success, ≥70 warning, else danger). */
  value?: number;
  /** Unit appended to value (default "%"). */
  suffix?: string;
  /** Override the displayed figure (e.g. "47/50"); bar still uses value. */
  display?: React.ReactNode;
  note?: React.ReactNode;
  /** Force the tone instead of deriving from value. */
  status?: "success" | "warning" | "danger" | "info";
  style?: React.CSSProperties;
}

/**
 * ComplianceBar — labelled progress bar with auto-toned, mono-tabular figure.
 */
export function ComplianceBar(props: ComplianceBarProps): JSX.Element;

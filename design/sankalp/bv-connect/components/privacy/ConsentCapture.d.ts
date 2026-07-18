import * as React from "react";

export interface ConsentItem {
  id: string;
  label: React.ReactNode;
  help?: React.ReactNode;
  required?: boolean;
}

export interface ConsentCaptureProps {
  items?: ConsentItem[];
  /** id → boolean opt-in state. */
  values?: Record<string, boolean>;
  /** id → captured timestamp string (shown once checked). */
  timestamps?: Record<string, React.ReactNode>;
  onToggle?: (id: string) => void;
  style?: React.CSSProperties;
}

/**
 * ConsentCapture — timestamped parental/media consent opt-ins.
 */
export function ConsentCapture(props: ConsentCaptureProps): JSX.Element;

import * as React from "react";

export interface LogoProps {
  /** Relative path to the OM mark png. */
  src?: string;
  /** Mark height in px (wordmark scales from this). */
  size?: number;
  /** Show the serif wordmark + tagline beside the mark. */
  wordmark?: boolean;
  title?: string;
  tagline?: string;
  /** Flip text to cream for dark/indigo/ink surfaces. */
  onDark?: boolean;
  style?: React.CSSProperties;
}

/**
 * Logo — OM mark + serif wordmark lockup.
 */
export function Logo(props: LogoProps): JSX.Element;

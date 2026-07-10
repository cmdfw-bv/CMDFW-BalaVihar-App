import * as React from "react";

export interface ButtonProps {
  /** Visual style. One `primary` (terracotta) action per view. `outline` is for dark/poster surfaces; `gold` is a festival highlight; `dark` is the ink submit used in forms. */
  variant?: "primary" | "secondary" | "ghost" | "outline" | "gold" | "danger" | "dark";
  /** Size / density. */
  size?: "sm" | "md" | "lg" | "xl";
  type?: "button" | "submit" | "reset";
  /** Render as an anchor instead of a button. */
  href?: string;
  /** Leading icon node (inline SVG). */
  icon?: React.ReactNode;
  /** Trailing icon node (e.g. the arrow glyph). */
  iconRight?: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Button — capsule action control for Chinmaya Mission surfaces.
 * @startingPoint section="Core" subtitle="Action button — 7 variants, 4 sizes" viewport="700x180"
 */
export function Button(props: ButtonProps): JSX.Element;

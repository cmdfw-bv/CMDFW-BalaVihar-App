import * as React from "react";

export interface CardProps {
  /** Surface tone. `surface` (default white-cream), `cream` (raised well), `indigo` (dark poster). */
  tone?: "surface" | "cream" | "indigo";
  /** Lift + terracotta border on hover (event cards, pickers). */
  interactive?: boolean;
  /** Element/tag to render as. */
  as?: any;
  /** Inner padding in px. */
  padding?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Card — warm-paper surface container with the signature 18px radius.
 */
export function Card(props: CardProps): JSX.Element;

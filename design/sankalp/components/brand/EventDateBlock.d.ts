import * as React from "react";

export interface EventDateBlockProps {
  day: React.ReactNode;
  month: React.ReactNode;
  year?: React.ReactNode;
  /** Day-figure size. */
  size?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}

/**
 * EventDateBlock — big terracotta serif day over uppercase month/year.
 */
export function EventDateBlock(props: EventDateBlockProps): JSX.Element;

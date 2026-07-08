import * as React from "react";

export interface StatTileProps {
  /** Uppercase label above the figure. */
  label: React.ReactNode;
  /** The figure itself. */
  value: React.ReactNode;
  /** Render the value in the large display serif (hero stats) instead of mono. */
  display?: boolean;
  /** Color the figure terracotta. */
  accent?: boolean;
  style?: React.CSSProperties;
}

/**
 * StatTile — a labelled figure; mono-tabular by default, serif when `display`.
 */
export function StatTile(props: StatTileProps): JSX.Element;

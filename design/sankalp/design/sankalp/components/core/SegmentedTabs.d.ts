import * as React from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  count?: number;
}

export interface SegmentedTabsProps {
  /** Tabs as strings, or {id,label,count} objects for count badges. */
  tabs: (string | TabItem)[];
  /** Active tab id. */
  value: string;
  onChange: (id: string) => void;
  style?: React.CSSProperties;
}

/**
 * SegmentedTabs — capsule tab group with an ink-filled active tab.
 */
export function SegmentedTabs(props: SegmentedTabsProps): JSX.Element;

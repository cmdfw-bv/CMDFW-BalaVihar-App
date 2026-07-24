import type { ReactNode } from 'react';

export function consentItemState(id: string, values: Record<string, boolean>, timestamps: Record<string, ReactNode>): { checked: boolean; timestamp: ReactNode | undefined } {
  const checked = !!values[id];
  return { checked, timestamp: checked ? timestamps[id] : undefined };
}

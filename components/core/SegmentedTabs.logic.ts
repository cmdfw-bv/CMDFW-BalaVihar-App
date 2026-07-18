import type * as React from 'react';

export interface TabItem { id: string; label: React.ReactNode; count?: number }
export interface NormalizedTab { id: string; label: React.ReactNode; count?: number }

export function normalizeTab(t: string | TabItem): NormalizedTab {
  return typeof t === 'string' ? { id: t, label: t, count: undefined } : { id: t.id, label: t.label, count: t.count };
}

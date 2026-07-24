export type FeedScope = "org" | "center" | "class";
export const FEED_SCOPE_KEYS: FeedScope[] = ['org', 'center', 'class'];

const SCOPE_META: Record<FeedScope, { label: string; colorTokenKey: string }> = {
  org:    { label: 'Org-wide', colorTokenKey: 'scope.org' },
  center: { label: 'Center',   colorTokenKey: 'scope.center' },
  class:  { label: 'Class',    colorTokenKey: 'scope.class' },
};

export function feedScopeMeta(scope: FeedScope): { label: string; colorTokenKey: string } {
  return SCOPE_META[scope];
}

export function feedCardMeta(kind: 'announcement' | 'update', pinned?: boolean): { titleFont: 'display' | 'body'; showPin: boolean } {
  return { titleFont: kind === 'announcement' ? 'display' : 'body', showPin: kind === 'announcement' && !!pinned };
}

// Tag pill + homework callout tint — the reference's own logic (isAnnouncement ? primary : success),
// not part of the brief's required interface, but kept here (not inline in the .tsx) to match this
// kit's pure-logic-module convention (ComplianceBar.logic.ts / Comment.logic.ts precedent).
export function feedTagToneTokenKeys(kind: 'announcement' | 'update'): { bg: string; fg: string } {
  return kind === 'announcement'
    ? { bg: 'primarySoft', fg: 'primaryPressed' }
    : { bg: 'statusRamp.presentSoft', fg: 'status.present' };
}

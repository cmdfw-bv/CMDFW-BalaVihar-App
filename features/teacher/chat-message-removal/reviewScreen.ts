import type { Role } from '@/lib/auth/navMap';
import { roleBadgeMeta, type RoleKey } from '../../../components/core/RoleBadge.logic';
import type { RemovedMessageRow, RemovedMessagesCursor } from './api';
import type { ReviewView } from './viewState';

// Pure display logic for the Removed messages screen, so the screen itself is layout only.

/** The header's scope: a coordinator's own session, or everything for org-wide roles. */
export function reviewScopeText(role: string | null, scopeLabel: string | null): string | null {
  if (role === 'coordinator') return scopeLabel ? `Session: ${scopeLabel}` : null;
  if (role === 'bv_coordinator' || role === 'admin') return 'All sessions';
  return null;
}

/** The kit's RoleBadge names the BV Coordinator hue `bv`. */
export function roleBadgeKey(role: Role): RoleKey {
  return role === 'bv_coordinator' ? 'bv' : role;
}

const ROLES: readonly Role[] = ['student', 'parent', 'teacher', 'coordinator', 'bv_coordinator', 'admin'];

/** The session hands the active role over as a plain string; anything unrecognised gets no badge. */
export function reviewBadgeRole(role: string | null): RoleKey | null {
  return ROLES.includes(role as Role) ? roleBadgeKey(role as Role) : null;
}

/** "Nov 9, 9:41". `timeZone` is for tests; the screen uses the device zone. */
export function formatReviewTime(iso: string, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  // Intl pads a 24h hour to two digits; the spec's meta line reads "9:41".
  return `${part('month')} ${part('day')}, ${Number(part('hour'))}:${part('minute')}`;
}

// Labels come from get_removed_messages_for_oversight: a student is "First L." (the only label
// that needs its role added), a parent is already "Parent · <family>", the fallbacks are the bare
// words "Student"/"Parent", and staff senders are their raw role name, shown as its display name.
function senderText(row: RemovedMessageRow): string {
  if (!row.senderRole) return row.senderLabel;
  if (row.senderLabel === row.senderRole) return roleBadgeMeta(roleBadgeKey(row.senderRole)).label;
  if (row.senderRole === 'student' && row.senderLabel !== 'Student') return `${row.senderLabel} (student)`;
  return row.senderLabel;
}

export function reviewMetaLine(row: RemovedMessageRow, timeZone?: string): string {
  return `${row.className} · ${senderText(row)} · ${formatReviewTime(row.createdAt, timeZone)}`;
}

export function reviewRemoverLine(row: RemovedMessageRow, timeZone?: string): string {
  return `Removed by ${row.removerLabel} · ${formatReviewTime(row.removedAt, timeZone)}`;
}

export type ReviewFooter = 'loadMore' | 'loadingMore' | 'retry' | 'none';
export type ReviewBody =
  | { kind: 'skeleton' }
  | { kind: 'empty' }
  | { kind: 'error' }
  | { kind: 'list'; rows: RemovedMessageRow[]; footer: ReviewFooter };

export function reviewBody(view: ReviewView): ReviewBody {
  if (view.kind === 'loading') return { kind: 'skeleton' };
  if (view.kind === 'empty') return { kind: 'empty' };
  // A failed first load has nothing to keep. It must read as an error, never as "none removed".
  if (view.rows.length === 0) return { kind: 'error' };
  const footer: ReviewFooter = view.loadError
    ? 'retry'
    : view.loadingMore
      ? 'loadingMore'
      : view.hasMore
        ? 'loadMore'
        : 'none';
  return { kind: 'list', rows: view.rows, footer };
}

/** Keyset cursor for the page after `rows` (the function orders by removed_at, message_id desc). */
export function nextCursor(rows: RemovedMessageRow[]): RemovedMessagesCursor | undefined {
  const last = rows[rows.length - 1];
  return last ? { removedAt: last.removedAt, id: last.messageId } : undefined;
}

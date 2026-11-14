import { describe, it, expect } from 'vitest';
import {
  reviewScopeText,
  roleBadgeKey,
  reviewBadgeRole,
  formatReviewTime,
  reviewMetaLine,
  reviewRemoverLine,
  reviewBody,
  nextCursor,
} from '../reviewScreen';
import type { RemovedMessageRow } from '../api';
import type { ReviewView } from '../viewState';

const row = (over: Partial<RemovedMessageRow> = {}): RemovedMessageRow => ({
  messageId: 'm1',
  className: 'Grade 4',
  senderLabel: 'Aarav M.',
  senderRole: 'student',
  createdAt: '2026-11-09T09:41:00Z',
  body: 'original text',
  removerLabel: 'the Grade 4 teacher',
  removedByRole: 'teacher',
  removedAt: '2026-11-09T09:50:00Z',
  ...over,
});

describe('reviewScopeText', () => {
  it('a coordinator sees their session', () => {
    expect(reviewScopeText('coordinator', 'Sunday AM')).toBe('Session: Sunday AM');
  });
  it('bv_coordinator and admin see all sessions', () => {
    expect(reviewScopeText('bv_coordinator', 'Org')).toBe('All sessions');
    expect(reviewScopeText('admin', null)).toBe('All sessions');
  });
  it('a coordinator without a resolved label shows no scope rather than an empty one', () => {
    expect(reviewScopeText('coordinator', null)).toBeNull();
  });
  it('other roles get no scope', () => {
    expect(reviewScopeText('teacher', 'Grade 4')).toBeNull();
    expect(reviewScopeText(null, null)).toBeNull();
  });
});

describe('roleBadgeKey', () => {
  it('maps bv_coordinator onto the badge key bv', () => {
    expect(roleBadgeKey('bv_coordinator')).toBe('bv');
  });
  it('passes the other roles through', () => {
    expect(roleBadgeKey('coordinator')).toBe('coordinator');
    expect(roleBadgeKey('admin')).toBe('admin');
  });
});

describe('reviewBadgeRole', () => {
  it('maps the session\'s active role onto a badge key', () => {
    expect(reviewBadgeRole('bv_coordinator')).toBe('bv');
    expect(reviewBadgeRole('coordinator')).toBe('coordinator');
  });
  it('shows no badge for a missing or unrecognised role', () => {
    expect(reviewBadgeRole(null)).toBeNull();
    expect(reviewBadgeRole('superuser')).toBeNull();
  });
});

describe('formatReviewTime', () => {
  it('formats as short month, day and 24h time in the given zone', () => {
    expect(formatReviewTime('2026-11-09T09:41:00Z', 'UTC')).toBe('Nov 9, 9:41');
    expect(formatReviewTime('2026-11-09T21:05:00Z', 'UTC')).toBe('Nov 9, 21:05');
  });
  it('respects the time zone', () => {
    expect(formatReviewTime('2026-11-09T03:00:00Z', 'America/Chicago')).toBe('Nov 8, 21:00');
  });
});

describe('reviewMetaLine', () => {
  it('is class · sender (role) · time', () => {
    expect(reviewMetaLine(row(), 'UTC')).toBe('Grade 4 · Aarav M. (student) · Nov 9, 9:41');
  });
  it('a parent label already names the role, so it is shown as given', () => {
    expect(reviewMetaLine(row({ senderLabel: 'Parent · Mehta family', senderRole: 'parent' }), 'UTC')).toBe(
      'Grade 4 · Parent · Mehta family · Nov 9, 9:41',
    );
  });
  it('the database fallbacks "Student" and "Parent" get no suffix', () => {
    expect(reviewMetaLine(row({ senderLabel: 'Student', senderRole: 'student' }), 'UTC')).toBe(
      'Grade 4 · Student · Nov 9, 9:41',
    );
    expect(reviewMetaLine(row({ senderLabel: 'Parent', senderRole: 'parent' }), 'UTC')).toBe(
      'Grade 4 · Parent · Nov 9, 9:41',
    );
  });
  it('when the label is just the role, shows the role name once', () => {
    expect(reviewMetaLine(row({ senderLabel: 'teacher', senderRole: 'teacher' }), 'UTC')).toBe(
      'Grade 4 · Teacher · Nov 9, 9:41',
    );
    expect(reviewMetaLine(row({ senderLabel: 'bv_coordinator', senderRole: 'bv_coordinator' }), 'UTC')).toBe(
      'Grade 4 · BV Coordinator · Nov 9, 9:41',
    );
  });
  it('an unknown sender has no role suffix', () => {
    expect(reviewMetaLine(row({ senderLabel: 'Unknown sender', senderRole: null }), 'UTC')).toBe(
      'Grade 4 · Unknown sender · Nov 9, 9:41',
    );
  });
});

describe('reviewRemoverLine', () => {
  it('is "Removed by <who> · <time>"', () => {
    expect(reviewRemoverLine(row(), 'UTC')).toBe('Removed by the Grade 4 teacher · Nov 9, 9:50');
  });
});

describe('reviewBody', () => {
  const content = (over: Partial<Extract<ReviewView, { kind: 'content' }>> = {}): ReviewView => ({
    kind: 'content', rows: [row()], hasMore: false, loadingMore: false, loadError: false, ...over,
  });

  it('loading renders the skeleton', () => {
    expect(reviewBody({ kind: 'loading' })).toEqual({ kind: 'skeleton' });
  });
  it('empty renders the empty state', () => {
    expect(reviewBody({ kind: 'empty' })).toEqual({ kind: 'empty' });
  });
  it('a first-load failure is the error state, never the empty state', () => {
    expect(reviewBody(content({ rows: [], loadError: true }))).toEqual({ kind: 'error' });
  });
  it('content with more shows Load more', () => {
    expect(reviewBody(content({ hasMore: true }))).toMatchObject({ kind: 'list', footer: 'loadMore' });
  });
  it('content while loading more shows the busy footer', () => {
    expect(reviewBody(content({ hasMore: true, loadingMore: true }))).toMatchObject({ footer: 'loadingMore' });
  });
  it('a load-more failure keeps the rows and offers an inline retry', () => {
    const b = reviewBody(content({ hasMore: true, loadError: true }));
    expect(b).toMatchObject({ kind: 'list', footer: 'retry' });
    expect(b.kind === 'list' && b.rows).toHaveLength(1);
  });
  it('the last page has no footer button', () => {
    expect(reviewBody(content())).toMatchObject({ kind: 'list', footer: 'none' });
  });
});

describe('nextCursor', () => {
  it('is the last row’s removedAt and message id', () => {
    const rows = [row({ messageId: 'a' }), row({ messageId: 'b', removedAt: '2026-11-01T00:00:00Z' })];
    expect(nextCursor(rows)).toEqual({ removedAt: '2026-11-01T00:00:00Z', id: 'b' });
  });
  it('is undefined with no rows', () => {
    expect(nextCursor([])).toBeUndefined();
  });
});

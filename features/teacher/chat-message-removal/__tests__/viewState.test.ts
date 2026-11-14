import { describe, it, expect } from 'vitest';
import { reduceReview, type ReviewView } from '../viewState';
import type { RemovedMessageRow } from '../api';

const row = (i: number): RemovedMessageRow => ({
  messageId: `m${i}`, className: 'C', senderLabel: 's', senderRole: 'student',
  createdAt: '2026-11-01T00:00:00Z', body: 'b', removerLabel: 'r', removedByRole: 'teacher',
  removedAt: '2026-11-02T00:00:00Z',
});
const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => row(from + i));
const loading: ReviewView = { kind: 'loading' };

describe('reduceReview', () => {
  it('loaded([]) from loading is empty', () => {
    expect(reduceReview(loading, { type: 'loaded', rows: [] })).toEqual({ kind: 'empty' });
  });
  it('a full first page has more', () => {
    const s = reduceReview(loading, { type: 'loaded', rows: rows(20) });
    expect(s).toMatchObject({ kind: 'content', hasMore: true, loadingMore: false, loadError: false });
  });
  it('a short first page has no more', () => {
    expect(reduceReview(loading, { type: 'loaded', rows: rows(3) })).toMatchObject({ hasMore: false });
  });
  it('loadMoreStarted sets loadingMore and clears loadError', () => {
    const s: ReviewView = { kind: 'content', rows: rows(20), hasMore: true, loadingMore: false, loadError: true };
    expect(reduceReview(s, { type: 'loadMoreStarted' })).toMatchObject({ loadingMore: true, loadError: false });
  });
  it('loadedMore appends and recomputes hasMore from the last page', () => {
    const s: ReviewView = { kind: 'content', rows: rows(20), hasMore: true, loadingMore: true, loadError: false };
    const n = reduceReview(s, { type: 'loadedMore', rows: rows(5, 20) });
    expect(n).toMatchObject({ kind: 'content', hasMore: false, loadingMore: false, loadError: false });
    expect((n as any).rows).toHaveLength(25);
  });
  it('failed in content keeps rows and sets loadError', () => {
    const s: ReviewView = { kind: 'content', rows: rows(20), hasMore: true, loadingMore: true, loadError: false };
    expect(reduceReview(s, { type: 'failed' })).toEqual({ ...s, loadingMore: false, loadError: true });
  });
  it('failed from loading is content with no rows and loadError', () => {
    expect(reduceReview(loading, { type: 'failed' })).toEqual({
      kind: 'content', rows: [], hasMore: false, loadingMore: false, loadError: true,
    });
  });
  it('loaded after a failed first load recovers', () => {
    const failed = reduceReview(loading, { type: 'failed' });
    expect(reduceReview(failed, { type: 'loaded', rows: rows(2) })).toMatchObject({ kind: 'content', loadError: false });
  });
});

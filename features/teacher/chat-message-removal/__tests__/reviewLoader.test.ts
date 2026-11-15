import { describe, it, expect, vi } from 'vitest';
import { createReviewLoader } from '../reviewLoader';
import { initialReview, reduceReview, type ReviewView } from '../viewState';
import type { RemovedMessageRow, RemovedMessagesCursor } from '../api';

const row = (i: number): RemovedMessageRow => ({
  messageId: `m${i}`, className: 'C', senderLabel: 's', senderRole: 'student',
  createdAt: '2026-11-01T00:00:00Z', body: 'b', removerLabel: 'r', removedByRole: 'teacher',
  removedAt: `2026-11-02T00:00:${String(59 - i).padStart(2, '0')}Z`,
});
const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => row(from + i));
const coded = (code: string) => Object.assign(new Error('rpc_failed'), { code });

function harness(fetch: (cursor?: RemovedMessagesCursor) => Promise<RemovedMessageRow[]>) {
  let view: ReviewView = initialReview;
  const onError = vi.fn();
  const loader = createReviewLoader({
    fetch,
    getView: () => view,
    dispatch: (e) => { view = reduceReview(view, e); },
    reset: () => { view = initialReview; },
    onError,
  });
  return { loader, onError, view: () => view };
}

describe('createReviewLoader', () => {
  it('loadFirst fetches without a cursor and shows the rows', async () => {
    const fetch = vi.fn().mockResolvedValue(rows(20));
    const h = harness(fetch);
    await h.loader.loadFirst();
    expect(fetch).toHaveBeenCalledWith(undefined);
    expect(h.view()).toMatchObject({ kind: 'content', hasMore: true });
  });

  it('a first-load failure lands in the error shape and reports the code only', async () => {
    const h = harness(vi.fn().mockRejectedValue(coded('42501')));
    await h.loader.loadFirst();
    expect(h.view()).toMatchObject({ kind: 'content', rows: [], loadError: true });
    expect(h.onError).toHaveBeenCalledWith({ source: 'load', code: '42501' });
  });

  it('a retry after a first-load failure resets to loading and re-runs the first load', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(coded('PGRST')).mockResolvedValueOnce(rows(2));
    const h = harness(fetch);
    await h.loader.loadFirst();
    const p = h.loader.loadFirst();
    expect(h.view()).toEqual({ kind: 'loading' });
    await p;
    expect(fetch).toHaveBeenLastCalledWith(undefined);
    expect(h.view()).toMatchObject({ kind: 'content', rows: rows(2), hasMore: false });
  });

  it('loadMore pages from the last row and appends', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(rows(20)).mockResolvedValueOnce(rows(3, 20));
    const h = harness(fetch);
    await h.loader.loadFirst();
    await h.loader.loadMore();
    expect(fetch).toHaveBeenLastCalledWith({ removedAt: row(19).removedAt, id: 'm19' });
    expect(h.view()).toMatchObject({ kind: 'content', hasMore: false });
    expect((h.view() as { rows: unknown[] }).rows).toHaveLength(23);
  });

  it('a load-more failure keeps the rows, flags the error and reports the code', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(rows(20)).mockRejectedValueOnce(new TypeError('Failed to fetch https://x'));
    const h = harness(fetch);
    await h.loader.loadFirst();
    await h.loader.loadMore();
    expect(h.view()).toMatchObject({ kind: 'content', loadError: true, loadingMore: false });
    expect((h.view() as { rows: unknown[] }).rows).toHaveLength(20);
    expect(h.onError).toHaveBeenCalledWith({ source: 'loadMore', code: 'TypeError' });
  });

  it('loadMore does nothing when there is no more, or a page is already loading', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(rows(3));
    const h = harness(fetch);
    await h.loader.loadFirst();
    await h.loader.loadMore();
    expect(fetch).toHaveBeenCalledTimes(1);

    let release!: (r: RemovedMessageRow[]) => void;
    const fetch2 = vi.fn().mockResolvedValueOnce(rows(20)).mockReturnValueOnce(new Promise((r) => { release = r; }));
    const h2 = harness(fetch2);
    await h2.loader.loadFirst();
    const first = h2.loader.loadMore();
    await h2.loader.loadMore();
    expect(fetch2).toHaveBeenCalledTimes(2);
    release(rows(1, 20));
    await first;
  });

  it('a page that settles after a newer first load is dropped', async () => {
    let releaseOld!: (r: RemovedMessageRow[]) => void;
    const fetch = vi.fn()
      .mockReturnValueOnce(new Promise((r) => { releaseOld = r; }))
      .mockResolvedValueOnce(rows(2));
    const h = harness(fetch);
    const old = h.loader.loadFirst();
    await h.loader.loadFirst();
    releaseOld(rows(20, 100));
    await old;
    expect(h.view()).toMatchObject({ kind: 'content', rows: rows(2) });
  });

  it('nothing is written after dispose', async () => {
    let release!: (r: RemovedMessageRow[]) => void;
    const h = harness(vi.fn().mockReturnValueOnce(new Promise((r) => { release = r; })));
    const p = h.loader.loadFirst();
    h.loader.dispose();
    release(rows(2));
    await p;
    expect(h.view()).toEqual({ kind: 'loading' });
  });

  describe('loadFor (the active role + scope the list belongs to)', () => {
    it('loads once for a scope, and not again for the same scope', async () => {
      const fetch = vi.fn().mockResolvedValue(rows(2));
      const h = harness(fetch);
      await h.loader.loadFor('coordinator:session-a');
      await h.loader.loadFor('coordinator:session-a');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('a scope switch reloads exactly once and drops the old list', async () => {
      const fetch = vi.fn().mockResolvedValueOnce(rows(2)).mockResolvedValueOnce(rows(1, 50));
      const h = harness(fetch);
      await h.loader.loadFor('coordinator:session-a');
      const p = h.loader.loadFor('coordinator:session-b');
      expect(h.view()).toEqual({ kind: 'loading' });
      await p;
      await h.loader.loadFor('coordinator:session-b');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(h.view()).toMatchObject({ kind: 'content', rows: rows(1, 50) });
    });

    it('the old scope\'s slow first load cannot land on the new scope\'s list', async () => {
      let releaseOld!: (r: RemovedMessageRow[]) => void;
      const fetch = vi.fn()
        .mockReturnValueOnce(new Promise((r) => { releaseOld = r; }))
        .mockResolvedValueOnce(rows(1, 50));
      const h = harness(fetch);
      const old = h.loader.loadFor('coordinator:session-a');
      await h.loader.loadFor('coordinator:session-b');
      releaseOld(rows(20));
      await old;
      expect(h.view()).toMatchObject({ kind: 'content', rows: rows(1, 50) });
    });

    it('the old scope\'s in-flight Load more cannot land on the new scope\'s list', async () => {
      let releaseMore!: (r: RemovedMessageRow[]) => void;
      const fetch = vi.fn()
        .mockResolvedValueOnce(rows(20))
        .mockReturnValueOnce(new Promise((r) => { releaseMore = r; }))
        .mockResolvedValueOnce(rows(1, 50));
      const h = harness(fetch);
      await h.loader.loadFor('coordinator:session-a');
      const more = h.loader.loadMore();
      await h.loader.loadFor('coordinator:session-b');
      releaseMore(rows(3, 20));
      await more;
      expect(h.view()).toMatchObject({ kind: 'content', rows: rows(1, 50) });
    });

    it('after dispose the same scope loads again (a remount, e.g. StrictMode)', async () => {
      const fetch = vi.fn().mockResolvedValue(rows(2));
      const h = harness(fetch);
      await h.loader.loadFor('coordinator:session-a');
      h.loader.dispose();
      await h.loader.loadFor('coordinator:session-a');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('a retry still reloads the current scope', async () => {
      const fetch = vi.fn().mockRejectedValueOnce(coded('57014')).mockResolvedValueOnce(rows(2));
      const h = harness(fetch);
      await h.loader.loadFor('coordinator:session-a');
      await h.loader.loadFirst();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(h.view()).toMatchObject({ kind: 'content', rows: rows(2) });
    });
  });
});

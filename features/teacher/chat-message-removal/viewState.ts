import { REVIEW_PAGE_SIZE, type RemovedMessageRow } from './api';

export type ReviewView =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | {
      kind: 'content';
      rows: RemovedMessageRow[];
      hasMore: boolean;
      loadingMore: boolean;
      loadError: boolean;
    };

export type ReviewEvent =
  | { type: 'loaded'; rows: RemovedMessageRow[] }
  | { type: 'loadMoreStarted' }
  | { type: 'loadedMore'; rows: RemovedMessageRow[] }
  | { type: 'failed' };

export const initialReview: ReviewView = { kind: 'loading' };

// A full page means there may be another; a short one is the end.
const fullPage = (rows: RemovedMessageRow[]) => rows.length === REVIEW_PAGE_SIZE;

export function reduceReview(state: ReviewView, event: ReviewEvent): ReviewView {
  switch (event.type) {
    case 'loaded':
      if (event.rows.length === 0) return { kind: 'empty' };
      return { kind: 'content', rows: event.rows, hasMore: fullPage(event.rows), loadingMore: false, loadError: false };
    case 'loadMoreStarted':
      return state.kind === 'content' ? { ...state, loadingMore: true, loadError: false } : state;
    case 'loadedMore':
      if (state.kind !== 'content') return state;
      return {
        kind: 'content',
        rows: [...state.rows, ...event.rows],
        hasMore: fullPage(event.rows),
        loadingMore: false,
        loadError: false,
      };
    case 'failed':
      // Keep whatever is already loaded; the screen offers an inline retry.
      if (state.kind === 'content') return { ...state, loadingMore: false, loadError: true };
      return { kind: 'content', rows: [], hasMore: false, loadingMore: false, loadError: true };
  }
}

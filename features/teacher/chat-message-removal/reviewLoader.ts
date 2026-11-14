import { errorCodeOf } from '../../../lib/chat/conversationSession';
import type { RemovedMessageRow, RemovedMessagesCursor } from './api';
import { nextCursor } from './reviewScreen';
import type { ReviewEvent, ReviewView } from './viewState';

/** A failed load. `code` is a Postgres / PostgREST code or an error name, never message text. */
export interface ReviewErrorReport {
  source: 'load' | 'loadMore';
  code: string;
}

export interface ReviewLoaderDeps {
  fetch(cursor?: RemovedMessagesCursor): Promise<RemovedMessageRow[]>;
  getView(): ReviewView;
  dispatch(event: ReviewEvent): void;
  /** Back to the loading state, so a retried first load shows the skeleton again. */
  reset(): void;
  onError?(report: ReviewErrorReport): void;
}

// Every load writes one audit_log 'read' row per message returned, so this loads only when asked:
// once on open, on retry, and on Load more. No refetch on focus.
export function createReviewLoader(deps: ReviewLoaderDeps) {
  // Bumped by every first load and by dispose; a response from an older generation is dropped,
  // so a slow page can never land on top of a newer list.
  let generation = 0;

  async function loadFirst(): Promise<void> {
    const mine = ++generation;
    deps.reset();
    try {
      const rows = await deps.fetch(undefined);
      if (mine === generation) deps.dispatch({ type: 'loaded', rows });
    } catch (error) {
      if (mine !== generation) return;
      deps.onError?.({ source: 'load', code: errorCodeOf(error) });
      deps.dispatch({ type: 'failed' });
    }
  }

  async function loadMore(): Promise<void> {
    const view = deps.getView();
    if (view.kind !== 'content' || view.loadingMore || view.rows.length === 0) return;
    // After a load-more failure hasMore still holds, so Retry comes through here too.
    if (!view.hasMore) return;
    const mine = generation;
    deps.dispatch({ type: 'loadMoreStarted' });
    try {
      const rows = await deps.fetch(nextCursor(view.rows));
      if (mine === generation) deps.dispatch({ type: 'loadedMore', rows });
    } catch (error) {
      if (mine !== generation) return;
      deps.onError?.({ source: 'loadMore', code: errorCodeOf(error) });
      deps.dispatch({ type: 'failed' });
    }
  }

  function dispose(): void {
    generation++;
  }

  return { loadFirst, loadMore, dispose };
}

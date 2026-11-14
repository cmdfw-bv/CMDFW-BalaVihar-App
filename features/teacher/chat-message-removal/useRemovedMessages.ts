import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { fetchRemovedMessages } from './api';
import { createReviewLoader } from './reviewLoader';
import { initialReview, reduceReview, type ReviewView } from './viewState';

// Thin by design: the load rules live in reviewLoader.ts, where they are tested.
// Failures surface as the view's loadError. ReviewLoaderDeps.onError carries the code only and is
// where they go to error reporting once the client has it (same seam as lib/chat's
// useConversationMessages).
export function useRemovedMessages() {
  const [view, setView] = useState<ReviewView>(initialReview);
  // One loader per mount. It keeps its own copy of the view so Load more can page from the
  // latest row between renders; React state mirrors it for rendering.
  const [loader] = useState(() => {
    let current: ReviewView = initialReview;
    return createReviewLoader({
      fetch: (cursor) => fetchRemovedMessages(supabase, cursor),
      getView: () => current,
      dispatch: (event) => {
        current = reduceReview(current, event);
        setView(current);
      },
      reset: () => {
        current = initialReview;
        setView(initialReview);
      },
    });
  });

  useEffect(() => {
    loader.loadFirst();
    return () => loader.dispose();
  }, [loader]);

  return { view, retryFirst: loader.loadFirst, loadMore: loader.loadMore };
}

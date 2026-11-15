import { useEffect, useState } from 'react';
import { useSession } from '../../../lib/auth/SessionProvider';
import { supabase } from '../../../lib/supabase';
import { fetchRemovedMessages } from './api';
import { createReviewLoader } from './reviewLoader';
import { initialReview, reduceReview, type ReviewView } from './viewState';

// Thin by design: the load rules live in reviewLoader.ts, where they are tested.
// Failures surface as the view's loadError. ReviewLoaderDeps.onError carries the code only and is
// where they go to error reporting once the client has it (same seam as lib/chat's
// useConversationMessages).
export function useRemovedMessages() {
  // The list belongs to the active role + scope. A session switch while mounted reloads it once
  // (reviewLoader.loadFor), so the old session's rows never sit under the new badge.
  const { activeRole, scopeId } = useSession();
  const scopeKey = `${activeRole ?? ''}:${scopeId ?? ''}`;
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
    void loader.loadFor(scopeKey);
  }, [loader, scopeKey]);

  useEffect(() => () => loader.dispose(), [loader]);

  return { view, retryFirst: loader.loadFirst, loadMore: loader.loadMore };
}

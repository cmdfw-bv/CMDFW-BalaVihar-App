export type FetchStatus = 'loading' | 'error' | 'ready';
export type RosterViewState = 'loading' | 'empty' | 'error' | 'content';

// Governs ONLY the initial four-read fetch (Behavior, Design spec). A post-submit partial
// failure (decision #3) does NOT route through this function — it stays 'content' with the
// affected rows' local { saved: false, error: true } flags carrying the error-preserving UX,
// so a submit failure never regresses the whole screen back through this 'error' branch.
export function deriveRosterViewState({ fetchStatus, rosterRowCount }: { fetchStatus: FetchStatus; rosterRowCount: number }): RosterViewState {
  if (fetchStatus === 'loading') return 'loading';
  if (fetchStatus === 'error') return 'error';
  return rosterRowCount === 0 ? 'empty' : 'content';
}

import type { ComplianceRow } from './rollup';

/**
 * What the last completed fetch produced, tagged with the session it was produced FOR.
 *
 * The tag is the point. Keying the coalescer on `doFetch` already re-triggers the fetch when a
 * Coordinator with two session-scoped roles switches scope, but the row state was untagged: it
 * kept Session A's rows and `hasEverSucceeded` stayed true, so `viewState` stayed `content` and
 * A's class cards rendered under B's context chip until the new response landed (PR #50 review,
 * @ssrinivas90).
 *
 * Tagging rather than clearing on a `sessionId` effect, because clearing leaves two holes this
 * shape does not have: the stale rows still paint for the render between the switch and the
 * effect, and a late response from the session just left would write itself in as current.
 */
export interface SessionFetchState {
  sessionId: string;
  rows: ComplianceRow[] | null;
  lastFetchFailed: boolean;
}

export interface SelectedSessionState {
  rows: ComplianceRow[] | null;
  lastFetchFailed: boolean;
}

const NOT_YET_FETCHED: SelectedSessionState = { rows: null, lastFetchFailed: false };

/** Read the fetch state only if it belongs to `sessionId`; anything else reads as not-yet-fetched. */
export function selectSessionState(state: SessionFetchState | null, sessionId: string | null): SelectedSessionState {
  if (state === null || sessionId === null || state.sessionId !== sessionId) return NOT_YET_FETCHED;
  return { rows: state.rows, lastFetchFailed: state.lastFetchFailed };
}

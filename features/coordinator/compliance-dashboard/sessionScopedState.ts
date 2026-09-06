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
 * Tagging rather than clearing on a `sessionId` effect, because clearing leaves the stale rows
 * painted for the render between the switch and the effect firing.
 *
 * The tag alone was not enough, though, and the original version of this comment over-claimed:
 * it said tagging also stops "a late response from the session just left writing itself in as
 * current". It stopped such a write being *displayed*, not from happening — and overwriting the
 * current session's state with an unrenderable one dropped `viewState` back to `loading` with
 * nothing left to re-trigger, stranding the screen on skeletons (PR #50 review round 5). The
 * caller therefore keys these records by session id, so a stale write lands in its own key.
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

export type FetchOutcome = { ok: true; rows: ComplianceRow[] } | { ok: false };

/**
 * Fold one settled fetch into the per-session map.
 *
 * Extracted from the hook so the stale-write behaviour is testable: the hook itself needs a React
 * renderer, which this repo's vitest setup deliberately does not have, and the round-5 finding it
 * fixes is precisely the kind that a "looks right" reading misses.
 *
 * A failure preserves last-good rows for its OWN session (AC7's refresh banner over content) and
 * cannot reach into any other session's entry.
 */
export function applyFetchResult(
  prev: Record<string, SessionFetchState>,
  sessionId: string,
  outcome: FetchOutcome,
): Record<string, SessionFetchState> {
  const next: SessionFetchState = outcome.ok
    ? { sessionId, rows: outcome.rows, lastFetchFailed: false }
    : { sessionId, rows: prev[sessionId]?.rows ?? null, lastFetchFailed: true };
  return { ...prev, [sessionId]: next };
}

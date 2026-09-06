/**
 * Which of the composer's two heads to render, given the meeting-date fetch's state.
 *
 * `error` exists as a state distinct from `none` because they are opposite claims about the
 * world. `none` is the server answering "this class has no scheduled meeting on or before
 * today"; `error` is us failing to ask. Collapsing the second into the first told a Teacher
 * their class had never met whenever the network hiccuped — and since ADR-0036 §3 made
 * `meeting_date` NOT NULL and gated on a real `scheduled` `class_meetings` row, this picker is
 * the only path to posting at all, so that false statement also silently disabled a shipped,
 * merged feature (#21) with no way back except a reload (PR #50 review round 6, @ssrinivas90).
 *
 * `loading` is here for the second half of the same finding: it used to fall through into the
 * picker branch with an empty list, rendering a bare rail and a disabled Post button that
 * explained nothing.
 */
export type MeetingsState = 'loading' | 'ready' | 'none' | 'error';

export type MeetingsPanel =
  | { kind: 'picker' }
  | { kind: 'notice'; message: string; canRetry: boolean };

const NOTICES: Record<Exclude<MeetingsState, 'ready'>, { message: string; canRetry: boolean }> = {
  loading: {
    message: "Loading this class's recent meetings…",
    canRetry: false,
  },
  none: {
    // Honest state rather than a form that cannot succeed: with no scheduled meeting on or
    // before today there is nothing valid to post against. Copy is byte-identical to what
    // shipped — only the states around it changed.
    message: "No class meetings have happened yet for this class, so there's nothing to post an update about.",
    canRetry: false,
  },
  error: {
    message: "Couldn't load this class's recent meetings. Check your connection and try again.",
    canRetry: true,
  },
};

export function meetingsPanel(state: MeetingsState): MeetingsPanel {
  if (state === 'ready') return { kind: 'picker' };
  const { message, canRetry } = NOTICES[state];
  return { kind: 'notice', message, canRetry };
}

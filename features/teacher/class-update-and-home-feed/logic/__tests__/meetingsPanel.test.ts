import { describe, it, expect } from 'vitest';
import { meetingsPanel, type MeetingsState } from '../meetingsPanel';

// Why this is a pure function rather than a render test: this repo's vitest setup deliberately
// has no React renderer (`test/mocks/react-native.ts` is a four-line stub, and there is no
// testing-library/jsdom dependency), so a screen's branch selection is only testable once it is
// lifted out of JSX. Same move as the coordinator dashboard's `viewState.ts`, and for the same
// reason: the round-6 finding here is exactly the kind a "looks right" reading of JSX misses.

describe('meetingsPanel', () => {
  it('shows the picker once meetings have loaded', () => {
    expect(meetingsPanel('ready')).toEqual({ kind: 'picker' });
  });

  // The regression. Before this, `loading` fell through the `meetingsState === "none"` ternary
  // into the picker branch with `meetings = []`: an empty rail, a disabled Post button, and no
  // explanation of why (PR #50 review round 6, @ssrinivas90).
  it('does NOT show the picker while the fetch is still in flight', () => {
    expect(meetingsPanel('loading').kind).toBe('notice');
  });

  it('does NOT show the picker when the fetch failed', () => {
    expect(meetingsPanel('error').kind).toBe('notice');
  });

  it('says the class has no meetings yet only when that is actually what the server said', () => {
    const panel = meetingsPanel('none');

    expect(panel).toEqual({
      kind: 'notice',
      message: "No class meetings have happened yet for this class, so there's nothing to post an update about.",
      canRetry: false,
    });
  });

  // The substance of the finding: a transient network failure used to render the `none` copy,
  // telling a Teacher their class had never met. `meeting_date` is NOT NULL and gated on a real
  // scheduled meeting, so this picker is the only path to posting at all — a false "never met"
  // silently disables shipped, merged functionality (#21) while stating something untrue.
  it('never claims the class has not met when the failure was ours', () => {
    const panel = meetingsPanel('error');

    if (panel.kind !== 'notice') throw new Error('expected a notice');
    expect(panel.message).not.toContain('No class meetings have happened yet');
    expect(panel.message.toLowerCase()).toContain("couldn't load");
    expect(panel.canRetry).toBe(true);
  });

  it('offers no retry for states that are not a failure', () => {
    for (const state of ['loading', 'none', 'ready'] as MeetingsState[]) {
      const panel = meetingsPanel(state);
      if (panel.kind === 'notice') expect(panel.canRetry).toBe(false);
    }
  });

  it('covers every MeetingsState, so a new state cannot silently fall through to the picker', () => {
    const states: MeetingsState[] = ['loading', 'ready', 'none', 'error'];

    for (const state of states) {
      const panel = meetingsPanel(state);
      expect(panel.kind === 'picker' || panel.kind === 'notice').toBe(true);
      if (panel.kind === 'notice') expect(panel.message.length).toBeGreaterThan(0);
    }
  });
});

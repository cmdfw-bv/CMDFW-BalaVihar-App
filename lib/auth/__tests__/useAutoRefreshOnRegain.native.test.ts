import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The native half of AC#2. It lives in its own file because the branch keys off `Platform.OS`,
// and `test/mocks/react-native.ts` — the repo-wide alias — pins that to 'web' and exports no
// `AppState` at all. Overriding it here with a local `vi.mock` rather than widening the shared
// stub keeps every other suite on the existing fixture (PR #54 review round 3, @ssrinivas90).

const refreshSession = vi.fn();
vi.mock('../../supabase', () => ({
  supabase: { auth: { refreshSession: (...args: unknown[]) => refreshSession(...args) } },
}));

type AppStateHandler = (next: string) => void;

const remove = vi.fn();
const addEventListener = vi.fn((_event: string, _handler: AppStateHandler) => ({ remove }));
// Wrapped in a closure rather than passed directly: `vi.mock` is hoisted above these consts,
// and the factory runs on the hoisted `import` below — referencing them directly would hit the
// temporal dead zone. Same pattern as the supabase mock in the web test file.
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: (event: string, listener: AppStateHandler) => addEventListener(event, listener),
  },
}));

import { setupAutoRefreshOnRegain } from '../useAutoRefreshOnRegain';

const handler = (): AppStateHandler => {
  const call = addEventListener.mock.calls.at(-1);
  if (!call) throw new Error('AppState.addEventListener was never called');
  return call[1];
};

beforeEach(() => {
  vi.useFakeTimers();
  refreshSession.mockReset();
  refreshSession.mockResolvedValue({ data: {}, error: null });
  addEventListener.mockClear();
  remove.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('setupAutoRefreshOnRegain on native', () => {
  it('subscribes to AppState rather than DOM events', () => {
    setupAutoRefreshOnRegain(60_000);

    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener.mock.calls[0]?.[0]).toBe('change');
  });

  it('refreshes when the app returns to the foreground', () => {
    setupAutoRefreshOnRegain(60_000);

    handler()('active');

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('ignores every AppState transition that is not "active"', () => {
    setupAutoRefreshOnRegain(60_000);

    handler()('background');
    handler()('inactive');

    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('still refreshes on the interval', () => {
    setupAutoRefreshOnRegain(60_000);

    vi.advanceTimersByTime(60_000);

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  // Note the handler is deliberately NOT invoked after cleanup: the captured closure stays
  // callable in this mock, whereas the real AppState drops it inside `remove()`. Asserting that
  // `remove` ran is the honest check; driving the dead closure by hand would only test the mock.
  it('removes the subscription and clears the interval on cleanup', () => {
    const cleanup = setupAutoRefreshOnRegain(60_000);

    cleanup();
    vi.advanceTimersByTime(180_000);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const refreshSession = vi.fn();
vi.mock('../../supabase', () => ({
  supabase: { auth: { refreshSession: (...args: unknown[]) => refreshSession(...args) } },
}));

// Web-only (Platform.OS is stubbed 'web' in test/mocks/react-native.ts); the native
// AppState branch is unexercised here for the same reason useRoleGuard's router.replace
// side effect is — it needs a live host runtime, verified by hand at /build.
import { setupAutoRefreshOnRegain } from '../useAutoRefreshOnRegain';

let originalDocument: typeof globalThis.document;
let originalWindow: typeof globalThis.window;

// Fake timers don't touch the real microtask queue, so a couple of ticks is enough to
// let a .catch()/.finally() chain on refreshSession() settle before asserting on it.
const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers();
  refreshSession.mockReset();
  refreshSession.mockResolvedValue({ data: {}, error: null });

  originalDocument = globalThis.document;
  originalWindow = globalThis.window;

  const fakeDocument = Object.assign(new EventTarget(), { visibilityState: 'visible' as 'visible' | 'hidden' });
  const fakeWindow = new EventTarget();
  // @ts-expect-error test-only globals, not a full DOM
  globalThis.document = fakeDocument;
  // @ts-expect-error test-only globals, not a full DOM
  globalThis.window = fakeWindow;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
});

describe('setupAutoRefreshOnRegain', () => {
  it('calls refreshSession once per interval tick', async () => {
    setupAutoRefreshOnRegain(60_000);

    vi.advanceTimersByTime(60_000);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    await flushMicrotasks(); // let the in-flight guard reset before the next tick

    vi.advanceTimersByTime(60_000);
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it('calls refreshSession when the tab regains visibility', () => {
    setupAutoRefreshOnRegain(60_000);

    (globalThis.document as unknown as { visibilityState: string }).visibilityState = 'visible';
    globalThis.document.dispatchEvent(new Event('visibilitychange'));

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('ignores visibilitychange while the tab is hidden', () => {
    setupAutoRefreshOnRegain(60_000);

    (globalThis.document as unknown as { visibilityState: string }).visibilityState = 'hidden';
    globalThis.document.dispatchEvent(new Event('visibilitychange'));

    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('calls refreshSession on window focus', () => {
    setupAutoRefreshOnRegain(60_000);

    globalThis.window.dispatchEvent(new Event('focus'));

    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('does not double-refresh when visibilitychange and focus fire together (regression: reviewer-flagged double refresh on regain)', async () => {
    let resolveRefresh: (v: unknown) => void = () => {};
    refreshSession.mockImplementation(
      () => new Promise((resolve) => { resolveRefresh = resolve; }),
    );

    setupAutoRefreshOnRegain(60_000);

    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    globalThis.window.dispatchEvent(new Event('focus'));

    expect(refreshSession).toHaveBeenCalledTimes(1);

    resolveRefresh({ data: {}, error: null });
    await flushMicrotasks();

    globalThis.window.dispatchEvent(new Event('focus'));
    expect(refreshSession).toHaveBeenCalledTimes(2);
  });

  it('swallows a rejected refreshSession without an unhandled rejection', async () => {
    refreshSession.mockRejectedValue(new Error('network down'));

    setupAutoRefreshOnRegain(60_000);
    globalThis.window.dispatchEvent(new Event('focus'));

    await flushMicrotasks();
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('clears the interval and removes listeners on cleanup', () => {
    const cleanup = setupAutoRefreshOnRegain(60_000);
    cleanup();

    vi.advanceTimersByTime(120_000);
    globalThis.document.dispatchEvent(new Event('visibilitychange'));
    globalThis.window.dispatchEvent(new Event('focus'));

    expect(refreshSession).not.toHaveBeenCalled();
  });
});

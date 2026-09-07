import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const refreshSession = vi.fn();
vi.mock('../../supabase', () => ({
  supabase: { auth: { refreshSession: (...args: unknown[]) => refreshSession(...args) } },
}));

// Web-only: Platform.OS is stubbed 'web' in test/mocks/react-native.ts, the repo-wide alias.
// The native AppState branch is covered in useAutoRefreshOnRegain.native.test.ts, which
// overrides that alias with a local vi.mock rather than widening the shared stub.
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

  // The next two pin the SSR guard. Both of its mutations survived the suite before these
  // existed: deleting the `if` block entirely, and weakening its teardown to `() => {}`. The
  // second is the one that matters — the interval is created *before* the platform branch, so a
  // teardown that dropped clearInterval would leak one timer per call, which is precisely the
  // claim made in the round-2 thread reply with nothing holding it (PR #54 review round 3).
  it('is inert with a working teardown when there is no document (SSR / static export)', () => {
    // @ts-expect-error test-only global, deliberately removed to simulate a DOM-less pass
    delete globalThis.document;

    const cleanup = setupAutoRefreshOnRegain(60_000);
    cleanup();
    vi.advanceTimersByTime(180_000);

    expect(refreshSession).not.toHaveBeenCalled();
  });

  it('is inert with a working teardown when there is no window (SSR / static export)', () => {
    // @ts-expect-error test-only global, deliberately removed to simulate a DOM-less pass
    delete globalThis.window;

    const cleanup = setupAutoRefreshOnRegain(60_000);
    cleanup();
    vi.advanceTimersByTime(180_000);

    expect(refreshSession).not.toHaveBeenCalled();
  });

  // Pins the defensive try/catch. Replacing its body with a no-op left the whole suite green:
  // a wedged `inFlight` kills auto-recovery silently for the life of the screen, leaving only
  // the sign-out path — which, until this PR, could also fail silently. That is the failure a
  // future "this catch is unreachable, drop it" cleanup would reintroduce.
  it('does not wedge the in-flight guard when refreshSession throws synchronously', () => {
    refreshSession.mockImplementationOnce(() => {
      throw new Error('sync throw');
    });

    setupAutoRefreshOnRegain(60_000);
    globalThis.window.dispatchEvent(new Event('focus')); // throws, caught
    globalThis.window.dispatchEvent(new Event('focus')); // must still fire

    expect(refreshSession).toHaveBeenCalledTimes(2);
  });
});

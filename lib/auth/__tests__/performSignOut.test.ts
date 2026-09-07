import { describe, it, expect, vi } from 'vitest';
import { performSignOut } from '../performSignOut';

describe('performSignOut', () => {
  it('reports success when the session was actually cleared', async () => {
    await expect(performSignOut(async () => ({ error: null }))).resolves.toBe(true);
  });

  // The finding this exists for (PR #54 review, @ssrinivas90). auth-js `_signOut` returns the
  // error WITHOUT calling `_removeSession()` for anything that isn't 401/403/404/session-missing
  // — a GoTrue 5xx or an offline `AuthRetryableFetchError`. The local session survives, no
  // SIGNED_OUT event fires, and `/no-role` stays mounted. The screen has to treat this as a
  // failure, or the only escape hatch on the screen silently does nothing.
  it('reports failure when signOut RESOLVES with an error (session not cleared)', async () => {
    const res = await performSignOut(async () => ({ error: { message: 'Internal Server Error', status: 500 } }));
    expect(res).toBe(false);
  });

  // Why the reviewer's suggested `signOut().catch(...)` would not have worked: this promise
  // resolves, it does not reject. A `.catch()` never runs for the failure class above, so the
  // error has to be inspected rather than caught. This test pins that distinction.
  it('the error path is a RESOLVED value, not a rejection', async () => {
    const fn = vi.fn(async () => ({ error: { message: 'boom' } }));
    await expect(fn()).resolves.toBeTruthy(); // does not throw
    await expect(performSignOut(fn)).resolves.toBe(false);
  });

  it('reports failure when signOut rejects outright', async () => {
    await expect(performSignOut(async () => { throw new Error('offline'); })).resolves.toBe(false);
  });

  it('reports failure when signOut throws synchronously', async () => {
    await expect(performSignOut((() => { throw new Error('sync'); }) as never)).resolves.toBe(false);
  });

  it('calls the underlying signOut exactly once', async () => {
    const fn = vi.fn(async () => ({ error: null }));
    await performSignOut(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

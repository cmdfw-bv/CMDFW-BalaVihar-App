import { describe, it, expect, vi } from 'vitest';
import { runSignOut } from '../runSignOut';

// These tests exist to make one specific regression go red: reverting `app/no-role.tsx`'s
// handler to `void supabase.auth.signOut(); setBusy(false);` — the exact pre-fix shape, and the
// bug this PR spent three review rounds closing. `performSignOut` alone could not catch that;
// it is a free function nothing forced the screen to call (PR #54 review round 3, @ssrinivas90).
// `vitest.config.ts`'s `include` does not cover `app/**` and the repo has no renderer, so this
// is as close to the screen as the harness reaches.

const spies = () => ({ busy: vi.fn(), failed: vi.fn() });

describe('runSignOut', () => {
  it('leaves the failure state untouched when the session is actually cleared', async () => {
    const set = spies();

    await runSignOut(async () => ({ error: null }), set);

    expect(set.failed).not.toHaveBeenCalledWith(true);
    expect(set.busy).toHaveBeenLastCalledWith(false);
  });

  it('raises the failure state when signOut RESOLVES with an error', async () => {
    const set = spies();

    await runSignOut(async () => ({ error: { message: 'nope' } }), set);

    expect(set.failed).toHaveBeenCalledWith(true);
  });

  it('drops the busy state again after a failure, so the button can be retried', async () => {
    const set = spies();

    await runSignOut(async () => ({ error: { message: 'nope' } }), set);

    expect(set.busy).toHaveBeenLastCalledWith(false);
  });

  it('marks busy before awaiting, not after', async () => {
    const set = spies();
    let busyAtCallTime: unknown;

    await runSignOut(async () => {
      busyAtCallTime = set.busy.mock.calls.at(-1)?.[0];
      return { error: null };
    }, set);

    expect(busyAtCallTime).toBe(true);
  });

  it('clears a previous failure on entry, so a retry does not show a stale error', async () => {
    const set = spies();

    await runSignOut(async () => ({ error: null }), set);

    expect(set.failed).toHaveBeenNthCalledWith(1, false);
  });

  it('reports failure when signOut rejects outright', async () => {
    const set = spies();

    await runSignOut(async () => {
      throw new Error('offline');
    }, set);

    expect(set.failed).toHaveBeenCalledWith(true);
    expect(set.busy).toHaveBeenLastCalledWith(false);
  });
});

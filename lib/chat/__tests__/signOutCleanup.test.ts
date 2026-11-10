import { describe, it, expect, vi } from 'vitest';
import { removeChannelsOnSignOut } from '../signOutCleanup';

describe('removeChannelsOnSignOut', () => {
  it('removes every Realtime channel when the user signs out', () => {
    const removeAllChannels = vi.fn(async () => []);
    removeChannelsOnSignOut('SIGNED_OUT', removeAllChannels);
    expect(removeAllChannels).toHaveBeenCalledTimes(1);
  });

  it.each(['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED', 'INITIAL_SESSION'])(
    'leaves channels alone on %s (supabase-js forwards a refreshed token to Realtime itself)',
    (event) => {
      const removeAllChannels = vi.fn();
      removeChannelsOnSignOut(event, removeAllChannels);
      expect(removeAllChannels).not.toHaveBeenCalled();
    },
  );

  it('never throws into the auth listener, whether removal throws or rejects', async () => {
    expect(() =>
      removeChannelsOnSignOut('SIGNED_OUT', () => {
        throw new Error('sync');
      }),
    ).not.toThrow();
    expect(() => removeChannelsOnSignOut('SIGNED_OUT', () => Promise.reject(new Error('async')))).not.toThrow();
    await Promise.resolve(); // an unhandled rejection here would fail the run
  });
});

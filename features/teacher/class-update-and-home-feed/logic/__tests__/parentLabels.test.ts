import { describe, it, expect } from 'vitest';
import { resolveLabelsForKeys } from '../parentLabels';

describe('resolveLabelsForKeys', () => {
  it('returns one entry per key, in key order', async () => {
    const entries = await resolveLabelsForKeys(['p1', 'p2'], async (k) => `Family ${k}`);
    expect(entries).toEqual([
      ['p1', 'Family p1'],
      ['p2', 'Family p2'],
    ]);
  });

  it('maps a key whose lookup rejects to null instead of rejecting the whole batch', async () => {
    const entries = await resolveLabelsForKeys(['ok', 'boom'], async (k) => {
      if (k === 'boom') throw new Error('rpc failed');
      return 'Family A';
    });
    expect(entries).toEqual([
      ['ok', 'Family A'],
      ['boom', null],
    ]);
  });

  it('never rejects even when every lookup fails, so one bad RPC cannot blank the thread UI', async () => {
    await expect(
      resolveLabelsForKeys(['a', 'b'], async () => {
        throw new Error('rpc failed');
      })
    ).resolves.toEqual([
      ['a', null],
      ['b', null],
    ]);
  });

  it('passes a resolver-returned null straight through (no label on record)', async () => {
    expect(await resolveLabelsForKeys(['p1'], async () => null)).toEqual([['p1', null]]);
  });

  it('returns an empty list for no keys without calling the resolver', async () => {
    let calls = 0;
    const entries = await resolveLabelsForKeys([], async () => {
      calls += 1;
      return 'x';
    });
    expect(entries).toEqual([]);
    expect(calls).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { hasDismissedPushPrompt, dismissPushPrompt, type KeyValueStorage } from '../promptState';

function fakeStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
}

describe('promptState', () => {
  it('hasDismissedPushPrompt is false before any dismissal', () => {
    expect(hasDismissedPushPrompt(fakeStorage())).toBe(false);
  });

  it('dismissPushPrompt persists the dismissal, and hasDismissedPushPrompt reflects it', () => {
    const storage = fakeStorage();
    dismissPushPrompt(storage);
    expect(hasDismissedPushPrompt(storage)).toBe(true);
  });

  it('an unrelated stored value under the same key does not count as dismissed', () => {
    const storage = fakeStorage();
    storage.setItem('bv-push-prompt-dismissed', 'not-true');
    expect(hasDismissedPushPrompt(storage)).toBe(false);
  });
});

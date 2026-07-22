import { describe, it, expect, vi } from 'vitest';
import { subscribeToPush } from '../subscribeToPush';

describe('subscribeToPush', () => {
  it('registers the service worker, subscribes with the given key, and upserts the resulting endpoint/keys', async () => {
    const applicationServerKey = new Uint8Array([1, 2, 3]);
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: 'https://push.example/xyz',
      toJSON: () => ({ keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    });
    const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    const result = await subscribeToPush({ register, applicationServerKey, upsertSubscription });

    expect(register).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey });
    expect(upsertSubscription).toHaveBeenCalledWith({
      endpoint: 'https://push.example/xyz',
      p256dhKey: 'p256dh-value',
      authKey: 'auth-value',
    });
    expect(result).toEqual({ endpoint: 'https://push.example/xyz', p256dhKey: 'p256dh-value', authKey: 'auth-value' });
  });

  it('falls back to empty strings if the browser subscription JSON is missing keys (defensive)', async () => {
    const subscribe = vi.fn().mockResolvedValue({ endpoint: 'https://push.example/xyz', toJSON: () => ({}) });
    const register = vi.fn().mockResolvedValue({ pushManager: { subscribe } });
    const upsertSubscription = vi.fn().mockResolvedValue(undefined);

    const result = await subscribeToPush({ register, applicationServerKey: new Uint8Array(), upsertSubscription });
    expect(result).toEqual({ endpoint: 'https://push.example/xyz', p256dhKey: '', authKey: '' });
  });
});

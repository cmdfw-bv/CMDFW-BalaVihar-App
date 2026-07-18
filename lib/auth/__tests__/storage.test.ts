import { describe, it, expect } from 'vitest';
import { encryptString, decryptString } from '../storage';

describe('encryptString / decryptString (AES-GCM round trip)', () => {
  it('decrypts back to the original plaintext', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const encrypted = await encryptString(key, 'a supabase session JSON blob');
    expect(await decryptString(key, encrypted)).toBe('a supabase session JSON blob');
  });

  it('produces a different ciphertext each call (random IV, not deterministic)', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const a = await encryptString(key, 'same input');
    const b = await encryptString(key, 'same input');
    expect(a.data).not.toBe(b.data);
  });

  it('fails to decrypt with the wrong key (not silently returning garbage)', async () => {
    const key1 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const key2 = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const encrypted = await encryptString(key1, 'secret');
    await expect(decryptString(key2, encrypted)).rejects.toThrow();
  });
});

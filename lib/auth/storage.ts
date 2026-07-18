import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SupportedStorage } from '@supabase/supabase-js';

const IV_LENGTH = 12; // AES-GCM standard nonce size

export interface EncryptedPayload {
  iv: string; // base64
  data: string; // base64
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}
function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  // TS's typed-array generics (Uint8Array<ArrayBufferLike>) are stricter than the runtime
  // BufferSource contract here — this is always a fresh, non-shared ArrayBuffer.
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, new TextEncoder().encode(plaintext));
  return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipherBuf)) };
}

export async function decryptString(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) as BufferSource },
    key,
    base64ToBytes(payload.data) as BufferSource
  );
  return new TextDecoder().decode(plainBuf);
}

// Non-extractable AES-GCM key, persisted as a CryptoKey handle in IndexedDB (not its raw
// bytes) so the key material itself is never readable from JS/dev-tools — same-origin script
// can still call crypto.subtle.decrypt through this module, but can't exfiltrate the key
// separately from the ciphertext the way a localStorage-stored key would allow. This is what
// makes this an "encrypted-at-rest" adapter per the architect guardrail, not a plaintext one.
let keyPromise: Promise<CryptoKey> | null = null;
function getOrCreateWebKey(): Promise<CryptoKey> {
  if (!keyPromise) keyPromise = (async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('cmdfw-bv-auth', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('keys');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
      const tx = db.transaction('keys', 'readonly').objectStore('keys').get('session-key');
      tx.onsuccess = () => resolve(tx.result as CryptoKey | undefined);
      tx.onerror = () => reject(tx.error);
    });
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite').objectStore('keys').put(key, 'session-key');
      tx.onsuccess = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return key;
  })();
  return keyPromise;
}

const webStorage: SupportedStorage = {
  async getItem(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      const payload = JSON.parse(raw) as EncryptedPayload;
      return await decryptString(await getOrCreateWebKey(), payload);
    } catch {
      return null; // corrupt/undecryptable entry — treat as absent, not a crash
    }
  },
  async setItem(key, value) {
    const payload = await encryptString(await getOrCreateWebKey(), value);
    localStorage.setItem(key, JSON.stringify(payload));
  },
  async removeItem(key) {
    localStorage.removeItem(key);
  },
};

const nativeStorage: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

// No-op — Expo Router's web build renders once server-side (no DOM/localStorage yet) before
// hydrating in the browser; the real webStorage takes over once `window` exists there.
const noopStorage: SupportedStorage = {
  async getItem() { return null; },
  async setItem() {},
  async removeItem() {},
};

export const authStorage: SupportedStorage =
  typeof window === 'undefined' ? noopStorage : Platform.OS === 'web' ? webStorage : nativeStorage;

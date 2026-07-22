const STORAGE_KEY = 'bv-push-prompt-dismissed';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

// "Shown once, near first meaningful action" (design spec) — dismissal is sticky per
// browser/device (web-only feature, so plain localStorage is sufficient; unlike
// lib/auth/storage.ts this isn't session-sensitive data, so no encryption is needed).
export function hasDismissedPushPrompt(storage: KeyValueStorage): boolean {
  return storage.getItem(STORAGE_KEY) === 'true';
}

export function dismissPushPrompt(storage: KeyValueStorage): void {
  storage.setItem(STORAGE_KEY, 'true');
}

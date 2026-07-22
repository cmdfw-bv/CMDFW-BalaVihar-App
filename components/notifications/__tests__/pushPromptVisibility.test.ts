import { describe, it, expect } from 'vitest';
import { shouldShowPushPrompt } from '../pushPromptVisibility';

describe('shouldShowPushPrompt', () => {
  it('shows on web when not dismissed', () => expect(shouldShowPushPrompt('web', false)).toBe(true));
  it('hidden on web once dismissed', () => expect(shouldShowPushPrompt('web', true)).toBe(false));
  it('hidden on ios (native Web Push has no client for this POC)', () => expect(shouldShowPushPrompt('ios', false)).toBe(false));
  it('hidden on android', () => expect(shouldShowPushPrompt('android', false)).toBe(false));
});

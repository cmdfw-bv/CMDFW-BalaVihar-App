import { describe, it, expect } from 'vitest';
import { shouldShowRetry } from '../StateView.logic';

describe('shouldShowRetry', () => {
  it('shows retry only in the error state, and only when onRetry is provided', () => {
    expect(shouldShowRetry('error', () => {})).toBe(true);
  });
  it('hides retry in error state when onRetry is not passed (some errors have nothing to retry)', () => {
    expect(shouldShowRetry('error', undefined)).toBe(false);
  });
  it('never shows retry outside the error state, even with onRetry set', () => {
    expect(shouldShowRetry('loading', () => {})).toBe(false);
    expect(shouldShowRetry('empty', () => {})).toBe(false);
    expect(shouldShowRetry('content', () => {})).toBe(false);
  });
});

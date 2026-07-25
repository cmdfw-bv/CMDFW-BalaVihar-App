import { describe, it, expect } from 'vitest';
import { parseAuthCallbackError } from '../authCallbackError';

describe('parseAuthCallbackError', () => {
  it('null when no error param is present (the happy-path callback)', () => {
    expect(parseAuthCallbackError({})).toBeNull();
  });

  it('friendly expired/reused message for otp_expired (15-min single-use link)', () => {
    expect(parseAuthCallbackError({
      error: 'access_denied',
      error_code: 'otp_expired',
      error_description: 'Email link is invalid or has expired',
    })).toBe('This sign-in link has expired or was already used. Request a new one below.');
  });

  it('falls back to a decoded error_description for an unrecognized error_code', () => {
    expect(parseAuthCallbackError({
      error: 'server_error',
      error_code: 'unexpected_failure',
      error_description: 'Something+went+wrong',
    })).toBe('Sign-in failed: Something went wrong.');
  });

  it('falls back to a generic message when error is present but error_description is missing', () => {
    expect(parseAuthCallbackError({ error: 'access_denied' })).toBe(
      'Something went wrong signing you in. Please request a new link.'
    );
  });

  it('handles expo-router search params arriving as string arrays', () => {
    expect(parseAuthCallbackError({
      error: ['access_denied'],
      error_code: ['otp_expired'],
      error_description: ['Email link is invalid or has expired'],
    })).toBe('This sign-in link has expired or was already used. Request a new one below.');
  });
});

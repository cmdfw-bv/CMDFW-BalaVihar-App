import { describe, it, expect } from 'vitest';
import { magicLinkCopy } from '../MagicLinkLogin.logic';

describe('magicLinkCopy', () => {
  it('pre-send: prompts for an email', () => {
    expect(magicLinkCopy(false, '')).toEqual({ heading: 'Sign in', body: 'Enter your email and we’ll send you a magic link.' });
  });
  it('post-send: confirms and echoes the address', () => {
    expect(magicLinkCopy(true, 'a@b.com')).toEqual({ heading: 'Check your email', body: 'We sent a sign-in link to a@b.com.' });
  });
});

import { describe, it, expect } from 'vitest';
import { needsIosInstallHint } from '../installHint';

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME_UA =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

describe('needsIosInstallHint', () => {
  it('true for iPhone Safari not yet installed to Home Screen (highest-risk POC case, doc 3 §8.1)', () => {
    expect(needsIosInstallHint(IOS_SAFARI_UA, false)).toBe(true);
  });

  it('false for iPhone once already running as an installed standalone PWA', () => {
    expect(needsIosInstallHint(IOS_SAFARI_UA, true)).toBe(false);
  });

  it('false for iPad Safari not standalone (still iOS — the flow still applies) is true, not false', () => {
    const ipadUa = IOS_SAFARI_UA.replace('iPhone', 'iPad');
    expect(needsIosInstallHint(ipadUa, false)).toBe(true);
  });

  it('false for a non-iOS UA (Android), regardless of standalone state', () => {
    expect(needsIosInstallHint(ANDROID_CHROME_UA, false)).toBe(false);
  });

  it('false for an empty user agent (defensive)', () => {
    expect(needsIosInstallHint('', false)).toBe(false);
  });
});

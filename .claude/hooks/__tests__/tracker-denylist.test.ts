import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TRACKER_PACKAGE_RE, TRACKER_PACKAGE_NAME_RE, stripComments, domainUsageRegex } = require('../_tracker-denylist.js');

describe('TRACKER_PACKAGE_NAME_RE', () => {
  it('matches known tracker package names', () => {
    expect(TRACKER_PACKAGE_NAME_RE.test('mixpanel-browser')).toBe(true);
    expect(TRACKER_PACKAGE_NAME_RE.test('@amplitude/analytics-browser')).toBe(true);
    expect(TRACKER_PACKAGE_NAME_RE.test('@segment/analytics-next')).toBe(true);
  });

  it('does not match unrelated package names', () => {
    expect(TRACKER_PACKAGE_NAME_RE.test('react-native-unistyles')).toBe(false);
    expect(TRACKER_PACKAGE_NAME_RE.test('@supabase/supabase-js')).toBe(false);
  });
});

describe('TRACKER_PACKAGE_RE (quoted, raw-text form)', () => {
  it('matches a tracker dependency quoted in package.json source', () => {
    expect(TRACKER_PACKAGE_RE.test('"dependencies": { "mixpanel-browser": "^2.0.0" }')).toBe(true);
  });
  it('does not match an unrelated quoted dependency', () => {
    expect(TRACKER_PACKAGE_RE.test('"dependencies": { "expo": "~56.0.12" }')).toBe(false);
  });
});

describe('stripComments', () => {
  it('removes line and block comments', () => {
    const src = 'const a = 1; // mixpanel.com\n/* googletagmanager.com */ const b = 2;';
    const stripped = stripComments(src);
    expect(stripped).not.toContain('mixpanel.com');
    expect(stripped).not.toContain('googletagmanager.com');
    expect(stripped).toContain('const b = 2;');
  });
});

describe('domainUsageRegex', () => {
  it('matches a tracker domain used in a URL string', () => {
    const text = 'fetch("https://www.google-analytics.com/collect")';
    expect(domainUsageRegex().test(text)).toBe(true);
  });
  it('does not match a domain merely mentioned in prose', () => {
    const text = 'We must never call google-analytics.com from this app.';
    expect(domainUsageRegex().test(text)).toBe(false);
  });
});

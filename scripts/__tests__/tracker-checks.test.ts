import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findTrackerPackageNames, findTrackerHostnames } = require('../_tracker-checks.js');

describe('findTrackerPackageNames', () => {
  it('flags known tracker dependency names', () => {
    expect(findTrackerPackageNames(['expo', 'mixpanel-browser', '@supabase/supabase-js'])).toEqual(['mixpanel-browser']);
  });
  it('returns an empty list when nothing matches', () => {
    expect(findTrackerPackageNames(['expo', 'react', 'vitest'])).toEqual([]);
  });
});

describe('findTrackerHostnames', () => {
  it('finds a tracker hostname actually used in source', () => {
    expect(findTrackerHostnames('fetch("https://static.hotjar.com/c.js")')).toBe('static.hotjar.com');
  });
  it('ignores a hostname only mentioned in a comment', () => {
    expect(findTrackerHostnames('// see static.hotjar.com docs\nconst x = 1;')).toBeNull();
  });
  it('returns null when no tracker hostname is present', () => {
    expect(findTrackerHostnames('fetch("https://api.example.com/data")')).toBeNull();
  });
});

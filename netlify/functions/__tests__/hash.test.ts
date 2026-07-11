import { describe, it, expect } from 'vitest';
import { guardianEmailHash } from '../lib/hash';

describe('guardianEmailHash', () => {
  it('returns the SHA-256 hex of the lowercased email', () => {
    // echo -n 'test@example.com' | sha256sum
    expect(guardianEmailHash('test@example.com')).toBe(
      '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b'
    );
  });

  it('lowercases before hashing so mixed-case matches lowercase', () => {
    expect(guardianEmailHash('Test@Example.COM')).toBe(
      guardianEmailHash('test@example.com')
    );
  });

  it('returns a stable 64-char hex string for empty input', () => {
    const result = guardianEmailHash('');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });
});

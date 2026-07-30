import { describe, it, expect } from 'vitest';
import { buildClassUpdatePayload, CLASS_UPDATE_BODY_MAX, CLASS_UPDATE_HOMEWORK_MAX } from '../classUpdatePayload';

describe('buildClassUpdatePayload', () => {
  it('returns null when body is blank (whitespace-only)', () => {
    expect(buildClassUpdatePayload('   ', 'do the reading')).toBeNull();
  });
  it('omits homework entirely when blank — not an empty string (edge case #1)', () => {
    expect(buildClassUpdatePayload('Great class today', '   ')).toEqual({ body: 'Great class today' });
  });
  it('trims both fields and includes homework when present', () => {
    expect(buildClassUpdatePayload('  Great class  ', '  read ch. 3  ')).toEqual({ body: 'Great class', homework: 'read ch. 3' });
  });

  // Length caps mirror the DB check constraints exactly, so the composer rejects before the
  // round trip instead of surfacing a raw 23514 from PostgREST.
  it('accepts a body exactly at the cap', () => {
    const atCap = 'x'.repeat(CLASS_UPDATE_BODY_MAX);
    expect(buildClassUpdatePayload(atCap, '')).toEqual({ body: atCap });
  });
  it('returns null when the body exceeds the cap', () => {
    expect(buildClassUpdatePayload('x'.repeat(CLASS_UPDATE_BODY_MAX + 1), '')).toBeNull();
  });
  it('measures the cap after trimming, so trailing whitespace alone cannot trip it', () => {
    const atCap = 'x'.repeat(CLASS_UPDATE_BODY_MAX);
    expect(buildClassUpdatePayload(`  ${atCap}  `, '')).toEqual({ body: atCap });
  });
  it('returns null when homework exceeds its cap, even with a valid body', () => {
    expect(buildClassUpdatePayload('fine', 'y'.repeat(CLASS_UPDATE_HOMEWORK_MAX + 1))).toBeNull();
  });
  it('accepts homework exactly at its cap', () => {
    const atCap = 'y'.repeat(CLASS_UPDATE_HOMEWORK_MAX);
    expect(buildClassUpdatePayload('fine', atCap)).toEqual({ body: 'fine', homework: atCap });
  });
});

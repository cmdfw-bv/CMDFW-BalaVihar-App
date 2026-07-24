import { describe, it, expect } from 'vitest';
import { buildClassUpdatePayload } from '../classUpdatePayload';

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
});

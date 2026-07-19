import { describe, it, expect } from 'vitest';
import { commentThreadCount } from '../CommentThread.logic';

describe('commentThreadCount', () => {
  it('uses the explicit count override when given', () => {
    expect(commentThreadCount(7, [1, 2])).toBe(7);
  });
  it('falls back to comments.length when count is undefined', () => {
    expect(commentThreadCount(undefined, [1, 2, 3])).toBe(3);
  });
  it('falls back to 0 when both are undefined', () => {
    expect(commentThreadCount(undefined, undefined)).toBe(0);
  });
});

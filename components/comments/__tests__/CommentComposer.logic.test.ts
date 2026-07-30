import { describe, it, expect } from 'vitest';
import { buildCommentPayload, COMMENT_BODY_MAX } from '../CommentComposer.logic';

describe('buildCommentPayload', () => {
  it('builds a payload for non-empty trimmed body', () => {
    expect(buildCommentPayload('  hello  ', true)).toEqual({ body: 'hello', isPrivate: true });
  });
  it('returns null for an empty or whitespace-only body (nothing to send)', () => {
    expect(buildCommentPayload('   ', false)).toBeNull();
    expect(buildCommentPayload('', false)).toBeNull();
  });

  // Mirrors the comments.body check constraint so an over-long comment is refused locally
  // rather than coming back as a raw 23514 from PostgREST.
  it('accepts a body exactly at the cap', () => {
    const atCap = 'x'.repeat(COMMENT_BODY_MAX);
    expect(buildCommentPayload(atCap, false)).toEqual({ body: atCap, isPrivate: false });
  });
  it('returns null when the body exceeds the cap', () => {
    expect(buildCommentPayload('x'.repeat(COMMENT_BODY_MAX + 1), false)).toBeNull();
  });
  it('measures the cap after trimming', () => {
    const atCap = 'x'.repeat(COMMENT_BODY_MAX);
    expect(buildCommentPayload(`  ${atCap}  `, true)).toEqual({ body: atCap, isPrivate: true });
  });
});

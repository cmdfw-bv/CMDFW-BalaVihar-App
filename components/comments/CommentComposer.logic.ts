// Kept in lockstep with the comments_body_len check constraint
// (20260728150000_class_update_comment_length_caps.sql). The DB is the real bound — this exists so
// an over-long comment is refused before the round trip instead of returning a raw 23514 from
// PostgREST, and so the composer can cap the input at the same number.
export const COMMENT_BODY_MAX = 2000;

export function buildCommentPayload(body: string, isPrivate: boolean): { body: string; isPrivate: boolean } | null {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > COMMENT_BODY_MAX) return null;
  return { body: trimmed, isPrivate };
}

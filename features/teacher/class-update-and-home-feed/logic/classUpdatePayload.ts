export interface ClassUpdatePayload {
  body: string;
  homework?: string;
}

// Kept in lockstep with the class_updates_body_len / class_updates_homework_len check constraints
// (20260728150000_class_update_comment_length_caps.sql). The DB is the real bound — these exist so
// an over-long post is refused before the round trip instead of returning a raw 23514 from
// PostgREST, and so the composer can cap the input at the same number.
export const CLASS_UPDATE_BODY_MAX = 5000;
export const CLASS_UPDATE_HOMEWORK_MAX = 2000;

// Mirrors CommentComposer.logic.ts's buildCommentPayload trim/reject-empty convention.
// homework is omitted entirely (not an empty string) when blank — edge case #1's "no
// placeholder homework line" requirement starts here, at the payload the composer builds.
export function buildClassUpdatePayload(body: string, homework: string): ClassUpdatePayload | null {
  const trimmedBody = body.trim();
  if (!trimmedBody || trimmedBody.length > CLASS_UPDATE_BODY_MAX) return null;
  const trimmedHomework = homework.trim();
  if (trimmedHomework.length > CLASS_UPDATE_HOMEWORK_MAX) return null;
  return trimmedHomework ? { body: trimmedBody, homework: trimmedHomework } : { body: trimmedBody };
}

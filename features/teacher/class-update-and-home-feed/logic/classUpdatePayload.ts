export interface ClassUpdatePayload {
  body: string;
  homework?: string;
}

// Mirrors CommentComposer.logic.ts's buildCommentPayload trim/reject-empty convention.
// homework is omitted entirely (not an empty string) when blank — edge case #1's "no
// placeholder homework line" requirement starts here, at the payload the composer builds.
export function buildClassUpdatePayload(body: string, homework: string): ClassUpdatePayload | null {
  const trimmedBody = body.trim();
  if (!trimmedBody) return null;
  const trimmedHomework = homework.trim();
  return trimmedHomework ? { body: trimmedBody, homework: trimmedHomework } : { body: trimmedBody };
}

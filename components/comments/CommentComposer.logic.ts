export function buildCommentPayload(body: string, isPrivate: boolean): { body: string; isPrivate: boolean } | null {
  const trimmed = body.trim();
  return trimmed ? { body: trimmed, isPrivate } : null;
}

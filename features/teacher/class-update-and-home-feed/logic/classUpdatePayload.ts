export interface ClassUpdatePayload {
  body: string;
  homework?: string;
  /**
   * Which class meeting this update is about (ADR-0036) — NOT when it was written. Chosen in the
   * composer from `class_meetings`, so a Teacher posting the morning after still files the update
   * against the meeting it belongs to. `class_updates.meeting_date` is NOT NULL, so this is
   * required on every payload.
   */
  meetingDate: string;
}

// A meeting date only ever comes from `class_meetings.meeting_date` (a Postgres `date`), so it is
// always ISO yyyy-mm-dd here. Validating the shape keeps a malformed value from reaching PostgREST
// as a raw 22007/23502 the composer would surface as an opaque error.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Kept in lockstep with the class_updates_body_len / class_updates_homework_len check constraints
// (20260728150000_class_update_comment_length_caps.sql). The DB is the real bound — these exist so
// an over-long post is refused before the round trip instead of returning a raw 23514 from
// PostgREST, and so the composer can cap the input at the same number.
export const CLASS_UPDATE_BODY_MAX = 5000;
export const CLASS_UPDATE_HOMEWORK_MAX = 2000;

// Mirrors CommentComposer.logic.ts's buildCommentPayload trim/reject-empty convention.
// homework is omitted entirely (not an empty string) when blank — edge case #1's "no
// placeholder homework line" requirement starts here, at the payload the composer builds.
export function buildClassUpdatePayload(
  body: string,
  homework: string,
  meetingDate: string
): ClassUpdatePayload | null {
  const trimmedBody = body.trim();
  if (!trimmedBody || trimmedBody.length > CLASS_UPDATE_BODY_MAX) return null;
  const trimmedHomework = homework.trim();
  if (trimmedHomework.length > CLASS_UPDATE_HOMEWORK_MAX) return null;
  const trimmedDate = meetingDate.trim();
  if (!ISO_DATE.test(trimmedDate)) return null;
  return trimmedHomework
    ? { body: trimmedBody, homework: trimmedHomework, meetingDate: trimmedDate }
    : { body: trimmedBody, meetingDate: trimmedDate };
}

export const CLASS_UPDATE_PUSH_TITLE = 'New update posted in your class';

// Recipient ids arrive from two separate queries (students-with-login, then their
// parents/guardians via family_members) — the one shared, pure step: de-dupe across both sets
// and drop the posting Teacher (mirrors isRecipient's sender check in push-dispatch.ts).
export function mergeClassUpdateRecipients(userIds: (string | null)[], posterUserId: string): string[] {
  const unique = new Set<string>();
  for (const id of userIds) {
    if (id && id !== posterUserId) unique.add(id);
  }
  return Array.from(unique);
}

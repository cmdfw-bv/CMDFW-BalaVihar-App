export type NotifyLevel = 'all' | 'mentions' | 'muted';
export type ParticipantRole = 'student' | 'parent' | 'teacher' | 'coordinator' | 'bv_coordinator' | 'admin';
export type ConversationKind = 'class' | 'session_staff' | 'leadership';

export interface ConversationParticipant {
  user_id: string;
  participant_role: ParticipantRole;
  notify_level: NotifyLevel;
}

// notify_level dispatch rule (ADR-0016, design spec's "notify_level / mention-matching
// filter") — mention_targets values are fixed by core-schema-and-rls's messages schema:
// 'parents' | 'students' | 'individual:<user_id>'.
export function isRecipient(cp: ConversationParticipant, senderUserId: string, mentionTargets: string[]): boolean {
  if (cp.user_id === senderUserId) return false;
  if (cp.notify_level === 'all') return true;
  if (cp.notify_level === 'muted') return false;
  return (
    (mentionTargets.includes('students') && cp.participant_role === 'student') ||
    (mentionTargets.includes('parents') && cp.participant_role === 'parent') ||
    mentionTargets.includes(`individual:${cp.user_id}`)
  );
}

// PII-free payload copy, keyed off conversations.kind only — never scope_id, sender name,
// or message body (AC#9, design spec's "payload copy is keyed off conversations.kind only").
const PAYLOAD_TITLE_BY_KIND: Record<ConversationKind, string> = {
  class: 'New message in your class chat',
  session_staff: 'New message in your session staff chat',
  leadership: 'New message in the leadership chat',
};

export function payloadTitleForKind(kind: ConversationKind): string {
  return PAYLOAD_TITLE_BY_KIND[kind];
}

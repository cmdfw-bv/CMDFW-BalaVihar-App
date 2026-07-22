import { describe, it, expect } from 'vitest';
import { isRecipient, payloadTitleForKind, type ConversationParticipant } from '../lib/push-dispatch';

const SENDER = 'sender-uuid';
const OTHER = 'other-uuid';

function participant(overrides: Partial<ConversationParticipant> = {}): ConversationParticipant {
  return { user_id: OTHER, participant_role: 'student', notify_level: 'all', ...overrides };
}

describe('isRecipient', () => {
  it('never returns true for the sender, even at notify_level "all"', () => {
    expect(isRecipient(participant({ user_id: SENDER, notify_level: 'all' }), SENDER, [])).toBe(false);
  });

  it('notify_level "muted" is never a recipient, regardless of mentions', () => {
    expect(isRecipient(participant({ notify_level: 'muted' }), SENDER, ['individual:other-uuid'])).toBe(false);
  });

  it('notify_level "all" is always a recipient (non-sender)', () => {
    expect(isRecipient(participant({ notify_level: 'all' }), SENDER, [])).toBe(true);
  });

  it('notify_level "mentions": excluded when no mention target matches', () => {
    expect(isRecipient(participant({ notify_level: 'mentions', participant_role: 'student' }), SENDER, ['parents'])).toBe(false);
  });

  it('notify_level "mentions": included when mentionTargets includes their role ("students")', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', participant_role: 'student' }), SENDER, ['students'])
    ).toBe(true);
  });

  it('notify_level "mentions": included when mentionTargets includes their role ("parents")', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', participant_role: 'parent' }), SENDER, ['parents'])
    ).toBe(true);
  });

  it('notify_level "mentions": "students" target does not match a parent participant', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', participant_role: 'parent' }), SENDER, ['students'])
    ).toBe(false);
  });

  it('notify_level "mentions": included when individually targeted by user_id', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', user_id: OTHER, participant_role: 'teacher' }), SENDER, [
        `individual:${OTHER}`,
      ])
    ).toBe(true);
  });

  it('notify_level "mentions": an individual target for a different user_id does not match', () => {
    expect(
      isRecipient(participant({ notify_level: 'mentions', user_id: OTHER }), SENDER, ['individual:someone-else'])
    ).toBe(false);
  });
});

describe('payloadTitleForKind', () => {
  it('class -> "New message in your class chat"', () => expect(payloadTitleForKind('class')).toBe('New message in your class chat'));
  it('session_staff -> "New message in your session staff chat"', () =>
    expect(payloadTitleForKind('session_staff')).toBe('New message in your session staff chat'));
  it('leadership -> "New message in the leadership chat"', () =>
    expect(payloadTitleForKind('leadership')).toBe('New message in the leadership chat'));
});

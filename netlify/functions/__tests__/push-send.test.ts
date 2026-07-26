import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { HandlerEvent, HandlerResponse } from '@netlify/functions';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => mockSupabaseClient) }));
vi.mock('../lib/push-delivery', () => ({
  configureVapid: vi.fn(),
  sendPush: vi.fn(),
}));

const mockGetUser = vi.fn();
let tables: {
  messages: Record<string, unknown> | null;
  conversations: Record<string, unknown> | null;
  conversation_participants: Array<Record<string, unknown>>;
  push_subscriptions: Array<Record<string, unknown>>;
  class_updates: Record<string, unknown> | null;
  enrollments: Array<Record<string, unknown>>;
  students: Array<Record<string, unknown>>;
  family_members: Array<Record<string, unknown>>;
};
const deleteEq = vi.fn().mockResolvedValue({ data: null, error: null });

function mockFrom(table: string) {
  if (table === 'messages') {
    return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: tables.messages, error: null }) }) }) };
  }
  if (table === 'conversations') {
    return {
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: tables.conversations, error: null }) }) }),
    };
  }
  if (table === 'conversation_participants') {
    return { select: () => ({ eq: () => Promise.resolve({ data: tables.conversation_participants, error: null }) }) };
  }
  if (table === 'push_subscriptions') {
    return {
      select: () => ({ in: () => Promise.resolve({ data: tables.push_subscriptions, error: null }) }),
      delete: () => ({ eq: deleteEq }),
    };
  }
  if (table === 'class_updates') {
    return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: tables.class_updates, error: null }) }) }) };
  }
  if (table === 'enrollments') {
    return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: tables.enrollments, error: null }) }) }) };
  }
  if (table === 'students') {
    return { select: () => ({ in: () => Promise.resolve({ data: tables.students, error: null }) }) };
  }
  if (table === 'family_members') {
    return { select: () => ({ in: () => Promise.resolve({ data: tables.family_members, error: null }) }) };
  }
  throw new Error(`unexpected table: ${table}`);
}

const mockSupabaseClient = { auth: { getUser: mockGetUser }, from: vi.fn(mockFrom) };

import * as pushDelivery from '../lib/push-delivery';
import { handler } from '../push-send';

const SENDER_ID = 'sender-uuid';
const CALLER_ID = 'sender-uuid'; // caller == sender in the happy path
const MESSAGE_ID = '11111111-1111-1111-1111-111111111111';
const CONVERSATION_ID = '22222222-2222-2222-2222-222222222222';
const CLASS_UPDATE_ID = '33333333-3333-3333-3333-333333333333';
const CLASS_ID = '44444444-4444-4444-4444-444444444444';

function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer valid-token' },
    body: JSON.stringify({ message_id: MESSAGE_ID }),
    isBase64Encoded: false,
    rawUrl: '/api/push-send',
    rawQuery: '',
    path: '/api/push-send',
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    multiValueHeaders: {},
    ...overrides,
  } as HandlerEvent;
}

function body(obj: unknown): string {
  return JSON.stringify(obj);
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: CALLER_ID } }, error: null });
  deleteEq.mockClear();
  vi.mocked(pushDelivery.sendPush).mockReset();
  vi.mocked(pushDelivery.sendPush).mockResolvedValue({ status: 'sent' });
  tables = {
    messages: { id: MESSAGE_ID, conversation_id: CONVERSATION_ID, sender_user_id: SENDER_ID, mention_targets: [] },
    conversations: { kind: 'class' },
    conversation_participants: [{ user_id: 'recipient-1', participant_role: 'student', notify_level: 'all' }],
    push_subscriptions: [{ id: 'sub-1', endpoint: 'https://push.example/1', p256dh_key: 'p', auth_key: 'a' }],
    class_updates: { id: CLASS_UPDATE_ID, class_id: CLASS_ID, posted_by: SENDER_ID },
    enrollments: [{ student_id: 'student-row-1' }],
    students: [{ user_id: 'student-user-1', family_id: 'family-1' }],
    family_members: [{ user_id: 'parent-user-1' }],
  };
});

describe('push-send handler', () => {
  it('401s when the Authorization header is missing', async () => {
    const res = (await handler(makeEvent({ headers: {} }), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(401);
  });

  it('401s when getUser returns an error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'bad token' } });
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(401);
  });

  it('422s on malformed JSON body', async () => {
    const res = (await handler(makeEvent({ body: '{not json' }), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(422);
  });

  it('422s when message_id is missing or not a UUID', async () => {
    const res = (await handler(makeEvent({ body: body({ message_id: 'not-a-uuid' }) }), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(422);
  });

  it('200 noop when the message does not exist', async () => {
    tables.messages = null;
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toMatchObject({ status: 'noop' });
  });

  it('403s when the caller is not the message sender (notification-spam guard, design sign-off)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'someone-else' } }, error: null });
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(403);
  });

  it('dispatches to notify_level="all" participants and excludes the sender even if present', async () => {
    tables.conversation_participants = [
      { user_id: SENDER_ID, participant_role: 'teacher', notify_level: 'all' },
      { user_id: 'recipient-1', participant_role: 'student', notify_level: 'all' },
    ];
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    const parsed = JSON.parse(res.body as string);
    expect(parsed).toEqual({ status: 'dispatched', recipients: 1, sent: 1, cleaned_up: 0 });
  });

  it('excludes a muted participant entirely', async () => {
    tables.conversation_participants = [{ user_id: 'recipient-1', participant_role: 'student', notify_level: 'muted' }];
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });
    expect(pushDelivery.sendPush).not.toHaveBeenCalled();
  });

  it('mentions-level participant is included only when the message targets them', async () => {
    tables.messages = { ...tables.messages!, mention_targets: ['students'] };
    tables.conversation_participants = [{ user_id: 'recipient-1', participant_role: 'student', notify_level: 'mentions' }];
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(JSON.parse(res.body as string)).toMatchObject({ recipients: 1, sent: 1 });
  });

  it('fans out to every push_subscriptions row for a multi-device recipient', async () => {
    tables.push_subscriptions = [
      { id: 'sub-1', endpoint: 'https://push.example/1', p256dh_key: 'p1', auth_key: 'a1' },
      { id: 'sub-2', endpoint: 'https://push.example/2', p256dh_key: 'p2', auth_key: 'a2' },
    ];
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(pushDelivery.sendPush).toHaveBeenCalledTimes(2);
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 2, cleaned_up: 0 });
  });

  it('deletes a subscription that comes back {status:"gone"} and counts it as cleaned_up, not sent', async () => {
    vi.mocked(pushDelivery.sendPush).mockResolvedValue({ status: 'gone' });
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(deleteEq).toHaveBeenCalledWith('id', 'sub-1');
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 0, cleaned_up: 1 });
  });

  it('a {status:"failed"} subscription is neither sent nor cleaned_up, and does not throw', async () => {
    vi.mocked(pushDelivery.sendPush).mockResolvedValue({ status: 'failed', error: { statusCode: 503 } });
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 0, cleaned_up: 0 });
  });

  it('silent no-op (not an error) when the recipient has zero push_subscriptions (AC#7)', async () => {
    tables.push_subscriptions = [];
    const res = (await handler(makeEvent(), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 1, sent: 0, cleaned_up: 0 });
  });

  it('payload passed to sendPush carries only a generic, kind-derived title — no PII (AC#9)', async () => {
    await handler(makeEvent(), {} as never);
    expect(pushDelivery.sendPush).toHaveBeenCalledWith(expect.anything(), { title: 'New message in your class chat' });
  });
});

describe('push-send handler — class_update_id branch (ADR-0033)', () => {
  it('422s when both message_id and class_update_id are present', async () => {
    const res = (await handler(makeEvent({ body: body({ message_id: MESSAGE_ID, class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(422);
  });

  it('422s when neither message_id nor class_update_id is present', async () => {
    const res = (await handler(makeEvent({ body: body({}) }), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(422);
  });

  it('200 noop when the class_update does not exist', async () => {
    tables.class_updates = null;
    const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body as string)).toMatchObject({ status: 'noop' });
  });

  it("403s when the caller is not the class update's poster", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'someone-else' } }, error: null });
    const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
    expect(res.statusCode).toBe(403);
  });

  it('dispatches to the enrolled student (with login) and their parent, excluding the poster', async () => {
    // Two recipients (student + parent) — one subscription each, matching the mock's
    // ignore-the-filter/return-the-whole-table behavior used throughout this suite.
    tables.push_subscriptions = [
      { id: 'sub-1', endpoint: 'https://push.example/1', p256dh_key: 'p1', auth_key: 'a1' },
      { id: 'sub-2', endpoint: 'https://push.example/2', p256dh_key: 'p2', auth_key: 'a2' },
    ];
    const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 2, sent: 2, cleaned_up: 0 });
  });

  it('zero current enrollments dispatches to zero recipients, not an error (edge case)', async () => {
    tables.enrollments = [];
    const res = (await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never)) as HandlerResponse;
    expect(JSON.parse(res.body as string)).toEqual({ status: 'dispatched', recipients: 0, sent: 0, cleaned_up: 0 });
  });

  it('payload carries the exact, generic, PII-free class-update title', async () => {
    await handler(makeEvent({ body: body({ class_update_id: CLASS_UPDATE_ID }) }), {} as never);
    expect(pushDelivery.sendPush).toHaveBeenCalledWith(expect.anything(), { title: 'New update posted in your class' });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createMessagesApi } from '../messagesApi';
import type { ChatMessage } from '../messageList';

// A PostgREST builder is chainable and awaitable. This recorder is both: every method returns the
// same builder, and awaiting it yields the next queued result. Same idea as the recorder in
// features/teacher/class-update-and-home-feed/api/__tests__/classUpdates.test.ts.
type Result = { data: unknown; error: unknown };
type Call = [string, ...unknown[]];

function mockClient(results: Result[]) {
  const calls: Call[] = [];
  const queue = [...results];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'or', 'order', 'limit', 'range', 'insert', 'single', 'maybeSingle']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(queue.shift() ?? { data: [], error: null }).then(resolve, reject);
  const from = vi.fn((table: string) => {
    calls.push(['from', table]);
    return builder;
  });
  return { client: { from } as any, calls };
}

const argsFor = (calls: Call[], method: string) => calls.filter((c) => c[0] === method).map((c) => c.slice(1));

const CONV = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const COLUMNS = 'id, conversation_id, sender_user_id, body, mention_targets, created_at';
const row = (n: number): ChatMessage => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  conversation_id: CONV,
  sender_user_id: ME,
  body: `m${n}`,
  mention_targets: [],
  created_at: `2026-10-07T12:00:00.${String(n).padStart(6, '0')}+00:00`,
});
const rows = (count: number, from = 0) => Array.from({ length: count }, (_, i) => row(from + i));

describe('fetchLatest', () => {
  it('reads the newest 50 of one conversation, newest first by (created_at, id)', async () => {
    const { client, calls } = mockClient([{ data: [row(2), row(1)], error: null }]);

    const result = await createMessagesApi(client).fetchLatest(CONV);

    expect(result).toEqual([row(2), row(1)]);
    expect(argsFor(calls, 'from')).toEqual([['messages']]);
    expect(argsFor(calls, 'select')).toEqual([[COLUMNS]]);
    expect(argsFor(calls, 'eq')).toEqual([['conversation_id', CONV]]);
    expect(argsFor(calls, 'order')).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(argsFor(calls, 'limit')).toEqual([[50]]);
  });

  it('throws the PostgREST error', async () => {
    const { client } = mockClient([{ data: null, error: { message: 'boom' } }]);
    await expect(createMessagesApi(client).fetchLatest(CONV)).rejects.toEqual({ message: 'boom' });
  });
});

describe('fetchSince', () => {
  it('reads at or after the cursor, oldest first, in pages of 100', async () => {
    const { client, calls } = mockClient([{ data: rows(3), error: null }]);

    await createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z');

    expect(argsFor(calls, 'eq')).toEqual([['conversation_id', CONV]]);
    expect(argsFor(calls, 'gte')).toEqual([['created_at', '2026-10-07T12:00:20.000Z']]);
    expect(argsFor(calls, 'order')).toEqual([
      ['created_at', { ascending: true }],
      ['id', { ascending: true }],
    ]);
    expect(argsFor(calls, 'range')).toEqual([[0, 99]]);
  });

  it('keeps paging until a short page (a long absence is more than one page)', async () => {
    const { client, calls } = mockClient([
      { data: rows(100, 0), error: null },
      { data: rows(100, 100), error: null },
      { data: rows(7, 200), error: null },
    ]);

    const result = await createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z');

    expect(result).toHaveLength(207);
    expect(argsFor(calls, 'range')).toEqual([[0, 99], [100, 199], [200, 299]]);
  });

  it('asks once more when the last page is exactly full, then stops on the empty page', async () => {
    const { client, calls } = mockClient([
      { data: rows(100, 0), error: null },
      { data: [], error: null },
    ]);

    const result = await createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z');

    expect(result).toHaveLength(100);
    expect(argsFor(calls, 'range')).toEqual([[0, 99], [100, 199]]);
  });

  it('throws if any page fails, rather than returning a partial catch-up as if it were complete', async () => {
    const { client } = mockClient([
      { data: rows(100, 0), error: null },
      { data: null, error: { message: 'timeout' } },
    ]);
    await expect(createMessagesApi(client).fetchSince(CONV, '2026-10-07T12:00:20.000Z')).rejects.toEqual({ message: 'timeout' });
  });
});

describe('fetchOlder', () => {
  it('reads the 50 messages strictly before the oldest held one, by (created_at, id)', async () => {
    const before = row(5);
    const { client, calls } = mockClient([{ data: [row(4), row(3)], error: null }]);

    const result = await createMessagesApi(client).fetchOlder(CONV, before);

    expect(result).toEqual([row(4), row(3)]);
    expect(argsFor(calls, 'eq')).toEqual([['conversation_id', CONV]]);
    expect(argsFor(calls, 'or')).toEqual([
      [`created_at.lt."${before.created_at}",and(created_at.eq."${before.created_at}",id.lt.${before.id})`],
    ]);
    expect(argsFor(calls, 'order')).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
    expect(argsFor(calls, 'limit')).toEqual([[50]]);
  });
});

describe('insertMessage', () => {
  it('sends exactly the four columns a client may write and reads the saved row back', async () => {
    const saved = row(9);
    const { client, calls } = mockClient([{ data: saved, error: null }]);

    const result = await createMessagesApi(client).insertMessage({
      conversationId: CONV,
      senderUserId: ME,
      body: 'hello',
      mentionTargets: ['teacher'],
    });

    expect(result).toEqual(saved);
    expect(argsFor(calls, 'from')).toEqual([['messages']]);
    // id and created_at are stamped by the database; sending either is refused with 42501.
    expect(argsFor(calls, 'insert')).toEqual([
      [{ conversation_id: CONV, sender_user_id: ME, body: 'hello', mention_targets: ['teacher'] }],
    ]);
    expect(argsFor(calls, 'select')).toEqual([[COLUMNS]]);
    expect(argsFor(calls, 'single')).toEqual([[]]);
  });

  it('throws when the save is refused', async () => {
    const { client } = mockClient([{ data: null, error: { code: '42501' } }]);
    await expect(
      createMessagesApi(client).insertMessage({ conversationId: CONV, senderUserId: ME, body: 'x', mentionTargets: [] }),
    ).rejects.toEqual({ code: '42501' });
  });
});

describe('isConversationReadable', () => {
  it('is true when the conversations row comes back', async () => {
    const { client, calls } = mockClient([{ data: { id: CONV }, error: null }]);

    expect(await createMessagesApi(client).isConversationReadable(CONV)).toBe(true);
    expect(argsFor(calls, 'from')).toEqual([['conversations']]);
    expect(argsFor(calls, 'select')).toEqual([['id']]);
    expect(argsFor(calls, 'eq')).toEqual([['id', CONV]]);
    expect(argsFor(calls, 'maybeSingle')).toEqual([[]]);
  });

  it('is false when RLS hides the row (no row, no error)', async () => {
    const { client } = mockClient([{ data: null, error: null }]);
    expect(await createMessagesApi(client).isConversationReadable(CONV)).toBe(false);
  });

  it('throws on a real error, so a network failure is never mistaken for lost access', async () => {
    const { client } = mockClient([{ data: null, error: { message: 'offline' } }]);
    await expect(createMessagesApi(client).isConversationReadable(CONV)).rejects.toEqual({ message: 'offline' });
  });
});

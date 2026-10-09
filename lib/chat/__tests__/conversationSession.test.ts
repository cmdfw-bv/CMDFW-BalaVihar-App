import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CATCH_UP_POLL_MS, createConversationSession, type ConversationState } from '../conversationSession';
import type { ChannelHandlers, ConversationChannel } from '../conversationChannel';
import type { NewMessage } from '../messagesApi';
import type { ChatMessage } from '../messageList';

const CONV = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';

// msg(n) was saved n seconds after 12:00:00 UTC.
const msg = (n: number): ChatMessage => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  conversation_id: CONV,
  sender_user_id: ME,
  body: `m${n}`,
  mention_targets: [],
  created_at: new Date(Date.UTC(2026, 9, 7, 12, 0, n)).toISOString(),
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness() {
  const states: ConversationState[] = [];
  let handlers: ChannelHandlers | null = null;
  const leave = vi.fn(async () => {});
  const api = {
    fetchLatest: vi.fn(async (_conversationId: string): Promise<ChatMessage[]> => []),
    fetchSince: vi.fn(async (_conversationId: string, _sinceIso: string): Promise<ChatMessage[]> => []),
    fetchOlder: vi.fn(async (_conversationId: string, _before: ChatMessage): Promise<ChatMessage[]> => []),
    insertMessage: vi.fn(async (_input: NewMessage): Promise<ChatMessage> => msg(0)),
    isConversationReadable: vi.fn(async (_conversationId: string): Promise<boolean> => true),
  };
  const joinChannel = vi.fn(async (_conversationId: string, h: ChannelHandlers): Promise<ConversationChannel> => {
    handlers = h;
    return { leave };
  });
  const session = createConversationSession(CONV, ME, { api, joinChannel, onChange: (s) => states.push(s) });
  const channel = (): ChannelHandlers => {
    if (!handlers) throw new Error('the session never joined a channel');
    return handlers;
  };
  return { session, api, joinChannel, leave, states, channel };
}

// Fake timers leave the microtask queue alone; advancing by 0 drains it.
const settle = () => vi.advanceTimersByTimeAsync(0);
const ids = (state: ConversationState) => state.messages.map((m) => m.id);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('opening a conversation', () => {
  it('starts loading, joins the channel and loads the newest messages', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(2), msg(1)]);
    expect(h.session.getState()).toEqual({ messages: [], status: 'loading', isLive: false, hasOlder: false });

    await h.session.open();
    await settle();

    expect(h.joinChannel).toHaveBeenCalledWith(CONV, expect.any(Object));
    expect(h.api.fetchLatest).toHaveBeenCalledWith(CONV);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(1).id, msg(2).id]);
    expect(h.states.at(-1)).toEqual(h.session.getState());
  });

  it('reports older messages exist when the first page comes back full', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => msg(i + 1)));

    await h.session.open();
    await settle();

    expect(h.session.getState().hasOlder).toBe(true);
  });

  it('still loads when the channel cannot be joined at all (connection limit, network)', async () => {
    const h = harness();
    h.joinChannel.mockRejectedValueOnce(new Error('no socket'));
    h.api.fetchLatest.mockResolvedValueOnce([msg(1)]);

    await h.session.open();
    await settle();

    expect(h.session.getState()).toMatchObject({ status: 'ready', isLive: false });
    expect(ids(h.session.getState())).toEqual([msg(1).id]);
  });

  it('reports an error when the first load fails, then recovers on the next tick', async () => {
    const h = harness();
    h.api.fetchLatest.mockRejectedValueOnce(new Error('offline'));
    h.api.fetchLatest.mockResolvedValueOnce([msg(1)]);

    await h.session.open();
    await settle();
    expect(h.session.getState().status).toBe('error');

    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(1).id]);
  });
});

describe('catch-up', () => {
  async function opened(initial: ChatMessage[] = [msg(30)]) {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce(initial);
    await h.session.open();
    await settle();
    h.api.fetchSince.mockClear();
    return h;
  }

  it('on a ping, fetches from the newest held message minus the 10 second overlap', async () => {
    const h = await opened();
    h.api.fetchSince.mockResolvedValueOnce([msg(30), msg(31)]);

    h.channel().onPing(msg(31).id);
    await settle();

    expect(h.api.fetchSince).toHaveBeenCalledWith(CONV, '2026-10-07T12:00:20.000Z');
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });

  it('runs when the channel joins or rejoins, and reports live', async () => {
    const h = await opened();

    h.channel().onJoined();
    await settle();

    expect(h.session.getState().isLive).toBe(true);
    expect(h.api.fetchSince).toHaveBeenCalledTimes(1);
  });

  it('runs every 30 seconds, so a lost ping or a dead connection costs at most that long', async () => {
    const h = await opened();

    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);

    expect(h.api.fetchSince).toHaveBeenCalledTimes(2);
  });

  it('is single flight: pings during an in-flight catch-up cause exactly one more', async () => {
    const h = await opened();
    const first = deferred<ChatMessage[]>();
    h.api.fetchSince.mockReturnValueOnce(first.promise);

    h.channel().onPing(msg(31).id);
    await settle();
    h.channel().onPing(msg(32).id);
    h.channel().onPing(msg(33).id);
    h.channel().onJoined();
    await settle();
    expect(h.api.fetchSince).toHaveBeenCalledTimes(1);

    first.resolve([msg(31)]);
    h.api.fetchSince.mockResolvedValueOnce([msg(31), msg(32), msg(33)]);
    await settle();

    expect(h.api.fetchSince).toHaveBeenCalledTimes(2);
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id, msg(32).id, msg(33).id]);
  });

  it('keeps what it holds when a later catch-up fails', async () => {
    const h = await opened();
    h.api.fetchSince.mockRejectedValueOnce(new Error('timeout'));

    h.channel().onPing(null);
    await settle();

    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });

  it('goes not-live when the channel drops, and keeps updating on the timer', async () => {
    const h = await opened();
    h.channel().onJoined();
    await settle();
    h.api.fetchSince.mockClear();

    h.channel().onDown();
    expect(h.session.getState().isLive).toBe(false);

    h.api.fetchSince.mockResolvedValueOnce([msg(31)]);
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });
});

describe('sending', () => {
  it('inserts as the current user, merges the saved row at once and returns it', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.api.insertMessage.mockResolvedValueOnce(msg(40));

    const saved = await h.session.send('hello', ['teacher']);

    expect(h.api.insertMessage).toHaveBeenCalledWith({
      conversationId: CONV,
      senderUserId: ME,
      body: 'hello',
      mentionTargets: ['teacher'],
    });
    expect(saved).toEqual(msg(40));
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(40).id]);
  });

  it("shows the sender's message once when its own ping follows", async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.api.insertMessage.mockResolvedValueOnce(msg(40));
    await h.session.send('hello');

    h.api.fetchSince.mockResolvedValueOnce([msg(30), msg(40)]);
    h.channel().onPing(msg(40).id);
    await settle();

    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(40).id]);
    expect(h.api.isConversationReadable).not.toHaveBeenCalled();
  });

  it('defaults mention targets to none', async () => {
    const h = harness();
    await h.session.open();
    await settle();

    await h.session.send('hello');

    expect(h.api.insertMessage).toHaveBeenCalledWith(expect.objectContaining({ mentionTargets: [] }));
  });

  it('does not skip history when a message is sent before the first load has succeeded', async () => {
    const h = harness();
    h.api.fetchLatest.mockRejectedValueOnce(new Error('offline'));
    await h.session.open();
    await settle();
    h.api.insertMessage.mockResolvedValueOnce(msg(40));
    await h.session.send('hello');

    // The list now holds one message. The next catch-up must still be the initial load, not
    // "newer than the message I just sent".
    h.api.fetchLatest.mockResolvedValueOnce([msg(40), msg(39), msg(38)]);
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);

    expect(h.api.fetchSince).not.toHaveBeenCalled();
    expect(h.api.fetchLatest).toHaveBeenCalledTimes(2);
    expect(ids(h.session.getState())).toEqual([msg(38).id, msg(39).id, msg(40).id]);
  });

  it('propagates a refused save and changes nothing', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.api.insertMessage.mockRejectedValueOnce({ code: '42501' });

    await expect(h.session.send('hello')).rejects.toEqual({ code: '42501' });
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });
});

describe('access lost while the conversation is open', () => {
  async function opened() {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.channel().onJoined();
    await settle();
    h.api.fetchSince.mockClear();
    return h;
  }

  it('clears the list, removes the channel and stops when a pinged message cannot be fetched and the conversation is gone', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockResolvedValueOnce(false);

    h.channel().onPing(msg(31).id); // RLS returns nothing for it
    await settle();

    expect(h.session.getState()).toEqual({ messages: [], status: 'unavailable', isLive: false, hasOlder: false });
    expect(h.leave).toHaveBeenCalledTimes(1);

    h.api.fetchSince.mockClear();
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS * 2);
    expect(h.api.fetchSince).not.toHaveBeenCalled();
  });

  it('stays as it is when the pinged message is missing but the conversation is still readable', async () => {
    const h = await opened();

    h.channel().onPing(msg(31).id);
    await settle();

    expect(h.api.isConversationReadable).toHaveBeenCalledWith(CONV);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
    expect(h.leave).not.toHaveBeenCalled();
  });

  it('becomes unavailable when a join is refused and the conversation is gone', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockResolvedValueOnce(false);

    h.channel().onJoinFailed();
    await settle();

    expect(h.session.getState().status).toBe('unavailable');
    expect(h.session.getState().messages).toEqual([]);
    expect(h.leave).toHaveBeenCalledTimes(1);
  });

  it('only goes not-live when a join fails but the conversation is still readable (connection limit)', async () => {
    const h = await opened();

    h.channel().onJoinFailed();
    await settle();

    expect(h.session.getState()).toMatchObject({ status: 'ready', isLive: false });
    expect(h.leave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);
    expect(h.api.fetchSince).toHaveBeenCalled();
  });

  it('does not conclude anything when the access check itself fails', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockRejectedValueOnce(new Error('offline'));

    h.channel().onJoinFailed();
    await settle();

    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });

  it('reports unavailable, not an empty chat, to a non-participant who cannot reach Realtime', async () => {
    const h = harness();
    h.joinChannel.mockRejectedValueOnce(new Error('no socket'));
    h.api.fetchLatest.mockResolvedValueOnce([]); // RLS: nothing
    h.api.isConversationReadable.mockResolvedValueOnce(false);

    await h.session.open();
    await settle();

    expect(h.session.getState().status).toBe('unavailable');
  });

  it('reports ready for a readable conversation that simply has no messages yet', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([]);

    await h.session.open();
    await settle();

    expect(h.session.getState()).toMatchObject({ status: 'ready', messages: [] });
  });

  it('tries again from scratch when reopened (re-enrolled user returning to the app)', async () => {
    const h = await opened();
    h.api.isConversationReadable.mockResolvedValueOnce(false);
    h.channel().onJoinFailed();
    await settle();
    expect(h.session.getState().status).toBe('unavailable');

    h.api.fetchLatest.mockResolvedValueOnce([msg(50)]);
    await h.session.open();
    await settle();

    expect(h.joinChannel).toHaveBeenCalledTimes(2);
    expect(h.session.getState().status).toBe('ready');
    expect(ids(h.session.getState())).toEqual([msg(50).id]);
  });
});

describe('closing and reopening (background, foreground, leaving the screen)', () => {
  async function opened() {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(30)]);
    await h.session.open();
    await settle();
    h.channel().onJoined();
    await settle();
    h.api.fetchSince.mockClear();
    return h;
  }

  it('close leaves the channel, stops the timer, reports not-live and keeps the messages', async () => {
    const h = await opened();

    await h.session.close();
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS * 2);

    expect(h.leave).toHaveBeenCalledTimes(1);
    expect(h.api.fetchSince).not.toHaveBeenCalled();
    expect(h.session.getState().isLive).toBe(false);
    expect(ids(h.session.getState())).toEqual([msg(30).id]);
  });

  it('reopen rejoins and catches up from where it left off, not from scratch', async () => {
    const h = await opened();
    await h.session.close();
    h.api.fetchSince.mockResolvedValueOnce([msg(30), msg(31)]);

    await h.session.open();
    await settle();

    expect(h.joinChannel).toHaveBeenCalledTimes(2);
    expect(h.api.fetchLatest).toHaveBeenCalledTimes(1);
    expect(h.api.fetchSince).toHaveBeenCalledWith(CONV, '2026-10-07T12:00:20.000Z');
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });

  it('open is idempotent: a second open while open does not join twice', async () => {
    const h = await opened();

    await h.session.open();

    expect(h.joinChannel).toHaveBeenCalledTimes(1);
  });

  it('ignores events from a channel it has already left', async () => {
    const h = await opened();
    const stale = h.channel();
    await h.session.close();

    stale.onPing(msg(31).id);
    stale.onJoined();
    await settle();

    expect(h.api.fetchSince).not.toHaveBeenCalled();
    expect(h.session.getState().isLive).toBe(false);
  });

  it('drops the result of a catch-up that was in flight when it closed, and works again on reopen', async () => {
    const h = await opened();
    const inFlight = deferred<ChatMessage[]>();
    h.api.fetchSince.mockReturnValueOnce(inFlight.promise);
    h.channel().onPing(msg(31).id);
    await settle();

    await h.session.close();
    inFlight.resolve([msg(31)]);
    await settle();
    expect(ids(h.session.getState())).toEqual([msg(30).id]);

    h.api.fetchSince.mockResolvedValueOnce([msg(31)]);
    await h.session.open();
    await settle();
    expect(ids(h.session.getState())).toEqual([msg(30).id, msg(31).id]);
  });

  it('leaves a channel whose join finished after the session had already closed', async () => {
    const h = harness();
    const join = deferred<{ leave: () => Promise<void> }>();
    h.joinChannel.mockReturnValueOnce(join.promise);

    const opening = h.session.open();
    await settle();
    await h.session.close();
    join.resolve({ leave: h.leave });
    await opening;

    expect(h.leave).toHaveBeenCalledTimes(1);
  });
});

describe('older pages', () => {
  it('fetches before the oldest held message, merges, and updates hasOlder', async () => {
    const h = harness();
    const firstPage = Array.from({ length: 50 }, (_, i) => msg(i + 100));
    h.api.fetchLatest.mockResolvedValueOnce(firstPage);
    await h.session.open();
    await settle();
    h.api.fetchOlder.mockResolvedValueOnce([msg(99), msg(98)]);

    await h.session.loadOlder();

    expect(h.api.fetchOlder).toHaveBeenCalledWith(CONV, msg(100));
    expect(ids(h.session.getState()).slice(0, 3)).toEqual([msg(98).id, msg(99).id, msg(100).id]);
    expect(h.session.getState().hasOlder).toBe(false);
  });

  it('does nothing when there are no older messages', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce([msg(1)]);
    await h.session.open();
    await settle();

    await h.session.loadOlder();

    expect(h.api.fetchOlder).not.toHaveBeenCalled();
  });

  it('does not run two older-page fetches at once', async () => {
    const h = harness();
    h.api.fetchLatest.mockResolvedValueOnce(Array.from({ length: 50 }, (_, i) => msg(i + 100)));
    await h.session.open();
    await settle();
    const page = deferred<ChatMessage[]>();
    h.api.fetchOlder.mockReturnValueOnce(page.promise);

    const first = h.session.loadOlder();
    const second = h.session.loadOlder();
    page.resolve([]);
    await Promise.all([first, second]);

    expect(h.api.fetchOlder).toHaveBeenCalledTimes(1);
  });
});

// The harness above returns canned rows whatever cursor it is given, so it cannot notice a cursor
// that skips history. This one keeps a table and answers fetchSince the way the database does.
describe('catch-up against a table that honours the cursor', () => {
  async function openedOn(initial: ChatMessage[]) {
    const h = harness();
    const table = [...initial];
    const newestFirst = () => [...table].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    h.api.fetchLatest.mockImplementation(async () => newestFirst().slice(0, 50));
    h.api.fetchSince.mockImplementation(async (_conversationId, sinceIso) =>
      newestFirst()
        .reverse()
        .filter((m) => Date.parse(m.created_at) >= Date.parse(sinceIso)),
    );
    const savedByMe = (m: ChatMessage) =>
      h.api.insertMessage.mockImplementationOnce(async () => {
        table.push(m);
        return m;
      });
    await h.session.open();
    await settle();
    return { ...h, table, savedByMe };
  }

  it("still fetches someone else's missed message after this device sends a later one", async () => {
    const h = await openedOn([msg(1)]);
    h.table.push(msg(5)); // saved by someone else; its signal never arrived

    h.savedByMe(msg(30));
    await h.session.send('mine');
    h.channel().onPing(msg(30).id);
    await settle();

    expect(ids(h.session.getState())).toEqual([msg(1).id, msg(5).id, msg(30).id]);
  });

  it('still fetches messages that arrived in the background when the foreground fetch failed before a send', async () => {
    const h = await openedOn([msg(1)]);
    await h.session.close();
    h.table.push(msg(5), msg(6));

    h.api.fetchSince.mockRejectedValueOnce(new Error('offline'));
    await h.session.open();
    await settle();
    h.savedByMe(msg(30));
    await h.session.send('mine');
    await vi.advanceTimersByTimeAsync(CATCH_UP_POLL_MS);

    expect(ids(h.session.getState())).toEqual([msg(1).id, msg(5).id, msg(6).id, msg(30).id]);
  });
});

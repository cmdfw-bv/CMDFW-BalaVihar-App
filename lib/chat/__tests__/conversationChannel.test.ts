import { describe, it, expect, vi, type Mock } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { chatTopic, joinConversationChannel, type ChannelHandlers } from '../conversationChannel';

const CONV = '11111111-aaaa-4111-8111-111111111111';

function fakeClient() {
  const order: string[] = [];
  let statusCallback: ((status: string) => void) | null = null;
  let broadcastCallback: ((message: { payload?: unknown }) => void) | null = null;
  const channel = {
    on: vi.fn((_type: string, _filter: unknown, callback: (message: { payload?: unknown }) => void) => {
      broadcastCallback = callback;
      return channel;
    }),
    subscribe: vi.fn((callback: (status: string) => void) => {
      order.push('subscribe');
      statusCallback = callback;
      return channel;
    }),
  };
  const client = {
    realtime: {
      setAuth: vi.fn(async () => {
        order.push('setAuth');
      }),
    },
    channel: vi.fn(() => {
      order.push('channel');
      return channel;
    }),
    removeChannel: vi.fn(async () => 'ok'),
  };
  return {
    client: client as unknown as SupabaseClient,
    raw: client,
    channel,
    order,
    status: (status: string) => statusCallback?.(status),
    broadcast: (payload: unknown) => broadcastCallback?.({ payload }),
  };
}

function handlers(): { [K in keyof ChannelHandlers]: Mock<ChannelHandlers[K]> } {
  return {
    onPing: vi.fn<ChannelHandlers['onPing']>(),
    onJoined: vi.fn<ChannelHandlers['onJoined']>(),
    onJoinFailed: vi.fn<ChannelHandlers['onJoinFailed']>(),
    onDown: vi.fn<ChannelHandlers['onDown']>(),
  };
}

describe('chatTopic', () => {
  it('is chat:<conversation id>', () => {
    expect(chatTopic(CONV)).toBe(`chat:${CONV}`);
  });

  it('lowercases the id, because the channel policy accepts lowercase uuids only', () => {
    expect(chatTopic(CONV.toUpperCase())).toBe(`chat:${CONV}`);
  });
});

describe('joinConversationChannel', () => {
  it('sets Realtime auth from the current session before joining a private channel', async () => {
    const fake = fakeClient();

    await joinConversationChannel(fake.client, CONV, handlers());

    expect(fake.order).toEqual(['setAuth', 'channel', 'subscribe']);
    expect(fake.raw.realtime.setAuth).toHaveBeenCalledWith();
    expect(fake.raw.channel).toHaveBeenCalledWith(`chat:${CONV}`, { config: { private: true } });
    expect(fake.channel.on).toHaveBeenCalledWith('broadcast', { event: 'message_saved' }, expect.any(Function));
  });

  it('reports a successful join, and every rejoin', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.status('SUBSCRIBED');
    fake.status('SUBSCRIBED');

    expect(h.onJoined).toHaveBeenCalledTimes(2);
  });

  it('reports a refused or timed-out join as a failed join', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.status('CHANNEL_ERROR');
    fake.status('TIMED_OUT');

    expect(h.onJoinFailed).toHaveBeenCalledTimes(2);
    expect(h.onJoined).not.toHaveBeenCalled();
  });

  it('reports a closed channel as down', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.status('CLOSED');

    expect(h.onDown).toHaveBeenCalledTimes(1);
  });

  it('surfaces a ping with the message id from the payload', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.broadcast({ id: 'm-1', created_at: '2026-10-07T12:00:00+00:00' });

    expect(h.onPing).toHaveBeenCalledWith('m-1');
  });

  it('still surfaces a ping whose payload is not what we expect (a ping means "catch up now")', async () => {
    const fake = fakeClient();
    const h = handlers();
    await joinConversationChannel(fake.client, CONV, h);

    fake.broadcast(undefined);
    fake.broadcast({ id: 42 });
    fake.broadcast('nonsense');

    expect(h.onPing.mock.calls).toEqual([[null], [null], [null]]);
  });

  it('leave() removes the channel from the socket, once', async () => {
    const fake = fakeClient();
    const joined = await joinConversationChannel(fake.client, CONV, handlers());

    await joined.leave();
    await joined.leave();

    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);
    expect(fake.raw.removeChannel).toHaveBeenCalledWith(fake.channel);
  });

  it('is silent after leave(): removing a channel fires CLOSED, which is not news', async () => {
    const fake = fakeClient();
    const h = handlers();
    const joined = await joinConversationChannel(fake.client, CONV, h);

    await joined.leave();
    fake.status('CLOSED');
    fake.status('SUBSCRIBED');
    fake.broadcast({ id: 'm-1' });

    expect(h.onDown).not.toHaveBeenCalled();
    expect(h.onJoined).not.toHaveBeenCalled();
    expect(h.onPing).not.toHaveBeenCalled();
  });

  it('leave() does not throw when removing the channel fails', async () => {
    const fake = fakeClient();
    fake.raw.removeChannel.mockRejectedValueOnce(new Error('socket gone'));
    const joined = await joinConversationChannel(fake.client, CONV, handlers());

    await expect(joined.leave()).resolves.toBeUndefined();
  });
});

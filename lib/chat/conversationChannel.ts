import type { SupabaseClient } from '@supabase/supabase-js';

export const MESSAGE_SAVED_EVENT = 'message_saved';

// The channel policy accepts `chat:<lowercase uuid>` and nothing else. An id that arrives in
// mixed case (a link, a hand-typed route) would otherwise become a join that is refused forever.
export function chatTopic(conversationId: string): string {
  return `chat:${conversationId.toLowerCase()}`;
}

export interface ChannelHandlers {
  /** A message was saved. The id is advisory; the handler's job is "run catch-up now". */
  onPing(messageId: string | null): void;
  /** Joined or rejoined. */
  onJoined(): void;
  /** The join was refused or timed out. supabase-js keeps retrying until leave(). */
  onJoinFailed(): void;
  /** The channel closed underneath us. */
  onDown(): void;
}

export interface ConversationChannel {
  leave(): Promise<void>;
}

function pingedMessageId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const id = (payload as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

// The only place client code touches Realtime. Listen-only: this module never calls
// channel.send(), and the database has no insert policy that would deliver it if it did.
export async function joinConversationChannel(
  client: SupabaseClient,
  conversationId: string,
  handlers: ChannelHandlers,
): Promise<ConversationChannel> {
  // No argument: use the current session's access token. Private channels are authorized with
  // it, and supabase-js forwards later refreshed tokens to Realtime by itself.
  await client.realtime.setAuth();

  let left = false;
  const channel = client.channel(chatTopic(conversationId), { config: { private: true } });

  channel
    .on('broadcast', { event: MESSAGE_SAVED_EVENT }, (message: { payload?: unknown }) => {
      if (!left) handlers.onPing(pingedMessageId(message.payload));
    })
    .subscribe((status: string) => {
      if (left) return;
      if (status === 'SUBSCRIBED') handlers.onJoined();
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') handlers.onJoinFailed();
      else if (status === 'CLOSED') handlers.onDown();
    });

  return {
    async leave() {
      if (left) return;
      left = true;
      // removeChannel, not unsubscribe: a refused channel left on the socket keeps retrying and
      // delays delivery on every other channel sharing that connection (measured at /plan).
      try {
        await client.removeChannel(channel);
      } catch {
        // The socket is already gone; there is nothing left to remove.
      }
    },
  };
}

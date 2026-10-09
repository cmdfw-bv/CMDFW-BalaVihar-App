import type { ChannelHandlers, ConversationChannel } from './conversationChannel';
import type { MessagesApi } from './messagesApi';
import { INITIAL_PAGE_SIZE, catchUpCursor, compareMessages, mergeMessages, type ChatMessage } from './messageList';

// A signal can be lost and a connection can be refused (200-connection limit, network). The same
// catch-up runs on this timer, so the chat degrades from instant to at most this late and no
// separate fallback mode exists (design decision 3).
export const CATCH_UP_POLL_MS = 30_000;

export type ConversationStatus = 'loading' | 'ready' | 'error' | 'unavailable';

export interface ConversationState {
  messages: ChatMessage[];
  status: ConversationStatus;
  isLive: boolean;
  hasOlder: boolean;
}

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  messages: [],
  status: 'loading',
  isLive: false,
  hasOlder: false,
};

export interface SessionDeps {
  api: MessagesApi;
  joinChannel(conversationId: string, handlers: ChannelHandlers): Promise<ConversationChannel>;
  onChange(state: ConversationState): void;
  pollMs?: number;
}

export interface ConversationSession {
  getState(): ConversationState;
  open(): Promise<void>;
  close(): Promise<void>;
  loadOlder(): Promise<void>;
  send(body: string, mentionTargets?: string[]): Promise<ChatMessage>;
}

// Everything a conversation does while it is on screen, with no React in it so it can be tested
// directly (the repo has no renderer; same split as setupAutoRefreshOnRegain and its hook).
// `open` / `close` are also foreground / background: messages are kept across them.
export function createConversationSession(
  conversationId: string,
  userId: string,
  deps: SessionDeps,
): ConversationSession {
  let state = INITIAL_CONVERSATION_STATE;
  let active = false;
  // Bumped whenever the current channel stops being ours, so a late callback or a late join
  // from an earlier open cannot act on this one.
  let generation = 0;
  let channel: ConversationChannel | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;
  let rerun = false;
  // False until one initial load has succeeded. Until then catch-up must be "newest 50", even
  // if the list already holds a message this device just sent.
  let loaded = false;
  // The newest message a fetch has returned. Catch-up resumes from here, never from the newest
  // message on screen: this device's own sent message is on screen at once, and resuming from it
  // would skip anything saved earlier by someone else that no fetch has brought in yet.
  let newestFetched: ChatMessage | null = null;
  let loadingOlder = false;
  const pendingPings = new Set<string>();

  function set(patch: Partial<ConversationState>): void {
    state = { ...state, ...patch };
    deps.onChange(state);
  }

  function stopTimer(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  async function becomeUnavailable(): Promise<void> {
    active = false;
    generation += 1;
    stopTimer();
    pendingPings.clear();
    loaded = false;
    newestFetched = null;
    const leaving = channel;
    channel = null;
    // A withdrawn user's device stops showing a minors' conversation as soon as it notices.
    set({ messages: [], status: 'unavailable', isLive: false, hasOlder: false });
    if (leaving) await leaving.leave();
  }

  // RLS answers a revoked user with an empty result, not an error, so "nothing new" and "no
  // longer allowed" look the same. Reading the conversations row tells them apart.
  async function checkAccess(): Promise<void> {
    let readable: boolean;
    try {
      readable = await deps.api.isConversationReadable(conversationId);
    } catch {
      return; // Cannot tell. The next ping, failed join or empty catch-up asks again.
    }
    if (active && !readable) await becomeUnavailable();
  }

  async function catchUp(): Promise<void> {
    if (!active) return;
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      do {
        rerun = false;
        const pinged = [...pendingPings];
        pendingPings.clear();
        const cursor = loaded && newestFetched ? catchUpCursor([newestFetched]) : null;

        let rows: ChatMessage[];
        try {
          rows =
            cursor === null
              ? await deps.api.fetchLatest(conversationId)
              : await deps.api.fetchSince(conversationId, cursor);
        } catch {
          for (const id of pinged) pendingPings.add(id);
          if (active && !loaded) set({ status: 'error' });
          continue;
        }
        if (!active) break;

        for (const row of rows) {
          if (!newestFetched || compareMessages(row, newestFetched) > 0) newestFetched = row;
        }
        const messages = mergeMessages(state.messages, rows);
        // Nothing at all is also what someone with no access gets. Ask before reporting it, so
        // they are never shown an empty chat that looks real (plan decision D).
        const empty = messages.length === 0;
        if (empty) {
          await checkAccess();
          if (!active) break;
        }
        set(
          cursor === null
            ? { messages, status: 'ready', hasOlder: rows.length === INITIAL_PAGE_SIZE }
            : { messages, status: 'ready' },
        );
        loaded = true;

        const held = new Set(messages.map((m) => m.id));
        if (!empty && pinged.some((id) => !held.has(id))) await checkAccess();
      } while (rerun && active);
    } finally {
      running = false;
    }
  }

  function handlersFor(openedAs: number): ChannelHandlers {
    const current = () => active && openedAs === generation;
    return {
      onPing(messageId) {
        if (!current()) return;
        if (messageId) pendingPings.add(messageId);
        void catchUp();
      },
      onJoined() {
        if (!current()) return;
        set({ isLive: true });
        void catchUp();
      },
      onJoinFailed() {
        if (!current()) return;
        set({ isLive: false });
        void checkAccess();
      },
      onDown() {
        if (!current()) return;
        set({ isLive: false });
      },
    };
  }

  return {
    getState: () => state,

    async open() {
      if (active) return;
      active = true;
      generation += 1;
      const openedAs = generation;
      if (state.status !== 'ready') set({ status: 'loading' });

      timer = setInterval(() => void catchUp(), deps.pollMs ?? CATCH_UP_POLL_MS);
      void catchUp();

      try {
        const joined = await deps.joinChannel(conversationId, handlersFor(openedAs));
        if (!active || openedAs !== generation) {
          await joined.leave();
          return;
        }
        channel = joined;
      } catch {
        // Cannot connect. The timer keeps the conversation current; nothing is lost.
      }
    },

    async close() {
      if (!active) return;
      active = false;
      generation += 1;
      stopTimer();
      rerun = false;
      const leaving = channel;
      channel = null;
      if (state.isLive) set({ isLive: false });
      if (leaving) await leaving.leave();
    },

    async loadOlder() {
      const oldest = state.messages[0];
      if (!state.hasOlder || loadingOlder || !oldest) return;
      loadingOlder = true;
      try {
        const rows = await deps.api.fetchOlder(conversationId, oldest);
        if (state.status === 'unavailable') return;
        set({ messages: mergeMessages(state.messages, rows), hasOlder: rows.length === INITIAL_PAGE_SIZE });
      } finally {
        loadingOlder = false;
      }
    },

    async send(body, mentionTargets = []) {
      const saved = await deps.api.insertMessage({ conversationId, senderUserId: userId, body, mentionTargets });
      // Merged at once; the ping that follows finds it already present. Returned so the caller
      // can invoke push (ADR-0028). This module does not call push.
      if (state.status !== 'unavailable') set({ messages: mergeMessages(state.messages, [saved]) });
      return saved;
    },
  };
}

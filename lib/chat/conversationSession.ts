import type { ChannelHandlers, ConversationChannel } from './conversationChannel';
import type { MessagesApi } from './messagesApi';
import {
  INITIAL_PAGE_SIZE,
  applyRemovals,
  catchUpCursor,
  compareMessages,
  mergeMessages,
  type ChatMessage,
} from './messageList';

// A signal can be lost and a connection can be refused (200-connection limit, network). The same
// catch-up runs on this timer, so the chat degrades from instant to at most this late and no
// separate fallback mode exists (design decision 3).
export const CATCH_UP_POLL_MS = 30_000;

export const REMOVE_REFUSED_COPY = "This message can't be removed.";
export const REMOVE_NETWORK_COPY = "Couldn't remove \u2014 try again.";

/**
 * `refused`: the database said no (42501). `network`: anything else; the message may still be removable.
 * `code` is the Postgres / PostgREST code or error name (see errorCodeOf), never the error's text.
 */
export class RemoveMessageError extends Error {
  constructor(
    readonly kind: 'refused' | 'network',
    readonly code: string,
  ) {
    super(kind === 'refused' ? REMOVE_REFUSED_COPY : REMOVE_NETWORK_COPY);
    this.name = 'RemoveMessageError';
  }
}

export type ConversationStatus = 'loading' | 'ready' | 'error' | 'unavailable';

export interface ConversationState {
  messages: ChatMessage[];
  status: ConversationStatus;
  isLive: boolean;
  hasOlder: boolean;
  /** Code of the most recent failed load, until a load succeeds. Never the error's text. */
  errorCode: string | null;
  /** Ids of messages whose removal call is in flight. */
  removing: string[];
}

export const INITIAL_CONVERSATION_STATE: ConversationState = {
  messages: [],
  status: 'loading',
  isLive: false,
  hasOlder: false,
  errorCode: null,
  removing: [],
};

/**
 * A failure the session recovered from by itself, or (`remove`) a removal that failed for any
 * reason other than the database refusing it. `code` is a Postgres / PostgREST code or an error name.
 */
export interface SessionErrorReport {
  source: 'load' | 'access' | 'join' | 'remove';
  code: string;
}

export interface SessionDeps {
  api: MessagesApi;
  joinChannel(conversationId: string, handlers: ChannelHandlers): Promise<ConversationChannel>;
  onChange(state: ConversationState): void;
  onError?(report: SessionErrorReport): void;
  pollMs?: number;
}

// The code or the name only. An error's message can quote the failing statement or a URL, and
// this value may leave the device (client-privacy rule: nothing PII goes to error reporting).
export function errorCodeOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === 'string' && code !== '') return code;
    if (typeof name === 'string' && name !== '') return name;
  }
  return 'unknown';
}

export interface ConversationSession {
  getState(): ConversationState;
  open(): Promise<void>;
  close(): Promise<void>;
  loadOlder(): Promise<void>;
  send(body: string, mentionTargets?: string[]): Promise<ChatMessage>;
  remove(messageId: string): Promise<void>;
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
  // One call per message id at a time. A second remove() of an id already in flight (a double
  // tap) gets the first call's promise: it shares that outcome and `removing` holds the id once.
  const inFlightRemovals = new Map<string, Promise<void>>();

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
    set({ messages: [], status: 'unavailable', isLive: false, hasOlder: false, errorCode: null, removing: [] });
    if (leaving) await leaving.leave();
  }

  // RLS answers a revoked user with an empty result, not an error, so "nothing new" and "no
  // longer allowed" look the same. Reading the conversations row tells them apart.
  async function checkAccess(): Promise<void> {
    let readable: boolean;
    try {
      readable = await deps.api.isConversationReadable(conversationId);
    } catch (error) {
      deps.onError?.({ source: 'access', code: errorCodeOf(error) });
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
        let merged: ChatMessage[];
        try {
          rows =
            cursor === null
              ? await deps.api.fetchLatest(conversationId)
              : await deps.api.fetchSince(conversationId, cursor);
          merged = mergeMessages(state.messages, rows);
          // A removal of a loaded message happens at or after that message was saved, so the
          // oldest held message's time is a cursor that never misses one and needs no client clock.
          const oldest = merged[0];
          if (oldest) {
            const patches = await deps.api.fetchRemovedSince(conversationId, oldest.created_at);
            merged = applyRemovals(merged, patches);
          }
        } catch (error) {
          for (const id of pinged) pendingPings.add(id);
          const code = errorCodeOf(error);
          deps.onError?.({ source: 'load', code });
          if (active) set(loaded ? { errorCode: code } : { status: 'error', errorCode: code });
          continue;
        }
        if (!active) break;

        for (const row of rows) {
          if (!newestFetched || compareMessages(row, newestFetched) > 0) newestFetched = row;
        }
        // Re-merge: a send may have landed while the fetches were in flight.
        const messages = mergeMessages(state.messages, merged);
        // Nothing at all is also what someone with no access gets. Ask before reporting it, so
        // they are never shown an empty chat that looks real (plan decision D).
        const empty = messages.length === 0;
        if (empty) {
          await checkAccess();
          if (!active) break;
        }
        set(
          cursor === null
            ? { messages, status: 'ready', errorCode: null, hasOlder: rows.length === INITIAL_PAGE_SIZE }
            : { messages, status: 'ready', errorCode: null },
        );
        loaded = true;

        const held = new Set(messages.map((m) => m.id));
        if (!empty && pinged.some((id) => !held.has(id))) await checkAccess();
      } while (rerun && active);
    } finally {
      running = false;
    }
  }

  async function removeOnce(messageId: string): Promise<void> {
    set({ removing: [...state.removing, messageId] });
    try {
      const removed = await deps.api.removeMessage(messageId);
      // Patched from the returned row at once; the signal that follows finds nothing to change.
      const patch = { id: messageId, removed_at: removed.removed_at ?? '', removed_by_role: removed.removed_by_role };
      const messages =
        state.status !== 'unavailable' && patch.removed_at !== '' && patch.removed_by_role !== null
          ? applyRemovals(state.messages, [{ ...patch, removed_by_role: patch.removed_by_role }])
          : state.messages;
      set({ messages, removing: state.removing.filter((id) => id !== messageId) });
    } catch (error) {
      set({ removing: state.removing.filter((id) => id !== messageId) });
      const code = errorCodeOf(error);
      if (code === '42501') throw new RemoveMessageError('refused', code);
      // A refusal is expected behaviour and is not reported. Anything else (PGRST202 after a
      // deploy, 57014, 22P02, offline) is: by code only, never the error's text.
      deps.onError?.({ source: 'remove', code });
      throw new RemoveMessageError('network', code);
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
      onRemoved() {
        if (!current()) return;
        // Not added to pendingPings: the id may be outside the loaded window, and checkAccess
        // is for pings that should have been found.
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
      } catch (error) {
        // Cannot connect. The timer keeps the conversation current; nothing is lost.
        deps.onError?.({ source: 'join', code: errorCodeOf(error) });
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

    remove(messageId) {
      const inFlight = inFlightRemovals.get(messageId);
      if (inFlight) return inFlight;
      const call = removeOnce(messageId).finally(() => inFlightRemovals.delete(messageId));
      inFlightRemovals.set(messageId, call);
      return call;
    },
  };
}
